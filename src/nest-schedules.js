// Native schedule validation and preference learning. Temperatures are stored in Celsius.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { learningSuggestions } from './schedule-learning.js';
import { learningSettings, learningSettingsError } from '../homebridge-ui/public/schedule-learning.js';
export { learningSuggestions } from './schedule-learning.js';
import {
  scheduleTimeZone,
} from '../homebridge-ui/public/climate-utils.js';

// Error descriptions are diagnostic text, never raw response objects or credentials.
export function scheduleErrorDescription(message, secrets = [], limit = 400) {
  if (typeof message !== 'string' || !message.trim()) {
    return 'No error description supplied';
  }
  let text = message;
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) {
      text = text.split(secret).join('[redacted]');
    }
  }
  text = text
    .replace(/(?:Bearer|Basic)\s+[^\s,;]+/gi, '[credential redacted]')
    .replace(/(?:access_token|refresh_token|authorization|password|cookie|token)\s*[:=]\s*[^\s,;]+/gi, '[credential redacted]')
    .replace(/"(?:access_token|refresh_token|authorization|password|cookie|token)"\s*:\s*"[^"]*"/gi, '[credential redacted]')
    .replace(/https?:\/\/[^\s]+/gi, '[URL redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
    .replace(/\b(?:DEVICE|STRUCTURE|USER)_[A-Za-z0-9._:-]+/g, '[identifier redacted]')
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, '[identifier redacted]')
    .replace(/[A-Za-z0-9_+./=-]{40,}/g, '[opaque value redacted]')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return text.length > limit ? text.slice(0, limit) + ' [truncated]' : text;
}

// Preserve the decoded response shape, including all frames and operations.
export function scheduleResponseReport(response, secrets = []) {
  let count = 0;
  const seen = new WeakSet();
  const visit = (value, key = '', depth = 0) => {
    if (++count > 10000 || depth > 30) {
      return '[diagnostic limit reached]';
    }
    if (/-bin$/i.test(key)) {
      return '[binary metadata omitted; see decodedStatusDetails when available]';
    }
    if (/token|authorization|cookie|password|secret|credential|resourceId|requestId|serial|email|accountId/i.test(key)) {
      return '[redacted]';
    }
    if (typeof value === 'string') {
      if (value === '') {
        return value;
      }
      if (key === 'type_url' || key === '@type') {
        return value.replace(/[^a-zA-Z0-9_./-]/g, '').slice(0, 300);
      }
      return scheduleErrorDescription(value, secrets, 65536);
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value !== 'object') {
      return '[not supplied]';
    }
    if (seen.has(value)) {
      return '[circular reference]';
    }
    seen.add(value);
    if (Buffer.isBuffer(value) || value instanceof Uint8Array || value.type === 'Buffer') {
      return { binary: '[redacted: undecoded bytes]', length: value.length ?? value.data?.length };
    }
    if (Array.isArray(value)) {
      return value.map((entry) => visit(entry, key, depth + 1));
    }
    const result = {};
    for (const [field, entry] of Object.entries(value)) {
      Object.defineProperty(result, field, { value: visit(entry, field, depth + 1), enumerable: true });
    }
    return result;
  };
  return visit(response);
}

export const SCHEDULE_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
export const SCHEDULE_MODES = ['heat', 'cool', 'range'];
const temperature = (n) => Number.isFinite(n) && n >= 9 && n <= 32;
export function validateEntries(mode, entries) {
  if (!SCHEDULE_MODES.includes(mode) || !Array.isArray(entries) || entries.length > 140) {
    throw new Error('Choose a schedule mode and no more than 20 entries per day.');
  }

  const seen = new Set();
  const days = Array(7).fill(0);
  return entries.map((entry) => {
    if (!entry || Object.keys(entry).some((key) => !['day', 'time', 'heat', 'cool'].includes(key)) ||
      !Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6 ||
      !Number.isInteger(entry.time) || entry.time < 0 || entry.time >= 86400 || entry.time % 60 ||
      (mode !== 'cool' && !temperature(entry.heat)) || (mode !== 'heat' && !temperature(entry.cool)) ||
      (mode === 'range' && entry.cool - entry.heat < 1.5 - 1e-8)) {
      throw new Error(
        'Use valid days, minute times and targets from 9–32°C (48.2–89.6°F); keep range targets at least 1.5°C apart.');
    }
    const key = entry.day + '/' + entry.time;
    if (seen.has(key) || ++days[entry.day] > 20) {
      throw new Error('Use unique times and no more than 20 entries per day.');
    }
    seen.add(key);
    return {
      day: entry.day,
      time: entry.time,
      ...(mode !== 'cool' ? {
        heat: entry.heat,
      } : {}),
      ...(mode !== 'heat' ? {
        cool: entry.cool,
      } : {}),
    };
  }).sort((a, b) => a.day - b.day || a.time - b.time);
}

export function readSchedules(raw) {
  const modes = {};
  for (const mode of SCHEDULE_MODES) {
    const trait = raw?.[mode + '_schedule_settings'];
    if (!trait || trait.type !== 'SET_POINT_SCHEDULE_TYPE_' + mode.toUpperCase()) {
      continue;
    }
    try {
      modes[mode] = validateEntries(mode, Object.values(trait.setpoints ?? {}).map((point) => ({
        day: SCHEDULE_DAYS.indexOf(point.dayOfWeek?.replace('DAY_OF_WEEK_', '')),
        time: point.secondsInDay ?? 0,
        ...(mode !== 'cool' ? {
          heat: point.heatingTarget?.value,
        } : {}),
        ...(mode !== 'heat' ? {
          cool: point.coolingTarget?.value,
        } : {}),
      })));
    } catch {
      /* Unknown schemas are not editable. Never silently discard unrecognized entries. */ }
  }

  return {
    autoSchedule: raw?.schedule_learning_settings &&
      (raw.schedule_learning_settings.scheduleLearningEnabled === undefined ||
        typeof raw.schedule_learning_settings.scheduleLearningEnabled === 'boolean') ?
      raw.schedule_learning_settings.scheduleLearningEnabled === true : null,
    modes,
  };
}

export function scheduleTrait(mode, entries, original, now = Date.now()) {
  const validated = validateEntries(mode, entries);
  if (original?.type !== 'SET_POINT_SCHEDULE_TYPE_' + mode.toUpperCase()) {
    throw new Error('Nest has not reported this schedule mode.');
  }

  const actor = {
    method: 'HVAC_ACTOR_METHOD_REMOTE',
    timeOfAction: {
      seconds: Math.floor(now / 1000),
      nanos: (now % 1000) * 1000000,
    },
  };
  const setpoints = Object.fromEntries(validated.map((entry, index) => [index + 1, {
    setpointType: 'SET_POINT_TYPE_' + mode.toUpperCase(),
    dayOfWeek: 'DAY_OF_WEEK_' + SCHEDULE_DAYS[entry.day],
    secondsInDay: entry.time,
    ...(mode !== 'cool' ? {
      heatingTarget: {
        value: entry.heat,
      },
    } : {}),
    ...(mode !== 'heat' ? {
      coolingTarget: {
        value: entry.cool,
      },
    } : {}),
    currentActorInfo: actor,
    originalActorInfo: actor,
  }]));
  return {
    ...structuredClone(original),
    setpoints,
  };
}
// Nest transports temperatures as float32 and may quantize targets to tenths of a degree.
export function schedulesMatch(actual, requested) {
  return Array.isArray(actual) && actual.length === requested.length && requested.every((entry, i) => {
    const observed = actual[i];
    return observed?.day === entry.day && observed.time === entry.time && ['heat', 'cool'].every((key) =>
      entry[key] === undefined ? observed[key] === undefined :
        Number.isFinite(observed[key]) && Math.abs(observed[key] - entry[key]) <= 0.051);
  });
}
const hash = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');

export class NestSchedules {
  constructor(dashboard, now = () => Date.now()) {
    this.dashboard = dashboard;
    this.now = now;
    this.records = {};
    this.saving = Promise.resolve();
    this.busy = new Set();
    this.file = path.join(dashboard.directory, 'schedule-preferences.json');
  }

  async start() {
    try {
      const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (saved.version !== 1 || !saved.records || typeof saved.records !== 'object' || Array.isArray(saved.records)) {
        throw new Error('Invalid schedule preferences');
      }
      for (const record of Object.values(saved.records)) {
        if (!record || typeof record !== 'object' || Array.isArray(record) ||
          typeof record.allowNestLearning !== 'boolean' || typeof record.learning !== 'boolean' ||
          (record.autoApply !== undefined && typeof record.autoApply !== 'boolean') ||
          (record.autoApplyError !== undefined && typeof record.autoApplyError !== 'string') ||
          (record.autoHandled !== undefined && (!record.autoHandled || typeof record.autoHandled !== 'object' ||
            Array.isArray(record.autoHandled) || Object.keys(record.autoHandled).length > 500 ||
            Object.values(record.autoHandled).some((at) => !Number.isFinite(at)))) ||
          !Array.isArray(record.events) || record.events.length > 500 ||
          record.events.some((event) => !event || !temperature(event.value) || !Number.isFinite(event.at) ||
            !['room', 'manual'].includes(event.source) || typeof event.zone !== 'string') ||
          (record.dismissed !== undefined && (!Array.isArray(record.dismissed) || record.dismissed.some((id) => typeof id !==
            'string'))) ||
          (record.pending && (!Number.isFinite(record.pending.at) ||
            (record.pending.autoApply !== undefined && typeof record.pending.autoApply !== 'boolean') ||
            !['auto', 'schedule'].includes(record.pending.action) ||
            (record.pending.action === 'auto' && typeof record.pending.value !== 'boolean') ||
            (record.pending.action === 'schedule' && (!record.pending.modes ||
              !Object.keys(record.pending.modes).length))))) {
          throw new Error('Invalid schedule preferences');
        }
        if (record.learnedEntries !== undefined) {
          validateEntries('heat', record.learnedEntries);
        }
        if (record.pending?.learnedEntries !== undefined) {
          validateEntries('heat', record.pending.learnedEntries);
        }
        if (record.pending?.action === 'schedule') {
          for (const [mode, entries] of Object.entries(record.pending.modes)) {
            validateEntries(mode, entries);
          }
        }
      }
      this.records = saved.records;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.loadError = 'Schedule preferences could not be read. Automatic learning changes are disabled.';
      }
    }
  }

  record(serial) {
    return this.records[serial] ??= {
      allowNestLearning: false,
      learning: true,
      autoApply: false,
      events: [],
    };
  }

  async persist() {
    const json = JSON.stringify({
      version: 1,
      records: this.records,
    });
    const operation = this.saving.catch(() => {}).then(async () => {
      await fs.mkdir(this.dashboard.directory, {
        recursive: true,
        mode: 0o700,
      });
      await fs.writeFile(this.file + '.tmp', json, {
        mode: 0o600,
      });
      await fs.rename(this.file + '.tmp', this.file);
    });
    this.saving = operation;
    return operation;
  }

  zone(serial) {
    const device = this.dashboard.devices.get(serial);
    const option = this.dashboard.automation?.deviceOptions?.find((d) => d.serialNumber === serial);
    return scheduleTimeZone(option ?? {}, device?.data ?? {});
  }

  learningOptions(serial) {
    return this.dashboard.automation?.deviceOptions?.find((d) => d.serialNumber.toUpperCase() === serial.toUpperCase())?.scheduleLearning;
  }

  learnedPlan(serial, suggestion, model) {
    const tolerance = learningSettings(this.learningOptions(serial)).timeToleranceMinutes * 60;
    const owned = this.record(serial).learnedEntries ?? [];
    const isOwned = (entry) => owned.some((prior) => schedulesMatch([entry], [prior]));
    const nearby = model.modes.heat.filter((entry) => entry.day === suggestion.day && Math.abs(entry.time - suggestion.time) <= tolerance);
    const replacement = nearby.filter(isOwned).sort((a, b) => Math.abs(a.time - suggestion.time) - Math.abs(b.time - suggestion.time))[0];
    const manual = nearby.some((entry) => !isOwned(entry));
    const row = { day: suggestion.day, time: suggestion.time, heat: suggestion.heat };
    const heat = validateEntries('heat', [...model.modes.heat.filter((entry) => entry !== replacement &&
      (entry.day !== row.day || entry.time !== row.time)), row]);
    return { heat, requiresApproval: manual && !schedulesMatch(model.modes.heat, heat),
      learnedEntries: validateEntries('heat', [...owned.filter((entry) => heat.some((current) => schedulesMatch([current], [entry])))
        .filter((entry) => entry.day !== row.day || entry.time !== row.time), row]) };
  }

  connected(serial) {
    const device = this.dashboard.devices.get(serial);
    return device?.type === 'Thermostat' && !!device.id && !device.needsUpdate && device.data.online === true &&
      this.dashboard.accounts().some((a) => a.id === device.account && a.authorised && a.observing);
  }

  fresh(serial, label, since = 0) {
    const feedback = this.dashboard.devices.get(serial)?.feedback;
    if (!feedback) {
      return true;
    }
    const trait = feedback.schedules?.[label];
    return trait?.generation === feedback.generation && Number.isFinite(trait?.receivedAt) && trait.receivedAt >= since;
  }

  native(serial) {
    const native = this.dashboard.devices.get(serial)?.data.native_schedules ?? {
      autoSchedule: null,
      modes: {},
    };
    return {
      autoSchedule: this.fresh(serial, 'schedule_learning_settings') ? native.autoSchedule : null,
      modes: Object.fromEntries(Object.entries(native.modes).filter(([mode]) => this.fresh(serial, mode + '_schedule_settings'))),
    };
  }

  snapshot(serial) {
    const native = this.native(serial);
    const record = this.record(serial);
    const pending = record.pending;
    if (pending && this.connected(serial)) {
      const matched = pending.action === 'auto' ? native.autoSchedule === pending.value && this.fresh(serial,
        'schedule_learning_settings', pending.at) :
          Object.entries(pending.modes).every(([mode, entries]) => this.fresh(serial, mode + '_schedule_settings', pending.at) &&
          schedulesMatch(native.modes[mode], entries));
      if (matched) {
        record.message = 'Confirmed by Nest.';
        if (pending.learnedEntries) {
          record.learnedEntries = pending.learnedEntries;
        }
        if (pending.autoApply) {
          delete record.autoApplyError;
        }
        if (pending.approvedId) {
          record.dismissed = [...(record.dismissed ?? []), pending.approvedId].slice(-200);
        }
        delete record.pending;
        void this.persist().catch(() => {
          record.message = 'Confirmed by Nest; local status could not be saved.';
        });
      } else if (this.now() - pending.at > 60000) {
        record.message = pending.failure ? pending.failure + ' Check Nest before retrying.' :
          'Nest has not confirmed this change. Refresh and check Nest before trying again.';
      }
    }
    const model = {
      ...native,
      expected: hash(native),
      scheduleRevisions: Object.fromEntries(Object.entries(native.modes).map(([mode, entries]) => [mode, hash([mode, entries])])),
      connected: this.connected(serial),
      zone: this.zone(serial),
      allowNestLearning: record.allowNestLearning === true,
      learning: record.learning !== false,
      autoApply: record.autoApply === true,
      learningSettings: learningSettings(this.learningOptions(serial)),
      learningError: learningSettingsError(this.learningOptions(serial)),
      suggestions: learningSuggestions(record.events, this.zone(serial), this.now(), this.learningOptions(serial))
        .filter((s) => !record.dismissed?.includes(s.id)),
      pending: record.pending ?? null,
      lastResponse: record.lastResponse ?? null,
      message: this.loadError || record.message || '',
      busy: this.busy.has(serial),
      temperatureRule: this.dashboard.automation?.temperaturePolicy?.(serial) ?? null,
    };
    if (Array.isArray(model.modes.heat)) {
      model.suggestions = model.suggestions.map((suggestion) => {
        try {
          return { ...suggestion, requiresApproval: this.learnedPlan(serial, suggestion, model).requiresApproval };
        } catch {
          return { ...suggestion, requiresApproval: true };
        }
      });
    }
    model.learningPaused = model.temperatureRule?.targetMode === 'fixed';
    model.learningMessage = model.learningPaused ?
      'Paused by fixed-temperature rule “' + model.temperatureRule.name + '”. ' +
      'Learning and automatic application resume with your saved preferences when this rule is no longer selected.' : '';
    const blocked = this.autoApplyBlock(serial, model);
    model.autoApplyStatus = !model.autoApply ? 'off' : model.learningPaused ? 'paused' :
      this.loadError || model.learningError || record.autoApplyError || record.pending?.failure ? 'attention' : blocked ? 'waiting' : 'on';
    model.autoApplyMessage = blocked ||
      'On. Qualifying heating suggestions are saved to Nest automatically. Entries that conflict with an existing user schedule require approval.';
    return model;
  }

  autoApplyBlock(serial, model, policyOnly = false) {
    const record = this.record(serial);
    if (model.learningPaused) {
      return model.learningMessage;
    }
    if (!model.autoApply) {
      return 'Off. Review and approve each suggestion before it is saved to Nest.';
    }
    if (this.loadError || record.autoApplyError || model.learningError) {
      return this.loadError || record.autoApplyError || model.learningError;
    }
    if (!model.learning || this.stopped) {
      return 'Automatic application is paused.';
    }
    if (model.busy || model.pending) {
      return 'Waiting for the current Nest request to be resolved.';
    }
    if (!model.connected) {
      return 'Waiting for a current Nest connection.';
    }
    if (policyOnly) {
      return null;
    }
    if (model.autoSchedule !== false) {
      return model.autoSchedule === true ?
        'Turning Nest Auto-Schedule off; waiting for confirmation before applying learned preferences.' :
        'Waiting for Nest to report Auto-Schedule before it can be turned off.';
    }
    if (!model.zone || !Array.isArray(model.modes.heat)) {
      return 'Waiting for a valid schedule time zone and a current Nest heating schedule.';
    }
    return null;
  }

  applyLearned() {
    if (!this.applying) {
      this.applying = this.applySuggestions().finally(() => {
        this.applying = null;
      });
    }
    return this.applying;
  }

  async applySuggestions() {
    for (const serial of Object.keys(this.records)) {
      const model = this.snapshot(serial);
      if (this.autoApplyBlock(serial, model, true)) {
        continue;
      }
      const record = this.record(serial);
      try {
        if (model.autoSchedule === true) {
          await this.action({ serial, action: 'auto', value: false, expected: model.expected }, true);
          continue;
        }
        if (this.autoApplyBlock(serial, model)) {
          continue;
        }
        const suggestion = model.suggestions.find((s) => !s.requiresApproval && s.latestAt >
          (record.autoHandled?.[hash([model.zone, s.day, s.time])] ?? 0));
        if (!suggestion) {
          continue;
        }
        await this.action({ serial, action: 'apply', expected: model.expected, id: suggestion.id });
      } catch {
        record.autoApplyError = 'Automatic application stopped. Review the Nest response and schedule. ' +
          'Turn automatic application off and on to enable it again; the same attempted learning will not be replayed.';
        await this.persist().catch(() => {});
      }
    }
  }

  async stop() {
    this.stopped = true;
    await this.applying;
  }

  async observe(serial, value, source = 'room') {
    if (this.loadError || !temperature(value) || !['room', 'manual'].includes(source) || this.fixedRule(serial)) {
      return;
    }
    const record = this.record(serial);
    const zone = this.zone(serial);
    if (record.learning === false || !zone || learningSettingsError(this.learningOptions(serial))) {
      return;
    }
    record.events = (record.events ?? []).filter((e) => e.at <= this.now() && this.now() - e.at < 90 * 86400000).slice(-499);
    record.events.push({
      at: this.now(),
      value,
      source,
      zone,
    });
    await this.persist();
  }

  fixedRule(serial) {
    return this.dashboard.automation?.temperaturePolicy?.(serial)?.targetMode === 'fixed';
  }

  async ensureRulePolicy(serial, fixed = false) {
    const model = this.snapshot(serial);
    if (this.loadError) {
      return this.loadError;
    }
    if ((!fixed && model.allowNestLearning) || model.autoSchedule === false) {
      return null;
    }
    // Models without a learning trait keep their existing control behavior, with an explicit tile notice.
    if (model.autoSchedule === null) {
      if (typeof this.dashboard.devices.get(serial)?.data.native_schedules?.autoSchedule === 'boolean') {
        return 'Waiting for current Nest Auto-Schedule feedback before temperature control resumes.';
      }
      this.record(serial).message = 'Nest Auto-Schedule control is unavailable. Check learning in the Nest app.';
      return null;
    }
    if (model.pending || model.busy) {
      return model.message || 'Waiting for Nest to confirm Auto-Schedule is off.';
    }
    const record = this.record(serial);
    if (record.policyError) {
      return record.policyError;
    }
    try {
      await this.action({
        serial,
        action: 'auto',
        value: false,
        expected: model.expected,
      });
    } catch {
      record.policyError = fixed ?
        'Auto-Schedule could not be disabled. Turn it off in the Nest app and refresh, or review the thermostat tile before retrying.' :
        'Auto-Schedule could not be disabled. Use the thermostat tile to retry or explicitly enable Nest learning.';
      record.message ||= record.policyError;
    }
    return record.policyError || 'Waiting for Nest to confirm Auto-Schedule is off.';
  }

  async action(payload, automaticPolicy = false) {
    const {
      serial,
      action,
      expected,
    } = payload ?? {};
    if (!['auto', 'save', 'clear', 'approve', 'apply', 'dismiss', 'learning', 'autoApply', 'check', 'acknowledge'].includes(action) ||
        typeof serial !== 'string') {
      throw new Error('Unsupported schedule action.');
    }
    if (this.loadError) {
      throw new Error(this.loadError);
    }
    if (this.dashboard.devices.get(serial)?.type !== 'Thermostat') {
      throw new Error('Thermostat unavailable.');
    }
    const model = this.snapshot(serial);
    const record = this.record(serial);
    // Local preferences can be disabled while a native write is queued. The queued-write guard checks them again.
    if (['learning', 'autoApply'].includes(action)) {
      if (typeof payload.value !== 'boolean') {
        throw new Error('Choose learning or automatic application on or off.');
      }
      if (payload.value && model.learningPaused) {
        throw new Error(model.learningMessage);
      }
      if (action === 'autoApply' && payload.value &&
          (!model.learning || payload.confirmation !== 'enable-auto-apply-learning')) {
        throw new Error('Enable learning and confirm automatic application first.');
      }
      const previous = { learning: record.learning, autoApply: record.autoApply, autoApplyError: record.autoApplyError };
      record[action] = payload.value;
      if (action === 'learning' && !payload.value) {
        record.autoApply = false;
      }
      if (action === 'autoApply' || !payload.value) {
        delete record.autoApplyError;
      }
      try {
        await this.persist();
      } catch (error) {
        Object.assign(record, previous);
        throw error;
      }
      if (action === 'autoApply' && payload.value) {
        void this.applyLearned();
      }
      return { accepted: true, message: action === 'learning' ? 'Room preference learning ' + (payload.value ? 'on.' : 'off.') :
        this.snapshot(serial).autoApplyMessage };
    }
    const scopedSchedule = action === 'save' && Object.hasOwn(payload, 'scheduleRevision');
    if (scopedSchedule && (typeof payload.scheduleRevision !== 'string' ||
        payload.scheduleRevision !== model.scheduleRevisions[payload.mode])) {
      throw new Error('This Nest schedule changed while you were editing. Your draft is kept. ' +
        'Cancel the draft and reopen Edit schedule to review it.');
    }
    if (!scopedSchedule && expected !== model.expected) {
      throw new Error('Nest schedule changed. Refresh and review it before saving.');
    }
    if (this.busy.has(serial)) {
      throw new Error('Another schedule action is in progress.');
    }
    if (action === 'apply' && this.autoApplyBlock(serial, model)) {
      throw new Error(this.autoApplyBlock(serial, model));
    }
    if (model.learningPaused && (action === 'approve' || action === 'auto' && payload.value)) {
      throw new Error('The fixed-temperature rule pauses learned schedule changes and requires Nest Auto-Schedule off. ' +
        'Change or pause the rule first.');
    }
    if (action === 'acknowledge') {
      if (!model.connected || !model.pending || this.now() - model.pending.at <= 60000) {
        throw new Error('Wait for Nest confirmation first.');
      }
      delete record.pending;
      record.message = 'Review the reported Nest state before retrying. The previous request may still take effect.';
      record.policyError = 'Review Auto-Schedule on the thermostat tile before continuing the temperature rule.';
      await this.persist();
      return {
        message: record.message,
      };
    }
    if (action === 'check') {
      this.dashboard.refreshFeedback(serial);
      return {
        message: model.message,
      };
    }
    if (action === 'dismiss') {
      if (!model.suggestions.some((s) => s.id === payload.id)) {
        throw new Error('Suggestion changed. Refresh and review it.');
      }
      record.dismissed = [...(record.dismissed ?? []), payload.id].slice(-200);
      await this.persist();
      return {
        message: 'Suggestion dismissed.',
      };
    }
    if (!model.connected) {
      throw new Error('Reconnect to Nest before changing schedules.');
    }
    if (model.pending && this.now() - model.pending.at <= 60000) {
      throw new Error('Wait for the previous change to be confirmed.');
    }
    let values;
    let pending;
    let learnedEntries;
    if (action === 'auto') {
      if (typeof payload.value !== 'boolean' || model.autoSchedule === null) {
        throw new Error('Auto-Schedule control is unavailable.');
      }
      if (payload.value && payload.confirmation !== 'enable-nest-learning') {
        throw new Error('Confirm the room-average learning warning first.');
      }
      values = {
        schedule_learning_enabled: payload.value,
      };
      pending = {
        action: 'auto',
        value: payload.value,
        at: this.now(),
        ...(automaticPolicy ? { autoApply: true } : {}),
      };
    } else {
      let modes;
      if (action === 'clear') {
        if (payload.confirmation !== 'clear-temperature-schedules') {
          throw new Error('Confirm clearing temperature schedules first.');
        }
        modes = Object.fromEntries(Object.keys(model.modes).map((mode) => [mode, []]));
      } else if (['approve', 'apply'].includes(action)) {
        const suggestion = model.suggestions.find((s) => s.id === payload.id);
        if (!suggestion || !Array.isArray(model.modes.heat)) {
          throw new Error('This suggestion or Nest heating schedule is unavailable.');
        }
        const plan = this.learnedPlan(serial, suggestion, model);
        if (action === 'apply' && plan.requiresApproval) {
          throw new Error('This suggestion overlaps an existing user schedule. Review and approve it manually.');
        }
        modes = { heat: plan.heat };
        learnedEntries = plan.learnedEntries;
        if (action === 'apply') {
          const key = hash([model.zone, suggestion.day, suggestion.time]);
          if (suggestion.latestAt <= (record.autoHandled?.[key] ?? 0)) {
            throw new Error('This learning was already attempted. Review and approve it manually if needed.');
          }
          record.autoHandled = Object.fromEntries(Object.entries(record.autoHandled ?? {}).filter(([, at]) =>
            this.now() - at < 90 * 86400000));
          record.autoHandled[key] = suggestion.latestAt;
          if (schedulesMatch(model.modes.heat, modes.heat)) {
            record.dismissed = [...(record.dismissed ?? []), suggestion.id].slice(-200);
            await this.persist();
            return { message: 'The learned entry already matches Nest’s heating schedule.' };
          }
        }
      } else {
        if (payload.confirmation !== 'save-temperature-schedule') {
          throw new Error('Review and confirm the schedule first.');
        }
        if (!Object.hasOwn(model.modes, payload.mode)) {
          throw new Error('Nest has not reported that schedule mode.');
        }
        modes = {
          [payload.mode]: validateEntries(payload.mode, payload.entries),
        };
      }
      if (!Object.keys(modes).length) {
        throw new Error('No editable Nest schedules were reported.');
      }
      values = {
        temperature_schedules: modes,
      };
      if (action === 'clear' || action === 'save' && payload.mode === 'heat') {
        learnedEntries = [];
      }
      pending = {
        action: 'schedule',
        ...(learnedEntries ? { learnedEntries } : {}),
        modes,
        at: this.now(),
        ...(action === 'apply' ? { autoApply: true } : {}),
        ...(['approve', 'apply'].includes(action) ? {
          approvedId: payload.id,
        } : {}),
      };
    }
    const learningRevision = hash(this.learningOptions(serial) ?? {});
    this.busy.add(serial);
    try {
      // Persist intent before sending; a restart must not repeat an uncertain destructive operation.
      if (action === 'auto') {
        record.allowNestLearning = payload.value;
        if (payload.value) {
          record.autoApply = false;
        }
        delete record.policyError;
      }
      record.pending = pending;
      record.message = pending.action === 'auto' ? 'Requested Nest Auto-Schedule ' +
        (pending.value ? 'On' : 'Off') + '. Waiting for Nest confirmation.' : 'Requested schedule update. Waiting for Nest confirmation.';
      await this.persist();
      const guard = () => this.connected(serial) && (scopedSchedule ?
        hash([payload.mode, this.native(serial).modes[payload.mode]]) === payload.scheduleRevision :
        hash(this.native(serial)) === expected) &&
        (!['approve', 'apply'].includes(action) || hash(this.learningOptions(serial) ?? {}) === learningRevision) &&
        (!(action === 'approve' || action === 'apply' || action === 'auto' && payload.value) || !this.fixedRule(serial)) &&
        ((!automaticPolicy && action !== 'apply') ||
          (!this.stopped && record.autoApply === true && record.learning !== false && !record.autoApplyError &&
            !this.fixedRule(serial) &&
            (automaticPolicy || (this.zone(serial) === model.zone && this.native(serial).autoSchedule === false))));
      const result = await this.dashboard.command(this.dashboard.devices.get(serial).id, values, {
        automation: true,
        guard,
      });
      if (result?.scheduleResponses) {
        record.lastResponse = { at: this.now(), request: pending.action, value: pending.value, responses: result.scheduleResponses };
      }
      if (action === 'auto') {
        record.allowNestLearning = payload.value;
        delete record.policyError;
      }
      await this.persist();
      this.dashboard.refreshFeedback(serial);
      return {
        accepted: true,
        message: record.message,
      };
    } catch (error) {
      const failures = error instanceof AggregateError ? error.errors : [error];
      const diagnostics = failures.map((failure) => failure?.scheduleDiagnostic).filter((detail) => typeof detail === 'string');
      const responses = failures.map((failure) => failure?.scheduleResponse).filter((response) => response !== undefined);
      record.lastResponse = { at: this.now(), request: pending.action, value: pending.value, responses };
      if (!responses.length) {
        record.lastResponse.note = 'No decoded Google response was returned.';
      }
      const requested = pending.action === 'auto' ? 'Nest Auto-Schedule ' + (pending.value ? 'On' : 'Off') : 'Nest schedule update';
      pending.failure = requested + ' request failed. ' + (diagnostics.join(' ') ||
        'No usable Google write response was received; delivery is uncertain.');
      record.message = pending.failure + ' Check Nest before retrying.';
      this.dashboard.log?.warn?.(pending.failure);
      this.dashboard.log?.warn?.('Nest schedule response: ' + JSON.stringify(record.lastResponse));
      // Retain uncertain intent; feedback may still arrive after a transport failure.
      await this.persist().catch(() => {});
      throw new Error(record.message);
    } finally {
      this.busy.delete(serial);
    }
  }
}
