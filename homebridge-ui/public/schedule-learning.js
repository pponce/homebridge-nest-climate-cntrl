// Shared settings contract for the local heating-schedule learner. Temperature differences use Celsius.
export const LEARNING_DEFAULTS = Object.freeze({
  dayGrouping: 'sameWeekday',
  minimumDays: 3,
  historyDays: 42,
  recencyHalfLifeDays: 14,
  timeToleranceMinutes: 30,
  timeStepMinutes: 30,
  temperatureTolerance: 0.6,
  minimumAgreementPercent: 75,
});

export const LEARNING_FIELDS = Object.freeze({
  minimumDays: { title: 'Minimum observed days', min: 2, max: 12, step: 1,
    help: 'Require this many separate local dates with similar intentional choices. Multiple changes on one date count once. Higher values need more evidence.' },
  historyDays: { title: 'History window (days)', min: 7, max: 90, step: 1,
    help: 'Only choices within this many days contribute. A shorter window adapts sooner but has fewer examples. History is retained for at most 90 days and 500 choices.' },
  recencyHalfLifeDays: { title: 'Recent-choice half-life (days)', min: 1, max: 90, step: 1,
    help: 'A choice this many days old has half the influence of a new choice. Smaller values adapt faster to a changed routine. The minimum observed-day requirement still applies.' },
  timeToleranceMinutes: { title: 'Time similarity (minutes)', min: 5, max: 120, step: 1,
    help: 'The maximum time span of choices treated as one routine. For example, 7:20 and 7:40 can match with a 30-minute span. Separate morning and evening routines stay separate.' },
  timeStepMinutes: { title: 'Schedule time rounding (minutes)', min: 5, max: 60, step: 5,
    help: 'Round the representative time to this interval. This changes the scheduled time, not preheating. Nest True Radiant manages when heating starts.' },
  temperatureTolerance: { title: 'Temperature similarity', min: 0.1, max: 2, step: 0.1,
    help: 'The maximum temperature spread within a matching group. The proposed target is one of your actual choices, selected using recent-choice weights.' },
  minimumAgreementPercent: { title: 'Required agreement (%)', min: 60, max: 100, step: 1,
    help: 'Similar choices must account for this percentage of the time group’s weighted evidence. Conflicting choices reduce agreement; recent choices count more.' },
});

export function learningSettingsError(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !Object.hasOwn(LEARNING_DEFAULTS, key))) return 'Review the schedule-learning settings.';
  if (value.dayGrouping !== undefined && !['sameWeekday', 'weekdayWeekend', 'daily'].includes(value.dayGrouping)) {
    return 'Choose separate weekdays, weekdays and weekends, or every day for schedule learning.';
  }
  for (const [key, field] of Object.entries(LEARNING_FIELDS)) {
    const n = value[key];
    if (n !== undefined && (!Number.isFinite(n) || n < field.min || n > field.max ||
        Math.abs(n / field.step - Math.round(n / field.step)) > 1e-7)) {
      return field.title + ' must be from ' + field.min + ' to ' + field.max + ' in steps of ' + field.step + '.';
    }
  }
  return null;
}

export function learningSettings(value) {
  return { ...LEARNING_DEFAULTS, ...(learningSettingsError(value) ? {} : value) };
}
