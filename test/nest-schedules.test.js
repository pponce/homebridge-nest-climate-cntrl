import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  NestSchedules,
  validateEntries,
  readSchedules,
  scheduleTrait,
  learningSuggestions,
  schedulesMatch,
} from '../src/nest-schedules.js';
const row = {
  day: 1,
  time: 25200,
  heat: 21,
};
const raw = (entries = [row]) => ({
  schedule_learning_settings: {
    scheduleLearningEnabled: true,
  },
  heat_schedule_settings: scheduleTrait('heat', entries, {
    type: 'SET_POINT_SCHEDULE_TYPE_HEAT',
    name: 'Heat',
  }),
});
async function fixture(t, command) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nest-schedules-'));
  t.after(() => fs.rm(directory, {
    recursive: true,
    force: true,
  }));
  const calls = [];
  let now = Date.parse('2026-11-18T12:00:00Z');
  const data = {
    native_schedules: readSchedules(raw()),
    online: true,
    schedule_time_zone: 'America/Los_Angeles',
  };
  const dashboard = {
    directory,
    accounts: () => [{
      id: 'account',
      authorised: true,
      observing: true,
    }],
    devices: new Map([
      ['test', {
        type: 'Thermostat',
        id: 'DEVICE_TEST',
        account: 'account',
        data,
      }],
    ]),
    refreshFeedback: () => true,
    command: async (...args) => {
      calls.push(args);
      if (command) {
        await command(...args);
      }
    },
  };
  const manager = new NestSchedules(dashboard, () => now);
  await manager.start();
  const payload = (action, extra = {}) => ({
    serial: 'test',
    expected: manager.snapshot('test').expected,
    action,
    ...extra,
  });
  return {
    manager,
    dashboard,
    calls,
    data,
    payload,
    advance: (ms) => {
      now += ms;
    },
  };
}
test('schedule read/write roundtrip preserves mode and empty schedules, rejects unknown data', () => {
  assert.deepEqual(readSchedules(raw()).modes.heat, [row]);
  assert.deepEqual(readSchedules(raw([])).modes.heat, []);
  assert.equal(scheduleTrait('heat', [], raw().heat_schedule_settings).name, 'Heat');
  assert.deepEqual(readSchedules({
    heat_schedule_settings: {
      type: 'UNRECOGNIZED',
    },
  }).modes, {});
  assert.equal(readSchedules({}).autoSchedule, null);
  assert.equal(readSchedules({
    schedule_learning_settings: {},
  }).autoSchedule, false);
  assert.throws(() => validateEntries('heat', [row, row]), /unique/);
  assert.throws(() => validateEntries('heat', [{
    ...row,
    heat: NaN,
  }]));
  assert.throws(() => validateEntries('range', [{
    ...row,
    cool: 21.5,
  }]));
  assert.throws(() => validateEntries('heat', [{
    ...row,
    day: -1,
  }]));
  assert.throws(() => validateEntries('heat', [{
    ...row,
    time: 86400,
  }]));
});
test('default policy disables Nest learning once, waits for feedback, and survives restart', async (t) => {
  const f = await fixture(t);
  assert.match(await f.manager.ensureRulePolicy('test'), /Waiting/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0][1], {
    schedule_learning_enabled: false,
  });
  await f.manager.ensureRulePolicy('test');
  assert.equal(f.calls.length, 1);
  const restarted = new NestSchedules(f.dashboard);
  await restarted.start();
  assert.ok(restarted.snapshot('test').pending);
  f.data.native_schedules.autoSchedule = false;
  assert.equal(await f.manager.ensureRulePolicy('test'), null);
  await f.manager.saving;
});
test('enabling requires warning acknowledgement and explicit override survives policy checks', async (t) => {
  const f = await fixture(t);
  f.data.native_schedules.autoSchedule = false;
  await assert.rejects(f.manager.action(f.payload('auto', {
    value: true,
  })), /Confirm/);
  await f.manager.action(f.payload('auto', {
    value: true,
    confirmation: 'enable-nest-learning',
  }));
  assert.equal(await f.manager.ensureRulePolicy('test'), null);
  assert.equal(f.calls.length, 1);
});
test('stale drafts, disconnected writes, and missing confirmations do not send', async (t) => {
  const f = await fixture(t);
  const payload = f.payload('save', {
    mode: 'heat',
    entries: [],
    confirmation: 'save-temperature-schedule',
  });
  f.data.native_schedules.modes.heat.push({
    ...row,
    time: 36000,
  });
  await assert.rejects(f.manager.action(payload), /changed/);
  await assert.rejects(f.manager.action(f.payload('clear')), /Confirm/);
  f.data.online = false;
  await assert.rejects(f.manager.action(f.payload('clear', {
    confirmation: 'clear-temperature-schedules',
  })), /Reconnect/);
  assert.equal(f.calls.length, 0);
});
test('clear covers reported modes, preserves pending uncertainty, confirms from observed state', async (t) => {
  const f = await fixture(t);
  f.data.native_schedules.modes.cool = [{
    day: 1,
    time: 25200,
    cool: 25,
  }];
  await f.manager.action(f.payload('clear', {
    confirmation: 'clear-temperature-schedules',
  }));
  assert.deepEqual(f.calls[0][1], {
    temperature_schedules: {
      heat: [],
      cool: [],
    },
  });
  assert.ok(f.manager.snapshot('test').pending);
  f.advance(61000);
  assert.match(f.manager.snapshot('test').message, /not confirmed/);
  f.data.native_schedules.modes = {
    heat: [],
    cool: [],
  };
  assert.equal(f.manager.snapshot('test').pending, null);
  await f.manager.saving;
});
test('transport failure retains intent and does not repeatedly disable or clear', async (t) => {
  const f = await fixture(t, () => {
    throw new Error('Connection lost');
  });
  await f.manager.ensureRulePolicy('test');
  f.advance(61000);
  await f.manager.ensureRulePolicy('test');
  assert.equal(f.calls.length, 1);
  await f.manager.action(f.payload('acknowledge'));
  assert.match(await f.manager.ensureRulePolicy('test'), /Review/);
  assert.equal(f.calls.length, 1);
});
test('learning uses repeated intentional room choices, not compensation or old/other-zone events', () => {
  const zone = 'America/Los_Angeles';
  const now = Date.parse('2026-11-18T12:00:00Z');
  const events = [2, 9, 16].map((d) => ({
    at: Date.parse('2026-11-' + String(d).padStart(2, '0') + 'T15:10:00Z'),
    value: 21,
    source: 'room',
    zone,
  }));
  const suggestions = learningSuggestions(events, zone, now);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].day, 1);
  assert.equal(suggestions[0].time, 25200);
  assert.equal(learningSuggestions(events.map((e) => ({
    ...e,
    source: 'compensation',
  })), zone, now).length, 0);
  assert.equal(learningSuggestions(events, 'UTC', now).length, 0);
  assert.equal(learningSuggestions([events[0], events[0], events[0]], zone, now).length, 0);
  assert.equal(learningSuggestions([...events.slice(0, 2), {
    ...events[2],
    value: 23,
  }], zone, now).length, 0);
});
test('approved suggestion merges only one heating entry and needs confirmation before dismissal', async (t) => {
  const f = await fixture(t);
  const record = f.manager.record('test');
  record.events = [2, 9, 16].map((d) => ({
    at: Date.parse('2026-11-' + String(d).padStart(2, '0') + 'T15:10:00Z'),
    value: 22,
    source: 'room',
    zone: 'America/Los_Angeles',
  }));
  f.data.native_schedules.modes.heat.push({
    day: 2,
    time: 36000,
    heat: 20,
  });
  const suggestion = f.manager.snapshot('test').suggestions[0];
  await f.manager.action(f.payload('approve', {
    id: suggestion.id,
  }));
  assert.deepEqual(f.calls[0][1].temperature_schedules.heat, [{
    ...row,
    heat: 22,
  }, {
    day: 2,
    time: 36000,
    heat: 20,
  }]);
  assert.equal(f.manager.snapshot('test').suggestions.length, 1);
  f.data.native_schedules.modes.heat = f.calls[0][1].temperature_schedules.heat;
  assert.equal(f.manager.snapshot('test').suggestions.length, 0);
  await f.manager.saving;
});

test('confirmation tolerates native temperature quantization but not an extra entry or different time', () => {
  assert.equal(schedulesMatch([{
    ...row,
    heat: 22.2,
  }], [{
    ...row,
    heat: 22.2222222,
  }]), true);
  assert.equal(schedulesMatch([{
    ...row,
    heat: 22.5,
  }], [{
    ...row,
    heat: 22.2222222,
  }]), false);
  assert.equal(schedulesMatch([row], []), false);
  assert.equal(schedulesMatch([{
    ...row,
    time: 25320,
  }], [row]), false);
});

test('cached schedule traits cannot confirm a write or bypass learning policy after reconnect', async (t) => {
  const f = await fixture(t);
  const device = f.dashboard.devices.get('test');
  device.feedback = {
    generation: 2,
    schedules: {
      schedule_learning_settings: {
        generation: 1,
        receivedAt: 1,
      },
      heat_schedule_settings: {
        generation: 1,
        receivedAt: 1,
      },
    },
  };
  assert.equal(f.manager.snapshot('test').autoSchedule, null);
  assert.deepEqual(f.manager.snapshot('test').modes, {});
  assert.match(await f.manager.ensureRulePolicy('test'), /current Nest/);
  assert.equal(f.calls.length, 0);
  const at = Date.parse('2026-11-18T12:00:00Z');
  device.feedback.schedules = {
    schedule_learning_settings: {
      generation: 2,
      receivedAt: at,
    },
    heat_schedule_settings: {
      generation: 2,
      receivedAt: at,
    },
  };
  await f.manager.ensureRulePolicy('test');
  f.data.native_schedules.autoSchedule = false;
  device.feedback.schedules.schedule_learning_settings.receivedAt = at - 1;
  assert.ok(f.manager.snapshot('test').pending);
  device.feedback.schedules.schedule_learning_settings.receivedAt = at + 1;
  assert.equal(f.manager.snapshot('test').pending, null);
  await f.manager.saving;
});
