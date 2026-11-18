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
  scheduleErrorDescription,
  scheduleResponseReport,
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
      assert.equal(args[2].guard(), true);
      if (command) {
        return await command(...args);
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

test('local preference collection is bounded, optional and never writes Nest', async (t) => {
  const f = await fixture(t);
  await f.manager.observe('test', 22, 'room');
  assert.equal(f.manager.record('test').events.length, 1);
  await f.manager.observe('test', 22, 'compensation');
  await f.manager.observe('test', NaN, 'room');
  assert.equal(f.manager.record('test').events.length, 1);
  await f.manager.action(f.payload('learning', { value: false }));
  await f.manager.observe('test', 23, 'room');
  assert.equal(f.manager.record('test').events.length, 1);
  await assert.rejects(f.manager.action(f.payload('learning', { value: 'on' })), /Choose/);
  await f.manager.action(f.payload('learning', { value: true }));
  f.manager.record('test').events = Array.from({ length: 500 }, () => ({ at: Date.now(), value: 21, source: 'room', zone: 'UTC' }));
  await f.manager.observe('test', 22, 'manual');
  assert.ok(f.manager.record('test').events.length <= 500);
  delete f.data.schedule_time_zone;
  const count = f.manager.record('test').events.length;
  await f.manager.observe('test', 22, 'room');
  assert.equal(f.manager.record('test').events.length, count);
  assert.equal(f.calls.length, 0);
});

test('editing one mode preserves other modes and pending writes reject conflicting actions', async (t) => {
  const f = await fixture(t);
  f.data.native_schedules.modes.cool = [{ day: 1, time: 25200, cool: 25 }];
  await assert.rejects(f.manager.action(f.payload('save', { mode: 'heat', entries: [] })), /confirm/);
  await assert.rejects(f.manager.action(f.payload('save', { mode: 'range', entries: [],
    confirmation: 'save-temperature-schedule' })), /reported/);
  await f.manager.action(f.payload('save', { mode: 'heat', entries: [{ ...row, heat: 22 }],
    confirmation: 'save-temperature-schedule' }));
  assert.deepEqual(Object.keys(f.calls[0][1].temperature_schedules), ['heat']);
  await assert.rejects(f.manager.action(f.payload('auto', { value: false })), /previous/);
  await assert.rejects(f.manager.action(f.payload('acknowledge')), /Wait/);
  await f.manager.action(f.payload('check'));
  assert.equal(f.calls.length, 1);
  f.data.native_schedules.modes.heat = [{ ...row, heat: 22 }];
  assert.equal(f.manager.snapshot('test').pending, null);
  await f.manager.saving;
});

test('invalid commands and unavailable capability never send writes', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.manager.action(f.payload('unknown')), /Unsupported/);
  await assert.rejects(f.manager.action({ ...f.payload('auto'), serial: 'missing' }), /unavailable/);
  f.manager.busy.add('test');
  await assert.rejects(f.manager.action(f.payload('auto', { value: false })), /progress/);
  f.manager.busy.clear();
  f.data.native_schedules = { autoSchedule: null, modes: {} };
  assert.equal(await f.manager.ensureRulePolicy('test'), null);
  assert.match(f.manager.snapshot('test').message, /unavailable/);
  await assert.rejects(f.manager.action(f.payload('auto', { value: false })), /unavailable/);
  await assert.rejects(f.manager.action(f.payload('clear', { confirmation: 'clear-temperature-schedules' })), /No editable/);
  await assert.rejects(f.manager.action(f.payload('approve', { id: 'missing' })), /unavailable/);
  await assert.rejects(f.manager.action(f.payload('dismiss', { id: 'missing' })), /changed/);
  assert.equal(f.calls.length, 0);
});

test('corrupt saved preferences prevent automatic policy changes', async (t) => {
  const f = await fixture(t);
  for (const content of ['not json', JSON.stringify({ version: 2 }),
    JSON.stringify({ version: 1, records: { test: { events: [null] } } })]) {
    await fs.writeFile(f.manager.file, content);
    const manager = new NestSchedules(f.dashboard);
    await manager.start();
    assert.match(await manager.ensureRulePolicy('test'), /could not be read/);
    await assert.rejects(manager.action(f.payload('auto', { value: false })), /could not be read/);
  }
  assert.equal(f.calls.length, 0);
});

test('dismissed suggestions stay local and malformed or sparse evidence creates no suggestion', async (t) => {
  const f = await fixture(t);
  f.manager.record('test').events = [2, 9, 16].map((day) => ({
    at: Date.parse('2026-11-' + String(day).padStart(2, '0') + 'T15:10:00Z'),
    value: 22, source: 'room', zone: 'America/Los_Angeles',
  }));
  const suggestion = f.manager.snapshot('test').suggestions[0];
  await f.manager.action(f.payload('dismiss', { id: suggestion.id }));
  assert.equal(f.manager.snapshot('test').suggestions.length, 0);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(learningSuggestions([], null), []);
  assert.deepEqual(learningSuggestions([{ at: Date.now(), value: 21, zone: 'bad/zone', source: 'room' }], 'bad/zone'), []);
  assert.throws(() => validateEntries('bad-mode', []));
  assert.throws(() => scheduleTrait('heat', [], { type: 'OTHER' }));
  assert.deepEqual(readSchedules({ heat_schedule_settings: { type: 'SET_POINT_SCHEDULE_TYPE_HEAT',
    setpoints: { invalid: { secondsInDay: -1 } } } }).modes, {});
});

test('learning preferences and approved-suggestion state persist across restart with configured time zone', async (t) => {
  const f = await fixture(t);
  f.dashboard.automation = { deviceOptions: [{ serialNumber: 'test', scheduleTimeZone: 'UTC' }] };
  await f.manager.observe('test', 22, 'room');
  f.manager.record('test').dismissed = ['reviewed-suggestion'];
  await f.manager.persist();
  const restored = new NestSchedules(f.dashboard);
  await restored.start();
  assert.equal(restored.snapshot('test').zone, 'UTC');
  assert.equal(restored.record('test').events.length, 1);
  assert.deepEqual(restored.record('test').dismissed, ['reviewed-suggestion']);
});

test('distinct repeated weekday preferences produce separate chronological suggestions', () => {
  const events = [2, 9, 16, 3, 10, 17].map((day) => ({
    at: Date.parse('2026-11-' + String(day).padStart(2, '0') + 'T15:10:00Z'),
    value: 21, source: 'room', zone: 'America/Los_Angeles',
  }));
  const result = learningSuggestions(events, 'America/Los_Angeles', Date.parse('2026-11-18T12:00:00Z'));
  assert.deepEqual(result.map((entry) => entry.day), [1, 2]);
});

test('schedule failures retain safe response details after timeout and restart', async (t) => {
  const failure = Object.assign(new Error('private response'), {
    scheduleDiagnostic: 'Google transport status: 0; operations: COMPLETE/7.',
    scheduleResponse: { status: 0, data: [{ code: 7, details: { reason: 'denied' } }] },
  });
  const f = await fixture(t, () => {
    throw new AggregateError([failure], 'Rejected');
  });
  const warnings = [];
  f.dashboard.log = { warn: (message) => warnings.push(message) };
  await assert.rejects(f.manager.action(f.payload('auto', { value: false })), /COMPLETE\/7/);
  f.advance(61000);
  assert.match(f.manager.snapshot('test').message, /Auto-Schedule Off request failed.*COMPLETE\/7/);
  assert.equal(f.manager.snapshot('test').message.includes('has not confirmed'), false);
  assert.equal(warnings.length, 2);
  assert.equal(warnings[0].includes('private response'), false);
  const restarted = new NestSchedules(f.dashboard, () => Date.parse('2026-11-18T13:00:00Z'));
  await restarted.start();
  assert.match(restarted.snapshot('test').message, /COMPLETE\/7/);
  assert.equal(restarted.snapshot('test').lastResponse.responses[0].data[0].details.reason, 'denied');
  f.data.native_schedules.autoSchedule = false;
  assert.equal(restarted.snapshot('test').pending, null);
});

test('error descriptions retain useful explanations and redact credentials and identifiers', () => {
  assert.equal(scheduleErrorDescription(undefined), 'No error description supplied');
  assert.equal(scheduleErrorDescription('   '), 'No error description supplied');
  assert.equal(scheduleErrorDescription('Invalid field mask: scheduleLearningEnabled'), 'Invalid field mask: scheduleLearningEnabled');
  const source = 'Bad field for DEVICE_TEST user@example.com https://example.test/private Bearer secret ' +
    'token=private {"password":"secret with spaces"} account-known 123e4567-e89b-12d3-a456-426614174000';
  const result = scheduleErrorDescription(source, ['account-known', null, 'x']);
  for (const secret of ['DEVICE_TEST', 'user@example.com', 'example.test', 'secret', 'private', 'account-known', '123e4567']) {
    assert.equal(result.includes(secret), false);
  }
  assert.equal(scheduleErrorDescription('z'.repeat(200)), '[opaque value redacted]');
  assert.ok(scheduleErrorDescription('long explanation '.repeat(500)).length <= 412);
  assert.equal(scheduleErrorDescription('line\nnext\tpart'), 'line next part');
});

test('complete response reports preserve frames, operation details and metadata without secrets', () => {
  const response = { status: 0, headers: { 'set-cookie': 'private', ':status': 200 },
    data: [{ traitOperations: [{ status: { code: 13, message: 'unsupported field',
      details: [{ type_url: 'type.googleapis.com/google.rpc.BadRequest', value: { field: 'stateMask', reason: 'invalid' } }] },
    traitRequest: { resourceId: 'device-private', requestId: 'request-private' } }] }, { extra: true }],
    trailers: { 'grpc-status': '0', 'opaque-bin': 'c2VjcmV0' }, token: 'private', missing: undefined, binary: Buffer.from('private') };
  const report = scheduleResponseReport(response);
  assert.equal(report.data.length, 2);
  assert.equal(report.data[0].traitOperations[0].status.details[0].value.field, 'stateMask');
  assert.equal(report.headers[':status'], 200);
  assert.equal(report.headers['set-cookie'], '[redacted]');
  assert.equal(report.missing, '[not supplied]');
  assert.match(report.trailers['opaque-bin'], /binary metadata omitted/);
  assert.equal(report.binary.length, 7);
  assert.equal(JSON.stringify(report).includes('private'), false);
  const circular = {};
  circular.self = circular;
  assert.equal(scheduleResponseReport(circular).self, '[circular reference]');
  let deep = {};
  for (let n = 0; n < 35; n++) {
    deep = { nested: deep };
  }
  assert.match(JSON.stringify(scheduleResponseReport(deep)), /diagnostic limit reached/);
  assert.match(JSON.stringify(scheduleResponseReport(Array(10001).fill(null))), /diagnostic limit reached/);
});

test('successful write responses persist after timeout and external confirmation', async (t) => {
  const f = await fixture(t, () => ({ scheduleResponses: [{ status: 0, data: [{ operations: ['COMPLETE'] }] }] }));
  await f.manager.action(f.payload('auto', { value: false }));
  f.advance(61000);
  assert.equal(f.manager.snapshot('test').lastResponse.responses[0].status, 0);
  f.data.native_schedules.autoSchedule = false;
  assert.equal(f.manager.snapshot('test').pending, null);
  assert.equal(f.manager.snapshot('test').lastResponse.value, false);
  await f.manager.saving;
});

test('an open heat draft survives Auto-Schedule and cooling changes without overwriting cooling', async (t) => {
  const f = await fixture(t);
  const draft = f.payload('save', { mode: 'heat', entries: [{ ...row, heat: 22 }],
    scheduleRevision: f.manager.snapshot('test').scheduleRevisions.heat, confirmation: 'save-temperature-schedule' });
  await f.manager.action(f.payload('auto', { value: false }));
  f.data.native_schedules.autoSchedule = false;
  assert.equal(f.manager.snapshot('test').pending, null);
  f.data.native_schedules.modes.cool = [{ day: 2, time: 36000, cool: 25 }];
  assert.notEqual(draft.expected, f.manager.snapshot('test').expected);
  await f.manager.action(draft);
  assert.deepEqual(f.calls[1][1], { temperature_schedules: { heat: [{ ...row, heat: 22 }] } });
});

test('same-mode schedule changes reject scoped drafts and malformed revisions before sending', async (t) => {
  const f = await fixture(t);
  const draft = f.payload('save', { mode: 'heat', entries: [{ ...row, heat: 22 }],
    scheduleRevision: f.manager.snapshot('test').scheduleRevisions.heat, confirmation: 'save-temperature-schedule' });
  f.data.native_schedules.modes.heat = [{ ...row, heat: 20 }];
  await assert.rejects(f.manager.action(draft), /draft is kept/);
  await assert.rejects(f.manager.action({ ...draft, scheduleRevision: undefined }), /changed/);
  await assert.rejects(f.manager.action({ ...draft, mode: 'cool' }), /changed/);
  delete f.data.native_schedules.modes.heat;
  await assert.rejects(f.manager.action(draft), /changed/);
  assert.equal(f.calls.length, 0);
});

test('queued schedule guard tolerates unrelated changes but rejects edited-mode changes and disconnection', async (t) => {
  const f = await fixture(t, (_id, _values, origin) => {
    f.data.native_schedules.autoSchedule = false;
    assert.equal(origin.guard(), true);
    f.data.native_schedules.modes.cool = [];
    assert.equal(origin.guard(), true);
    f.data.native_schedules.modes.heat = [{ ...row, heat: 20 }];
    assert.equal(origin.guard(), false);
    f.data.native_schedules.modes.heat = [row];
    f.data.online = false;
    assert.equal(origin.guard(), false);
  });
  await f.manager.action(f.payload('save', { mode: 'heat', entries: [{ ...row, heat: 22 }],
    scheduleRevision: f.manager.snapshot('test').scheduleRevisions.heat, confirmation: 'save-temperature-schedule' }));
});
