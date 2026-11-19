import crypto from 'node:crypto';
import { learningSettings, learningSettingsError } from '../homebridge-ui/public/schedule-learning.js';

const DAY = 86400000;
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const weightedMedian = (points, field) => {
  const sorted = [...points].sort((a, b) => a[field] - b[field] || a.at - b.at);
  const half = points.reduce((sum, p) => sum + p.weight, 0) / 2;
  let total = 0;
  return sorted.find((p) => (total += p.weight) >= half)[field];
};

export function learningSuggestions(events, zone, now = Date.now(), options) {
  if (!zone || learningSettingsError(options)) {
    return [];
  }
  const settings = learningSettings(options);
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit',
      day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    return [];
  }
  const groups = new Map();
  // Only explicit preferences are evidence. Silence and automatically selected targets are not preferences.
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || !Number.isFinite(event.value) || event.value < 9 || event.value > 32 ||
        !Number.isFinite(event.at) || event.at > now || now - event.at > settings.historyDays * DAY ||
        event.zone !== zone || !['room', 'manual'].includes(event.source) ||
        (event.mode !== undefined && event.mode !== 'heat')) {
      continue;
    }
    const local = Object.fromEntries(formatter.formatToParts(event.at).map((p) => [p.type, p.value]));
    const day = days.indexOf(local.weekday);
    const group = settings.dayGrouping === 'daily' ? 'daily' : settings.dayGrouping === 'weekdayWeekend' ?
      day === 0 || day === 6 ? 'weekend' : 'weekday' : String(day);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group).push({ ...event, day, date: local.year + '-' + local.month + '-' + local.day,
      minute: Number(local.hour) * 60 + Number(local.minute), weight: 2 ** (-(now - event.at) / DAY / settings.recencyHalfLifeDays) });
  }
  const result = new Map();
  for (const [group, points] of groups) {
    points.sort((a, b) => a.minute - b.minute || a.at - b.at || a.value - b.value);
    const clusters = [];
    for (const point of points) {
      let cluster = clusters.at(-1);
      if (!cluster || point.minute - cluster[0].minute > settings.timeToleranceMinutes) {
        cluster = []; clusters.push(cluster);
      }
      cluster.push(point);
    }
    for (const cluster of clusters) {
      const dates = new Map();
      for (const point of cluster) {
        if (!dates.has(point.date) || dates.get(point.date).at <= point.at) {
          dates.set(point.date, point);
        }
      }
      const observations = [...dates.values()];
      if (observations.length < settings.minimumDays) {
        continue;
      }
      const total = observations.reduce((sum, p) => sum + p.weight, 0);
      let best;
      for (const low of observations) {
        const matching = observations.filter((p) => p.value >= low.value && p.value - low.value <= settings.temperatureTolerance + 1e-8);
        const weight = matching.reduce((sum, p) => sum + p.weight, 0);
        const latest = Math.max(...matching.map((p) => p.at));
        if (!best || weight > best.weight || weight === best.weight && latest > best.latest) {
          best = { matching, weight, latest };
        }
      }
      if (best.matching.length < settings.minimumDays || best.weight / total + 1e-8 < settings.minimumAgreementPercent / 100) {
        continue;
      }
      const heat = weightedMedian(best.matching, 'value');
      const minute = weightedMedian(best.matching, 'minute');
      // Do not round late-night observations into a different day.
      const lastMinute = Math.floor(1439 / settings.timeStepMinutes) * settings.timeStepMinutes;
      const time = Math.min(lastMinute, Math.round(minute / settings.timeStepMinutes) * settings.timeStepMinutes) * 60;
      const targetDays = group === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : group === 'weekday' ? [1, 2, 3, 4, 5] :
        group === 'weekend' ? [0, 6] : [Number(group)];
      for (const day of targetDays) {
        const row = { day, time, heat };
        const suggestion = { id: hash([zone, settings, row, observations.map((p) => [p.at, p.value]).sort((a, b) => a[0] - b[0])]),
          ...row, observations: best.matching.length, totalObservations: observations.length,
          agreementPercent: Math.round(best.weight / total * 100), latestAt: best.latest, dayGrouping: settings.dayGrouping };
        const key = day + '/' + time;
        const prior = result.get(key);
        // Rounding can merge distinct routines. Never produce conflicting entries at one schedule time.
        if (!prior || prior.latestAt < suggestion.latestAt) {
          result.set(key, suggestion);
        }
      }
    }
  }
  return [...result.values()].sort((a, b) => a.day - b.day || a.time - b.time);
}
