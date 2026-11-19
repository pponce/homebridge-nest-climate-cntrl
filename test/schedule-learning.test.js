import test from 'node:test';
import assert from 'node:assert/strict';
import { learningSuggestions } from '../src/schedule-learning.js';
import { LEARNING_DEFAULTS, learningSettings, learningSettingsError } from '../homebridge-ui/public/schedule-learning.js';

const now = Date.parse('2026-11-19T12:00:00Z');
const zone = 'UTC';
const choice = (date, time = '07:10', value = 21, extra = {}) => ({
  at: Date.parse(date + 'T' + time + ':00Z'), value, source: 'room', zone, ...extra,
});
const weekly = (value = 21) => ['2026-11-02', '2026-11-09', '2026-11-16'].map((date) => choice(date, '07:10', value));

test('defaults retain separate-weekday learning and strict configurable bounds', () => {
  assert.deepEqual(learningSettings(), LEARNING_DEFAULTS);
  assert.equal(learningSettingsError(undefined), null);
  assert.deepEqual(learningSettings({ minimumDays: 4 }), { ...LEARNING_DEFAULTS, minimumDays: 4 });
  for (const invalid of [null, [], '3', { unknown: 1 }, { dayGrouping: 'week' }, { minimumDays: 1 },
    { minimumDays: 3.5 }, { historyDays: 91 }, { recencyHalfLifeDays: 0 }, { timeToleranceMinutes: NaN },
    { timeStepMinutes: 17 }, { temperatureTolerance: 3 }, { minimumAgreementPercent: '75' }]) {
    assert.ok(learningSettingsError(invalid));
    assert.deepEqual(learningSuggestions(weekly(), zone, now, invalid), []);
  }
  assert.equal(learningSuggestions(weekly(), zone, now, { minimumDays: 4 }).length, 0);
});

test('nearby choices across a clock-slot boundary form one routine', () => {
  const events = weekly().map((event, index) => ({ ...event, at: event.at + [19, 21, 20][index] * 60000 }));
  const [suggestion] = learningSuggestions(events, zone, now);
  assert.equal(suggestion.time, 7.5 * 3600);
  assert.equal(suggestion.observations, 3);
  assert.equal(suggestion.agreementPercent, 100);
  assert.equal(learningSuggestions(events, zone, now, { timeStepMinutes: 5 })[0].time, 7.5 * 3600);
  assert.deepEqual(learningSuggestions([...events].reverse(), zone, now), [suggestion]);
});

test('one local date counts once and the final choice in the routine wins', () => {
  const first = choice('2026-11-16');
  assert.deepEqual(learningSuggestions([first, first, { ...first, at: first.at + 60000 }], zone, now), []);
  const events = weekly().flatMap((event) => [event, { ...event, at: event.at + 60000, value: 23 }]);
  assert.equal(learningSuggestions(events, zone, now)[0].heat, 23);
  assert.equal(learningSuggestions(events, zone, now)[0].observations, 3);
});

test('recent repeated changes can replace an older preference without inventing a target', () => {
  const events = ['2026-10-15', '2026-10-16', '2026-10-17'].map((date) => choice(date, '07:10', 20));
  events.push(...['2026-11-16', '2026-11-17', '2026-11-18'].map((date) => choice(date, '07:10', 22.22)));
  const options = { dayGrouping: 'daily', recencyHalfLifeDays: 7 };
  const suggestions = learningSuggestions(events, zone, now, options);
  assert.equal(suggestions.length, 7);
  assert.ok(suggestions.every((s) => s.heat === 22.22 && s.observations === 3 && s.totalObservations === 6));
  assert.equal(learningSuggestions(events, zone, now, { ...options, recencyHalfLifeDays: 90 }).length, 0);
  assert.equal(learningSuggestions(events.slice(0, -1), zone, now, options).length, 0, 'A strong recent minority still needs three dates');
});

test('agreement and temperature similarity control tolerance for conflicting evidence', () => {
  const events = weekly();
  events.unshift(choice('2026-10-26', '07:10', 24));
  assert.equal(learningSuggestions(events, zone, now).length, 1);
  assert.equal(learningSuggestions(events, zone, now, { minimumAgreementPercent: 100 }).length, 0);
  const mixed = weekly().map((event, index) => ({ ...event, value: [21, 21.5, 22][index] }));
  assert.equal(learningSuggestions(mixed, zone, now).length, 0);
  assert.equal(learningSuggestions(mixed, zone, now, { temperatureTolerance: 1 }).length, 1);
});

test('day grouping is explicit and keeps weekday and weekend evidence separate', () => {
  const weekdays = ['2026-11-16', '2026-11-17', '2026-11-18'].map((date) => choice(date));
  assert.equal(learningSuggestions(weekdays, zone, now).length, 0);
  assert.deepEqual(learningSuggestions(weekdays, zone, now, { dayGrouping: 'weekdayWeekend' }).map((s) => s.day), [1, 2, 3, 4, 5]);
  const weekend = [choice('2026-11-14', '09:00', 23), choice('2026-11-15', '09:00', 23)];
  const suggestions = learningSuggestions([...weekdays, ...weekend], zone, now, { dayGrouping: 'weekdayWeekend', minimumDays: 2 });
  assert.ok(suggestions.filter((s) => [0, 6].includes(s.day)).every((s) => s.heat === 23));
  assert.equal(suggestions.length, 7);
});

test('time span separates routines and rounding never creates duplicate or next-day entries', () => {
  const morning = weekly();
  const evening = morning.map((event) => ({ ...event, at: event.at + 12 * 3600000, value: 19 }));
  assert.equal(learningSuggestions([...morning, ...evening], zone, now).length, 2);
  const late = morning.map((event) => ({ ...event, at: event.at + (16 * 60 + 49) * 60000 }));
  const [suggestion] = learningSuggestions(late, zone, now, { timeStepMinutes: 55 });
  assert.equal(suggestion.day, 1);
  assert.ok(suggestion.time < 86400);
  assert.equal(suggestion.time % (55 * 60), 0);
  const close = morning.map((event) => ({ ...event, at: event.at + 10 * 60000, value: 19 }));
  const rounded = learningSuggestions([...morning, ...close], zone, now, { timeToleranceMinutes: 5, timeStepMinutes: 60 });
  assert.equal(rounded.length, 1);
  assert.equal(rounded[0].heat, 19);
});

test('history window, invalid dates, other zones and nonhuman sources cannot create evidence', () => {
  const events = weekly();
  assert.equal(learningSuggestions(events, zone, now, { historyDays: 7 }).length, 0);
  assert.equal(learningSuggestions(events, 'not/a-zone', now).length, 0);
  assert.equal(learningSuggestions(events, null, now).length, 0);
  assert.equal(learningSuggestions(null, zone, now).length, 0);
  for (const extra of [{ at: now + 1 }, { at: NaN }, { value: Infinity }, { value: 5 }, { zone: 'Europe/London' },
    { source: 'compensation' }, { source: 'schedule' }, { source: 'eco' }, { mode: 'cool' }]) {
    assert.equal(learningSuggestions(events.map((event) => ({ ...event, ...extra })), zone, now).length, 0);
  }
  assert.equal(learningSuggestions(events.map((event) => ({ ...event, mode: 'heat', source: 'manual' })), zone, now).length, 1);
  assert.equal(learningSuggestions([null, ...events], zone, now).length, 1);
});

test('DST repeated clock hours do not count twice and the same local routine survives a DST change', () => {
  const dstZone = 'America/Los_Angeles';
  const events = ['2026-10-25T14:10:00Z', '2026-11-01T15:10:00Z', '2026-11-08T15:10:00Z']
    .map((date) => ({ at: Date.parse(date), value: 21, source: 'room', zone: dstZone }));
  assert.equal(learningSuggestions(events, dstZone, now)[0].time, 7 * 3600);
  const repeated = ['2026-11-01T08:10:00Z', '2026-11-01T09:10:00Z'].map((date) => ({ ...events[0], at: Date.parse(date) }));
  assert.equal(learningSuggestions(repeated, dstZone, now, { minimumDays: 2 }).length, 0);
});
