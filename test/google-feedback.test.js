// Google Observe regression checks through the production ingestion method, mapper and dashboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { importSource } from './helpers/import-source.js';
import { fixtures, config, home } from './helpers/discovery-fixtures.js';
import { DATA_SOURCE } from '../src/consts.js';
import { ClimateDashboard } from '../src/climate-dashboard.js';
import { ClimateAutomation } from '../src/climate-automation.js';
import { climateFeedback } from '../src/google-feedback.js';
import { sensorSources } from '../homebridge-ui/public/sensor-preview.js';

const { processRawData } = await importSource(new URL('../src/plugins/thermostat.js', import.meta.url));
const system = await readFile(new URL('../src/system.js', import.meta.url), 'utf8');
// Execute the exact production Observe method with injected transport/schema/timer boundaries.
// HomeKit lifecycle is replaced by the real thermostat mapper + real dashboard update.
const method = system.slice(system.indexOf('  async #observeGoogleAPI(uuid) {'), system.indexOf('  async #processData(uuid,'));
const makeHost = new Function(
  'path', '__dirname', 'getProtoTypes', 'DATA_SOURCE', 'HomeKitDevice', 'GrpcTransport',
  'clearTimeout', 'setTimeout', 'API_STREAM_LOOP_INTERVAL', 'API_STREAM_RETRY_MAX', 'API_STREAM_RETRY_INITIAL',
  'connection', 'raw', 'dashboard', 'map', 'config', 'climateFeedback',
  'return new class { #connections = new Map([["A",connection]]); #rawData = raw; #trackedDevices = new Map();' +
  ' config = { options: { useGoogleAPI: true } }; dashboard = dashboard;' +
  ' async #processData(uuid, changes) { for (const [serial,result] of Object.entries(map(undefined,raw,config,undefined,changes))) {' +
  ' dashboard.update(serial,"Thermostat",result.data,uuid,' +
  'climateFeedback(raw.DEVICE_TEST,"Thermostat",connection.observeGeneration,result.data)); } }' +
  ' start(){ return this.#observeGoogleAPI("A"); }' + method + '}',
);

async function setup() {
  let consume;
  let finish;
  const connection = { authorised: true, climateObserving: false, grpcTransport: {
    observe: (...args) => {
      consume = args.at(-1);
      return new Promise(resolve => {
        finish = resolve;
      });
    },
  } };
  const dashboard = new ClimateDashboard('/unused-audit', { accounts: () => [
    { id: 'A', authorised: connection.authorised, observing: connection.climateObserving },
  ] });
  const value = structuredClone(fixtures.find(f => f.name === 'thermostat').value);
  Object.assign(value, { hvac_control: { hvacState: {} }, eco_mode_state: { ecoMode: 'ECO_MODE_INACTIVE' },
    remote_comfort_sensing_settings: { activeRcsSelection: { rcsSourceType: 'RCS_SOURCE_TYPE_BACKPLATE' } },
    target_temperature_settings: { enabled: { value: true }, targetTemperature: {
      setpointType: 'SET_POINT_TYPE_HEAT', heatingTarget: { value: 20 } } } });
  const raw = { STRUCTURE_HOME: structuredClone(home) };
  const host = makeHost(path, '.', () => [{ fullName: '.nest.trait.Fixture' }], DATA_SOURCE, {},
    { STATUS: { UNAUTHENTICATED: 16 } }, () => {}, () => 1, 1000, 60000, 5000,
    connection, raw, dashboard, processRawData, config, climateFeedback);
  const trait = (label, values, state = 'ACCEPTED', version = 1) => ({ traitId: {
    resourceId: 'DEVICE_TEST', traitLabel: label }, stateTypes: [state], monotonicVersion: version,
  patch: { values: structuredClone(values) } });
  await host.start();
  await consume({ traitStates: Object.entries(value).map(([label, values]) => trait(label, values)) });
  return { raw, dashboard, connection, host, trait, callback: consume, send: message => consume(message),
    finish: async () => {
      finish({ status: 14 });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('label-only reconnect messages cannot clear readiness; fresh critical traits restore control', async () => {
  const f = await setup();
  await f.finish();
  assert.equal(f.dashboard.devices.get('TEST').needsUpdate, true);
  await f.host.start();
  await f.send({ traitStates: [f.trait('label', { label: 'Renamed' })] });
  const device = f.dashboard.devices.get('TEST');
  assert.equal(device.needsUpdate, true);
  assert.equal(device.data.current_temperature, 21);
  assert.equal(ClimateAutomation.prototype.connected.call({ live: f.dashboard.snapshot() }, device), false);
  for (const [label, values] of Object.entries(f.raw.DEVICE_TEST.value)) {
    await f.send({ traitStates: [f.trait(label, values)] });
  }
  assert.equal(f.dashboard.devices.get('TEST').needsUpdate, false);
  await f.finish();
});

test('empty temperature invalidates a reading; omitted traits preserve it and valid feedback recovers', async () => {
  const f = await setup();
  await f.send({ traitStates: [f.trait('current_temperature', {})] });
  assert.deepEqual(f.raw.DEVICE_TEST.value.current_temperature, {});
  const device = f.dashboard.devices.get('TEST');
  assert.equal(device.data.current_temperature, undefined);
  assert.equal(device.data.physical_temperature, undefined);
  const source = sensorSources(f.dashboard.snapshot(), {}).find(s => s.id === 'nest:DEVICE_TEST');
  assert.equal(source.available, false);
  assert.equal(source.temperature, undefined);
  await f.send({ traitStates: [f.trait('current_temperature', { temperatureValue: { temperature: { value: 22 } } })] });
  const received = f.dashboard.devices.get('TEST').feedback.temperatureReceivedAt;
  await f.send({ traitStates: [f.trait('label', { label: 'Name' })] });
  assert.equal(f.dashboard.devices.get('TEST').data.physical_temperature, 22);
  assert.equal(f.dashboard.devices.get('TEST').feedback.temperatureReceivedAt, received);
  await f.finish();
});

test('accepted feedback remains compatible and exposes provenance without claiming device confirmation', async () => {
  const f = await setup();
  await f.send({ traitStates: [f.trait('target_temperature_settings', { enabled: { value: true },
    targetTemperature: { setpointType: 'SET_POINT_TYPE_HEAT', heatingTarget: { value: 22 } } }, 'ACCEPTED', 2)] });
  const lease = { kind: 'temperature', pending: true, expected: 22, before: 20 };
  const state = { lastAction: { status: 'accepted' } };
  const result = ClimateAutomation.prototype.observe.call({ now: () => 12345 }, 'T', lease,
    f.dashboard.devices.get('TEST').data.target_temperature_low, state);
  assert.equal(result, true);
  assert.equal(lease.pending, false);
  assert.equal(state.lastAction.status, 'confirmed');
  assert.equal(state.lastAction.message, 'Matching heating target reported by Google.');
  assert.deepEqual(f.dashboard.devices.get('TEST').feedback.target.stateTypes, ['ACCEPTED']);
  assert.equal(f.dashboard.devices.get('TEST').feedback.target.monotonicVersion, '2');
  await f.finish();
});

test('version counters are retained without assuming cross-state ordering', async () => {
  const f = await setup();
  const temperature = value => ({ temperatureValue: { temperature: { value } } });
  await f.send({ traitStates: [f.trait('current_temperature', temperature(23), 'ACCEPTED', 20)] });
  await f.send({ traitStates: [f.trait('current_temperature', temperature(19), 'CONFIRMED', 10)] });
  assert.equal(f.dashboard.devices.get('TEST').data.current_temperature, 19);
  assert.equal(f.raw.DEVICE_TEST.feedback.current_temperature.monotonicVersion, '10');
  assert.deepEqual(f.raw.DEVICE_TEST.feedback.current_temperature.stateTypes, ['CONFIRMED']);
  await f.finish();
});

for (const [type, traits, data, field] of [
  ['TemperatureSensor', ['current_temperature', 'last_updated_beacon'], { current_temperature: 20, online: true }, 'current_temperature'],
  ['HomeAway', ['structure_mode'], { occupancy: true }, 'occupancy'],
]) {
  test(type + ' requires current generation traits and clears explicit unknown values', () => {
    const raw = { value: {}, feedback: Object.fromEntries(traits.map(name => [name, { generation: 1, receivedAt: 100 }])) };
    assert.equal(climateFeedback(raw, type, 2, data).ready, false);
    for (const meta of Object.values(raw.feedback)) {
      meta.generation = 2;
    }
    const status = climateFeedback(raw, type, 2, {});
    assert.equal(status.ready, true);
    assert.ok(status.invalidFields.includes(field));
    const dashboard = new ClimateDashboard('/unused-test', { accounts: () => [] });
    dashboard.update('S', type, data, 'A');
    dashboard.update('S', type, {}, 'A', status);
    assert.equal(dashboard.devices.get('S').data[field], undefined);
    dashboard.update('S', type, data, 'A', climateFeedback(raw, type, 2, data));
    assert.equal(dashboard.devices.get('S').data[field], data[field]);
  });
}

test('a retired callback on the same transport cannot refresh a replacement generation', async () => {
  const f = await setup();
  await f.finish();
  await f.host.start();
  await f.callback({ traitStates: [f.trait('current_temperature', {
    temperatureValue: { temperature: { value: 30 } },
  })] });
  assert.equal(f.connection.climateObserving, false);
  assert.equal(f.dashboard.devices.get('TEST').needsUpdate, true);
  assert.equal(f.dashboard.devices.get('TEST').data.physical_temperature, 21);
  await f.finish();
});


test('schedule feedback preserves the trait generation and receipt time separately from cached values', () => {
  const raw = { value: {}, feedback: {
    schedule_learning_settings: { generation: 2, receivedAt: 1234, stateTypes: ['ACCEPTED'] },
    heat_schedule_settings: { generation: 1, receivedAt: 1000, stateTypes: ['CONFIRMED'] },
  } };
  const result = climateFeedback(raw, 'Thermostat', 2, {});
  assert.equal(result.schedules.schedule_learning_settings.generation, 2);
  assert.equal(result.schedules.schedule_learning_settings.receivedAt, 1234);
  assert.equal(result.schedules.heat_schedule_settings.generation, 1);
  assert.equal(result.schedules.cool_schedule_settings, undefined);
});
