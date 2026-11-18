import { scheduleTrait, readSchedules, scheduleErrorDescription, scheduleResponseReport } from '../src/nest-schedules.js';
// Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE.
// Exercise cloud SET outcomes through the production routing method and real device commit boundary.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DATA_SOURCE } from '../src/consts.js';
import HomeKitDevice from '../src/HomeKitDevice/HomeKitDevice.js';

let source = await readFile(new URL('../src/system.js', import.meta.url), 'utf8');
let begin = source.indexOf('  async #set(');
let end = source.indexOf('  async #get(', begin);
assert.ok(begin !== -1 && end > begin, 'SET method boundaries must exist');

// Only cloud I/O and account/resource lookup are supplied by the test host.
let createHost = new Function(
  'connection',
  'rawData',
  'fetchWrapper',
  'DATA_SOURCE',
  'crypto',
  'USER_AGENT',
  'scheduleTrait',
  'readSchedules',
  'scheduleErrorDescription',
  'scheduleResponseReport',
  'return new class { climateWrites = new Map();' +
    '#connections = new Map([["account", connection]]); #rawData = rawData;' +
    'run(id, values) { return this.#set("account", id, values); }' +
    source.slice(begin, end) +
    '};',
);

function setup(source, response, options = {}) {
  let requests = [];
  let id = options.id ?? (source === DATA_SOURCE.GOOGLE ? 'DEVICE_TEST' : 'topaz.TEST');
  let connection = {
    authorised: true,
    referer: 'example.test',
    transport_url: 'https://example.test',
    token: 'test-token',
    grpcTransport: {
      command: async (...args) => {
        requests.push(args);
        return typeof response === 'function' ? response(...args) : response;
      },
    },
    ...options.connection,
  };
  let raw = { [id]: { source, value: { display_settings: {}, temperature_lock_settings: {} } } };
  let fetcher = Object.assign(
    async (...args) => {
      requests.push(args);
      let data = typeof response === 'function' ? await response(...args) : response;
      return { json: async () => data };
    },
    { POST: 'post' },
  );
  let host = createHost(
    options.missingConnection === true ? undefined : connection,
    raw,
    fetcher,
    DATA_SOURCE,
    globalThis.crypto,
    'test-agent',
    scheduleTrait,
    readSchedules,
    scheduleErrorDescription,
    scheduleResponseReport,
  );
  return { run: (values) => host.run(id, values), requests, raw, id };
}

HomeKitDevice.PLUGIN_NAME = 'system-set-test';
let nextSerial = 0;
function deviceFor(context, flow, values) {
  let device = new HomeKitDevice(
    undefined,
    { version: 2.7, hap: { uuid: { generate: (value) => value } } },
    {
      serialNumber: 'set-' + nextSerial++,
      manufacturer: 'Nest',
      model: 'Test',
      description: 'SET test',
      softwareVersion: '1.0.0',
      ...values,
    },
  );
  HomeKitDevice.message(device.uuid, HomeKitDevice.SET, (payload) => flow.run(payload));
  context.after(() => device.remove());
  return device;
}

for (let id of ['topaz.TEST']) {
  test('REST failure rejects SET without committing requested values: ' + id, async (context) => {
    let failure = new Error('HTTP 503');
    let flow = setup(
      DATA_SOURCE.NEST,
      () => {
        throw failure;
      },
      { id },
    );
    let key = 'ntp_green_led_enable';
    let device = deviceFor(context, flow, { [key]: false });
    await assert.rejects(device.set({ [key]: true }), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [failure]);
      return true;
    });
    assert.equal(flow.requests.length, 1);
    assert.equal(device.deviceData[key], false);
  });
}

for (let [id, response] of [
  ['topaz.TEST', { objects: [] }],
]) {
  test('REST application rejection propagates: ' + id, async () => {
    let flow = setup(DATA_SOURCE.NEST, response, { id });
    await assert.rejects(flow.run({ ntp_green_led_enable: true }), AggregateError);
  });
}

for (let command of [false, true]) {
  for (let response of [
    { status: 14, data: [] },
    { status: 14, data: [{ traitOperations: [{ progress: 'COMPLETE' }] }] },
    { status: 0, data: [] },
    { status: 0, data: [{ traitOperations: [{ progress: 'PENDING' }] }] },
    { status: 0, data: [{ traitOperations: [{ progress: 'COMPLETE', status: { code: 7 } }] }] },
  ]) {
    test(
      'Google SET rejects unsuccessful ' + (command === true ? 'command' : 'update') + ': ' + JSON.stringify(response),
      async (context) => {
        let flow = setup(DATA_SOURCE.GOOGLE, response);
        let initial = command === true ? { bolt_lock: false } : { temperature_scale: 'C' };
        let requested = command === true ? { bolt_lock: true } : { temperature_scale: 'F' };
        let device = deviceFor(context, flow, initial);
        await assert.rejects(device.set(requested), AggregateError);
        for (let [key, value] of Object.entries(initial)) {
          assert.equal(device.deviceData[key], value);
        }
      },
    );
  }
}

test('mixed Google outcomes attempt remaining fields and reject the whole local commit', async (context) => {
  let attempts = 0;
  let flow = setup(DATA_SOURCE.GOOGLE, () => ({
    status: attempts++ === 0 ? 14 : 0,
    data: [{ traitOperations: [{ progress: 'COMPLETE' }] }],
  }));
  let device = deviceFor(context, flow, { temperature_scale: 'C', temperature_lock: false });
  await assert.rejects(device.set({ temperature_scale: 'F', temperature_lock: true }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 1);
    return true;
  });
  assert.equal(attempts, 2);
  assert.equal(device.deviceData.temperature_scale, 'C');
  assert.equal(device.deviceData.temperature_lock, false);
});

for (let code of [undefined, 0]) {
  test('successful Google SET commits and accepts omitted protobuf zero status: ' + code, async (context) => {
    let flow = setup(DATA_SOURCE.GOOGLE, {
      status: 0,
      data: [{ traitOperations: [{ progress: 'COMPLETE', status: { code } }] }],
    });
    let device = deviceFor(context, flow, { temperature_scale: 'C' });
    await device.set({ temperature_scale: 'F' });
    assert.equal(device.deviceData.temperature_scale, 'F');
  });
}

test('successful REST SET still commits', async (context) => {
  let flow = setup(DATA_SOURCE.NEST, { objects: [{}] });
  let device = deviceFor(context, flow, { ntp_green_led_enable: false });
  await device.set({ ntp_green_led_enable: true });
  assert.equal(device.deviceData.ntp_green_led_enable, true);
});

for (let [reason, options] of [
  ['missing resource', {}],
  ['missing connection', { missingConnection: true }],
  ['unauthorised connection', { connection: { authorised: false } }],
  ['missing transport', { connection: { grpcTransport: undefined } }],
]) {
  test('unavailable connection or transport rejects SET: ' + reason, async () => {
    let flow = setup(DATA_SOURCE.GOOGLE, {}, options);
    if (reason === 'missing resource') {
      delete flow.raw[flow.id];
    }
    await assert.rejects(flow.run({ temperature_scale: 'F' }));
    assert.equal(flow.requests.length, 0);
  });
}




test('schedule writes use validated modes and inspect every batch result', async () => {
  const complete = {
    progress: 'COMPLETE',
    status: {
      code: 0,
    },
  };
  const flow = setup(DATA_SOURCE.GOOGLE, {
    status: 0,
    data: [{
      traitOperations: [complete, complete],
    }],
  });
  Object.assign(flow.raw[flow.id].value, {
    heat_schedule_settings: {
      name: 'Heat',
      type: 'SET_POINT_SCHEDULE_TYPE_HEAT',
      setpoints: {},
    },
    cool_schedule_settings: {
      name: 'Cool',
      type: 'SET_POINT_SCHEDULE_TYPE_COOL',
      setpoints: {},
    },
  });
  await flow.run({
    temperature_schedules: {
      heat: [{
        day: 1,
        time: 25200,
        heat: 21,
      }],
      cool: [],
    },
  });
  const request = flow.requests[0][3].batchUpdateStateRequest;
  assert.equal(request.length, 2);
  assert.deepEqual(request[0].stateMask.paths, ['setpoints']);
  assert.equal(request[0].state.value.setpoints[1].heatingTarget.value, 21);
  assert.equal(typeof request[0].state.value.setpoints[1].currentActorInfo.timeOfAction.seconds, 'number');
  assert.deepEqual(request[1].state.value.setpoints, {});
  assert.equal(request[1].state.value.name, 'Cool');
  const failure = setup(DATA_SOURCE.GOOGLE, {
    status: 0,
    data: [{
      traitOperations: [complete, {
        ...complete,
        status: {
          code: 7,
        },
      }],
    }],
  });
  Object.assign(failure.raw[failure.id].value, flow.raw[flow.id].value);
  await assert.rejects(failure.run({
    temperature_schedules: {
      heat: [],
      cool: [],
    },
  }), AggregateError);
});
test('Auto-Schedule writes only a reported learning trait and preserves explicit false', async () => {
  const flow = setup(DATA_SOURCE.GOOGLE, {
    status: 0,
    data: [{
      traitOperations: [{
        progress: 'COMPLETE',
      }],
    }],
  });
  await assert.rejects(flow.run({
    schedule_learning_enabled: false,
  }), AggregateError);
  assert.equal(flow.requests.length, 0);
  flow.raw[flow.id].value.schedule_learning_settings = {
    scheduleLearningEnabled: true,
  };
  await flow.run({
    schedule_learning_enabled: false,
  });
  const request = flow.requests[0][3].batchUpdateStateRequest[0];
  assert.equal(request.state.value.scheduleLearningEnabled, false);
  assert.deepEqual(request.stateMask.paths, ['schedule_learning_enabled']);
  await flow.run({ schedule_learning_enabled: true });
  const enabled = flow.requests[1][3].batchUpdateStateRequest[0];
  assert.equal(enabled.state.value.scheduleLearningEnabled, true);
  assert.deepEqual(enabled.stateMask.paths, ['schedule_learning_enabled']);
});

test('schedule update failures retain transport and operation codes with a redacted error description', async () => {
  const flow = setup(DATA_SOURCE.GOOGLE, {
    status: 0,
    data: [{ traitOperations: [{ progress: 'COMPLETE',
      status: { code: 7, message: 'Invalid field mask for DEVICE_TEST; Bearer private-secret' } }] }],
  });
  flow.raw[flow.id].value.schedule_learning_settings = { scheduleLearningEnabled: true };
  await assert.rejects(flow.run({ schedule_learning_enabled: false }), (error) => {
    assert.equal(error.errors[0].scheduleResponse.data[0].traitOperations[0].status.code, 7);
    assert.equal(error.errors[0].scheduleDiagnostic,
      'Google transport status: 0; operations: COMPLETE/7 (Invalid field mask for [redacted]; [credential redacted]).');
    return true;
  });
});

test('successful schedule responses remain available for confirmation-timeout diagnostics', async () => {
  const flow = setup(DATA_SOURCE.GOOGLE, { status: 0, data: [{ traitOperations: [{ progress: 'COMPLETE' }] }] });
  flow.raw[flow.id].value.schedule_learning_settings = { scheduleLearningEnabled: true };
  const result = await flow.run({ schedule_learning_enabled: false });
  assert.equal(result.scheduleResponses[0].status, 0);
  assert.equal(flow.requests[0][4].captureResponseMetadata, true);
});
