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

function learnedChoices(f) {
  // These transport tests update a previously confirmed plugin-learned entry.
  f.manager.record('test').learnedEntries = structuredClone(f.data.native_schedules.modes.heat);
  f.manager.record('test').events = [2, 9, 16].map((day) => ({
    at: Date.parse('2026-11-' + String(day).padStart(2, '0') + 'T15:10:00Z'),
    value: 22, source: 'room', zone: 'America/Los_Angeles',
  }));
}

async function enableAutomaticLearning(f) {
  await f.manager.action(f.payload('autoApply', { value: true, confirmation: 'enable-auto-apply-learning' }));
  await f.manager.applying;
}

test('existing user entries require approval and learned ownership survives confirmation and restart', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  delete f.manager.record('test').learnedEntries;
  f.data.native_schedules.autoSchedule = false;
  await enableAutomaticLearning(f);
  assert.equal(f.calls.length, 0);
  const suggestion = f.manager.snapshot('test').suggestions[0];
  assert.equal(suggestion.requiresApproval, true);
  await assert.rejects(f.manager.action(f.payload('apply', { id: suggestion.id })), /existing user schedule/);
  await f.manager.action(f.payload('approve', { id: suggestion.id }));
  assert.equal(f.manager.record('test').learnedEntries, undefined, 'Ownership waits for Nest confirmation');
  f.data.native_schedules.modes.heat = f.calls[0][1].temperature_schedules.heat;
  f.manager.snapshot('test');
  await f.manager.saving;
  const restarted = new NestSchedules(f.dashboard, f.manager.now);
  await restarted.start();
  assert.deepEqual(restarted.record('test').learnedEntries, [{ ...row, heat: 22 }]);
  await f.manager.action(f.payload('save', { mode: 'heat', entries: [{ ...row, heat: 22.5 }],
    confirmation: 'save-temperature-schedule' }));
  f.data.native_schedules.modes.heat = [{ ...row, heat: 22.5 }];
  f.manager.snapshot('test');
  assert.deepEqual(f.manager.record('test').learnedEntries, [], 'A manually edited schedule has no automatically owned entries');
  await f.manager.saving;
});

test('a learned routine can move in time without leaving its previous entry behind', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  f.manager.record('test').events.forEach((event) => {
    event.at += 20 * 60000;
  });
  f.data.native_schedules.autoSchedule = false;
  await enableAutomaticLearning(f);
  assert.deepEqual(f.calls[0][1].temperature_schedules.heat, [{ ...row, time: row.time + 1800, heat: 22 }]);
  await f.manager.saving;
});

test('live settings update evidence requirements, fail closed when invalid, and guard queued writes', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  f.dashboard.automation = { deviceOptions: [{ serialNumber: 'TEST', scheduleLearning: { minimumDays: 4 } }] };
  assert.equal(f.manager.snapshot('test').suggestions.length, 0);
  f.dashboard.automation.deviceOptions[0].scheduleLearning = { minimumDays: 3 };
  assert.equal(f.manager.snapshot('test').suggestions.length, 1);
  f.dashboard.automation.deviceOptions[0].scheduleLearning = { minimumDays: 1 };
  await enableAutomaticLearning(f);
  assert.equal(f.calls.length, 0);
  assert.equal(f.manager.snapshot('test').autoApplyStatus, 'attention');
  const before = f.manager.record('test').events.length;
  await f.manager.observe('test', 23);
  assert.equal(f.manager.record('test').events.length, before);

  const queued = await fixture(t, (_id, _values, options) => {
    queued.dashboard.automation.deviceOptions[0].scheduleLearning.minimumDays = 4;
    assert.equal(options.guard(), false);
    throw new Error('Changed learning settings');
  });
  learnedChoices(queued);
  queued.data.native_schedules.autoSchedule = false;
  queued.dashboard.automation = { deviceOptions: [{ serialNumber: 'test', scheduleLearning: { minimumDays: 3 } }] };
  await enableAutomaticLearning(queued);
  assert.ok(queued.manager.record('test').pending.failure);
});

test('retained history supports longer windows without learning from automatic events', async (t) => {
  const f = await fixture(t);
  const record = f.manager.record('test');
  record.events = [50, 95].map((days) => ({ at: f.manager.now() - days * 86400000,
    value: 21, zone: 'America/Los_Angeles', source: 'room' }));
  await f.manager.observe('test', 22, 'compensation');
  assert.equal(record.events.length, 2);
  await f.manager.observe('test', 22, 'room');
  assert.equal(record.events.length, 2);
  assert.ok(record.events.every((event) => f.manager.now() - event.at <= 90 * 86400000));
});

test('automatic learning is opt-in, disables Nest learning first and waits for confirmation', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  assert.equal(f.manager.snapshot('test').autoApply, false);
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.manager.action(f.payload('autoApply', { value: true })), /confirm/);
  await assert.rejects(f.manager.action(f.payload('autoApply', { value: 'yes' })), /Choose/);
  await enableAutomaticLearning(f);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0][1], { schedule_learning_enabled: false });
  assert.equal(f.manager.record('test').allowNestLearning, false);
  await f.manager.applyLearned();
  f.advance(61000);
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 1, 'An unconfirmed Off request is not replayed or bypassed');
  f.data.native_schedules.autoSchedule = false;
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1][1].temperature_schedules.heat[0].heat, 22);
  assert.ok(f.manager.snapshot('test').pending);
  await f.manager.saving;
});

test('automatic learning preserves other entries and modes, confirms once, and survives restart', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  f.data.native_schedules.autoSchedule = false;
  const unrelated = { day: 2, time: 36000, heat: 19 };
  f.data.native_schedules.modes.heat.push(unrelated);
  f.data.native_schedules.modes.cool = [{ day: 1, time: 36000, cool: 25 }];
  await enableAutomaticLearning(f);
  const expected = [{ ...row, heat: 22 }, unrelated];
  assert.deepEqual(f.calls[0][1], { temperature_schedules: { heat: expected } });
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 1);
  f.data.native_schedules.modes.heat = expected;
  await f.manager.applyLearned();
  assert.equal(f.manager.snapshot('test').pending, null);
  assert.equal(f.manager.snapshot('test').suggestions.length, 0);
  await f.manager.saving;
  const restarted = new NestSchedules(f.dashboard, f.manager.now);
  await restarted.start();
  assert.equal(restarted.snapshot('test').autoApply, true);
  await restarted.applyLearned();
  assert.equal(f.calls.length, 1);
  assert.equal(f.data.native_schedules.modes.cool[0].cool, 25);
});

test('learning can coexist with Nest learning but their schedule events never train it', async (t) => {
  const f = await fixture(t);
  for (const source of ['schedule', 'nest-auto', 'compensation', 'eco', 'unknown']) {
    await f.manager.observe('test', 23, source);
  }
  f.data.native_schedules.modes.heat = [{ ...row, heat: 23 }];
  f.manager.snapshot('test');
  await f.manager.applyLearned();
  assert.equal(f.manager.record('test').events.length, 0);
  await f.manager.observe('test', 22, 'room');
  await f.manager.observe('test', 22, 'manual');
  assert.equal(f.manager.record('test').events.length, 2);
  assert.equal(f.calls.length, 0);
  assert.equal(f.data.native_schedules.autoSchedule, true);
});

test('disabling learning disables automatic application; reenabling learning requires a new opt-in', async (t) => {
  const f = await fixture(t);
  f.data.native_schedules.autoSchedule = false;
  await enableAutomaticLearning(f);
  await f.manager.action(f.payload('learning', { value: false }));
  assert.equal(f.manager.snapshot('test').autoApply, false);
  await assert.rejects(f.manager.action(f.payload('autoApply', {
    value: true, confirmation: 'enable-auto-apply-learning',
  })), /Enable learning/);
  await f.manager.action(f.payload('learning', { value: true }));
  assert.equal(f.manager.snapshot('test').autoApply, false);
  await enableAutomaticLearning(f);
  await f.manager.action(f.payload('auto', { value: true, confirmation: 'enable-nest-learning' }));
  assert.equal(f.manager.snapshot('test').autoApply, false, 'Explicit Nest On disables plugin automatic application');
  assert.equal(f.manager.snapshot('test').learning, true);
  assert.equal(f.manager.record('test').allowNestLearning, true);
  f.data.native_schedules.autoSchedule = true;
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 1);
  await f.manager.saving;
});

for (const reason of ['disconnected', 'unknown learning', 'no heat schedule', 'no time zone', 'learning off', 'stopped', 'load error']) {
  test('automatic application waits when ' + reason, async (t) => {
    const f = await fixture(t);
    learnedChoices(f);
    f.manager.record('test').autoApply = true;
    f.data.native_schedules.autoSchedule = false;
    if (reason === 'disconnected') {
      f.data.online = false;
    } else if (reason === 'unknown learning') {
      f.data.native_schedules.autoSchedule = null;
    } else if (reason === 'no heat schedule') {
      delete f.data.native_schedules.modes.heat;
    } else if (reason === 'no time zone') {
      delete f.data.schedule_time_zone;
    } else if (reason === 'learning off') {
      f.manager.record('test').learning = false;
    } else if (reason === 'stopped') {
      await f.manager.stop();
    } else {
      f.manager.loadError = 'Schedule preferences could not be read.';
    }
    assert.ok(f.manager.autoApplyBlock('test', f.manager.snapshot('test')));
    await f.manager.applyLearned();
    assert.equal(f.calls.length, 0);
  });
}

test('automatic application skips an existing matching entry without a native write', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  f.data.native_schedules.autoSchedule = false;
  f.data.native_schedules.modes.heat = [{ ...row, heat: 22 }];
  await enableAutomaticLearning(f);
  assert.equal(f.calls.length, 0);
  assert.equal(f.manager.snapshot('test').suggestions.length, 0);
});

test('aging and new evidence preserve externally edited entries until explicit approval', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  f.manager.record('test').events.unshift({ at: Date.parse('2026-10-26T14:10:00Z'),
    value: 22, source: 'room', zone: 'America/Los_Angeles' });
  f.data.native_schedules.autoSchedule = false;
  await enableAutomaticLearning(f);
  f.data.native_schedules.modes.heat = f.calls[0][1].temperature_schedules.heat;
  f.manager.snapshot('test');
  await f.manager.saving;
  f.data.native_schedules.modes.heat = [{ ...row, heat: 20 }];
  f.advance(21 * 86400000);
  assert.equal(f.manager.snapshot('test').suggestions.length, 1);
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 1);
  const suggestion = f.manager.snapshot('test').suggestions[0];
  await assert.rejects(f.manager.action(f.payload('apply', { id: suggestion.id })), /existing user schedule/);
  f.manager.record('test').events.push({ at: Date.parse('2026-12-07T15:10:00Z'),
    value: 22, source: 'room', zone: 'America/Los_Angeles' });
  await f.manager.applyLearned();
  assert.equal(f.calls.length, 1);
  const revised = f.manager.snapshot('test').suggestions[0];
  assert.equal(revised.requiresApproval, true);
  await f.manager.action(f.payload('approve', { id: revised.id }));
  assert.equal(f.calls.length, 2);
});

test('failed automatic writes stop, retain uncertainty and do not replay after acknowledgement or restart', async (t) => {
  const f = await fixture(t, () => {
    throw new Error('offline');
  });
  learnedChoices(f);
  f.data.native_schedules.autoSchedule = false;
  await enableAutomaticLearning(f);
  assert.match(f.manager.snapshot('test').autoApplyMessage, /stopped/);
  assert.ok(f.manager.snapshot('test').pending.failure);
  const restarted = new NestSchedules(f.dashboard, f.manager.now);
  await restarted.start();
  await restarted.applyLearned();
  assert.equal(f.calls.length, 1);
  f.advance(61000);
  await f.manager.action(f.payload('acknowledge'));
  await f.manager.action(f.payload('autoApply', { value: false }));
  await enableAutomaticLearning(f);
  assert.equal(f.calls.length, 1);
});

test('late confirmation of a failed automatic request clears its block without replaying it', async (t) => {
  const f = await fixture(t, () => {
    throw new Error('late reply');
  });
  learnedChoices(f);
  f.data.native_schedules.autoSchedule = false;
  await enableAutomaticLearning(f);
  f.data.native_schedules.modes.heat = f.calls[0][1].temperature_schedules.heat;
  await f.manager.applyLearned();
  assert.equal(f.manager.record('test').autoApplyError, undefined);
  assert.equal(f.calls.length, 1);
  await f.manager.saving;
});

test('queued automatic writes recheck consent, schedule, zone, connection and Nest learning', async (t) => {
  for (const change of ['consent', 'schedule', 'zone', 'connection', 'nest']) {
    const f = await fixture(t, async (_id, _values, options) => {
      if (change === 'consent') {
        await f.manager.action(f.payload('autoApply', { value: false }));
      } else if (change === 'schedule') {
        f.data.native_schedules.modes.heat = [];
      } else if (change === 'zone') {
        f.data.schedule_time_zone = 'UTC';
      } else if (change === 'connection') {
        f.data.online = false;
      } else {
        f.data.native_schedules.autoSchedule = true;
      }
      assert.equal(options.guard(), false);
      throw new Error('queued write canceled');
    });
    learnedChoices(f);
    f.data.native_schedules.autoSchedule = false;
    await enableAutomaticLearning(f);
    assert.ok(f.manager.record('test').pending.failure);
  }
});

test('automatic processing is serialized and shutdown cancels a queued policy change', async (t) => {
  let release;
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture(t, async (_id, _values, options) => {
    entered();
    await wait;
    assert.equal(options.guard(), false);
    throw new Error('shutdown');
  });
  f.manager.record('test').autoApply = true;
  const first = f.manager.applyLearned();
  assert.equal(f.manager.applyLearned(), first);
  await ready;
  const stopped = f.manager.stop();
  release();
  await stopped;
  assert.equal(f.calls.length, 1);
  assert.ok(f.manager.record('test').pending.failure, 'The queued policy write is canceled at shutdown');
});

test('preference persistence failure rolls back consent and sends no command', async (t) => {
  const f = await fixture(t);
  t.mock.method(f.manager, 'persist', async () => {
    throw new Error('disk unavailable');
  });
  await assert.rejects(enableAutomaticLearning(f), /disk unavailable/);
  assert.equal(f.manager.snapshot('test').autoApply, false);
  assert.equal(f.calls.length, 0);
});

test('new preference fields are validated while legacy records retain manual approval', async (t) => {
  const f = await fixture(t);
  const legacy = { allowNestLearning: false, learning: true, events: [] };
  for (const invalid of [{ autoApply: 'yes' }, { autoApplyError: false }, { autoHandled: [] },
    { autoHandled: { invalid: 'date' } }, { pending: { action: 'auto', at: 1, value: false, autoApply: 'yes' } }]) {
    await fs.writeFile(f.manager.file, JSON.stringify({ version: 1, records: { test: { ...legacy, ...invalid } } }));
    const manager = new NestSchedules(f.dashboard);
    await manager.start();
    assert.ok(manager.loadError);
  }
  await fs.writeFile(f.manager.file, JSON.stringify({ version: 1, records: { test: legacy } }));
  const manager = new NestSchedules(f.dashboard);
  await manager.start();
  assert.equal(manager.loadError, undefined);
  assert.equal(manager.snapshot('test').autoApply, false);
  await assert.rejects(manager.action({ serial: 'test', action: 'apply', expected: manager.snapshot('test').expected }), /Off/);
});

test('fixed rule pauses learning and automatic application without changing saved preferences', async (t) => {
  const f = await fixture(t);
  learnedChoices(f);
  f.data.native_schedules.autoSchedule = false;
  const record = f.manager.record('test');
  record.learning = true;
  record.autoApply = true;
  let fixed = true;
  f.dashboard.automation = { temperaturePolicy: () => fixed ? { id: 'rooms', name: 'Room average', targetMode: 'fixed' } : null };
  let model = f.manager.snapshot('test');
  assert.equal(model.learningPaused, true);
  assert.equal(model.learning, true);
  assert.equal(model.autoApply, true);
  assert.match(model.autoApplyMessage, /Paused by fixed-temperature rule/);
  const count = record.events.length;
  await f.manager.observe('test', 24, 'room');
  await f.manager.observe('test', 24, 'manual');
  await f.manager.applyLearned();
  assert.equal(record.events.length, count);
  assert.equal(f.calls.length, 0);
  for (const action of ['learning', 'autoApply', 'auto']) {
    await assert.rejects(f.manager.action(f.payload(action, { value: true,
      confirmation: action === 'auto' ? 'enable-nest-learning' : 'enable-auto-apply-learning' })), /fixed-temperature rule/);
  }
  await assert.rejects(f.manager.action(f.payload('approve', { id: model.suggestions[0].id })), /fixed-temperature rule/);
  await f.manager.persist();
  const restarted = new NestSchedules(f.dashboard, f.manager.now);
  await restarted.start();
  assert.equal(restarted.snapshot('test').learningPaused, true);
  assert.equal(restarted.snapshot('test').autoApply, true);
  await restarted.applyLearned();
  assert.equal(f.calls.length, 0);
  fixed = false;
  model = restarted.snapshot('test');
  assert.equal(model.learningPaused, false);
  await restarted.applyLearned();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].temperature_schedules.heat[0].heat, 22);
});

test('fixed rule overrides explicit Nest learning permission and still requires confirmed Off', async (t) => {
  const f = await fixture(t);
  f.manager.record('test').allowNestLearning = true;
  f.dashboard.automation = { temperaturePolicy: () => ({ id: 'rooms', name: 'Fixed', targetMode: 'fixed' }) };
  assert.match(await f.manager.ensureRulePolicy('test', true), /Waiting/);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0][1], { schedule_learning_enabled: false });
  await f.manager.ensureRulePolicy('test', true);
  assert.equal(f.calls.length, 1);
  f.data.native_schedules.autoSchedule = false;
  assert.equal(await f.manager.ensureRulePolicy('test', true), null);
  assert.equal(f.manager.snapshot('test').learningPaused, true);
  assert.equal(f.manager.snapshot('test').pending, null);
  assert.equal(f.data.native_schedules.modes.heat.length, 1);
});

test('queued Nest learning and approved schedule writes cannot bypass a newly selected fixed rule', async (t) => {
  for (const action of ['auto', 'approve', 'apply']) {
    const f = await fixture(t);
    learnedChoices(f);
    f.data.native_schedules.autoSchedule = false;
    const record = f.manager.record('test');
    record.autoApply = true;
    record.learning = true;
    let fixed = false;
    f.dashboard.automation = { temperaturePolicy: () => fixed ? { id: 'fixed', targetMode: 'fixed' } : null };
    let guarded;
    f.dashboard.command = async (_id, _values, origin) => {
      fixed = true;
      guarded = origin.guard();
      throw new Error('Fixture queue cancelled');
    };
    await assert.rejects(f.manager.action(f.payload(action, { value: true, confirmation: 'enable-nest-learning',
      id: f.manager.snapshot('test').suggestions[0].id })));
    assert.equal(guarded, false);
    assert.equal(f.manager.snapshot('test').learningPaused, true);
    assert.ok(f.manager.snapshot('test').pending, 'Uncertain request remains visible for review');
  }
});

test('saved learning options can be turned off during a fixed rule and remain off afterward', async (t) => {
  const f = await fixture(t);
  f.manager.record('test').autoApply = true;
  f.dashboard.automation = { temperaturePolicy: () => ({ targetMode: 'fixed', name: 'Fixed' }) };
  await f.manager.action(f.payload('autoApply', { value: false }));
  await f.manager.action(f.payload('learning', { value: false }));
  delete f.dashboard.automation;
  assert.equal(f.manager.snapshot('test').learning, false);
  assert.equal(f.manager.snapshot('test').autoApply, false);
});
