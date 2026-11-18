import { displayTemperature, celsiusTemperature } from './climate-utils.js';

const views = new Map();
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const node = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
const clock = (seconds) => String(Math.floor(seconds / 3600)).padStart(2, '0') + ':' + String(Math.floor(seconds % 3600 / 60)).padStart(2, '0');
const label = (text, input) => { const e = node('label', text); e.append(input); return e; };

export function renderScheduleControls(device, { unit, live, send, refresh }) {
  const model = device.scheduleControls ?? { autoSchedule: null, modes: {}, suggestions: [] };
  const view = views.get(device.serial) ?? { open: false, mode: Object.keys(model.modes)[0] || 'heat' };
  views.set(device.serial, view);
  const box = node('details', undefined, 'schedule-controls'); box.open = view.open;
  box.addEventListener('toggle', () => { view.open = box.open; });
  box.append(node('summary', 'Temperature schedule · Nest Auto-Schedule ' +
    (model.autoSchedule === null ? 'unavailable' : model.autoSchedule ? 'on' : 'off')));
  const body = node('div', undefined, 'schedule-body'); box.append(body);
  const enabled = Boolean(live && model.connected && !model.busy && !view.busy && !model.pending);
  const button = (text, action, available = enabled) => {
    const e = node('button', text, 'button secondary'); e.type = 'button'; e.disabled = !available;
    e.addEventListener('click', action); return e;
  };
  const draw = () => box.replaceWith(renderScheduleControls(device, { unit, live, send, refresh }));
  async function submit(payload, expected = model.expected) {
    view.busy = true; view.message = 'Sending…'; view.confirm = null; draw();
    try {
      const result = await send({ serial: device.serial, expected, ...payload });
      view.message = result.accepted ? '' : result.message;
      if (['save', 'clear', 'approve'].includes(payload.action)) delete view.draft;
    } catch (error) { view.message = error.message || 'The change could not be confirmed. Refresh and check Nest.'; }
    finally { view.busy = false; draw(); await refresh(); }
  }
  const confirm = (message, payload, expected = model.expected) => {
    view.confirm = { message, payload, expected }; draw();
  };
  body.append(node('p', 'Schedule times use ' + (model.zone || 'an unknown Nest time zone') + '. Entries remain stored in Nest.', 'small-note'));
  body.append(node('p', 'With a temperature rule, heating entries become desired room temperatures after Nest confirms them. The rule adjusts Nest’s target using the selected sensors.', 'small-note'));
  const auto = button('Turn Nest Auto-Schedule ' + (model.autoSchedule ? 'off' : 'on'), () => {
    if (model.autoSchedule) void submit({ action: 'auto', value: false });
    else confirm('Enable Nest Auto-Schedule? A room-temperature rule sends adjusted targets to Nest. Nest may learn those adjustments as temperature preferences and change your schedule. This override keeps Nest learning enabled while your rule runs and turns off automatic application of learned room preferences. Room-preference learning can stay on.',
      { action: 'auto', value: true, confirmation: 'enable-nest-learning' });
  }, enabled && model.autoSchedule !== null);
  auto.setAttribute('aria-pressed', String(model.autoSchedule === true)); body.append(auto);
  if (model.autoSchedule === true) body.append(node('p',
    'Nest Auto-Schedule is on. Room-average compensation may be learned as a temperature preference and change Nest’s schedule.', 'schedule-warning'));
  body.append(node('p', model.autoSchedule === null ? 'This thermostat has not reported Auto-Schedule control. Check the Nest app.' :
    'Temperature rules disable Nest Auto-Schedule by default. Turning it off preserves schedule entries. An explicit On choice overrides that default.', 'small-note'));
  const learn = node('input'); learn.type = 'checkbox'; learn.checked = model.learning !== false; learn.disabled = !live || view.busy;
  learn.addEventListener('change', () => void submit({ action: 'learning', value: learn.checked }));
  body.append(label('Learn room-temperature preferences', learn));
  body.append(node('p', 'Suggests heating entries from intentional room-target choices in this dashboard and Apple Home. Requires three similar choices on separate dates for the same weekday and half-hour. Nest Auto-Schedule changes, scheduled targets, compensation and Eco changes do not train this learner.', 'small-note'));
  const applyLearning = node('input'); applyLearning.type = 'checkbox'; applyLearning.checked = model.autoApply === true;
  applyLearning.disabled = !live || view.busy || model.learning === false;
  applyLearning.addEventListener('change', () => {
    if (applyLearning.checked) confirm('Enable automatic application of learned preferences? This turns off Nest Auto-Schedule, Nest’s automatic schedule-learning feature. Existing schedule entries are kept. After Nest confirms Auto-Schedule is off, current and future qualifying heating suggestions will be saved without individual approval, replacing entries at the same weekday and time. Turning off learning also turns off automatic application.',
      { action: 'autoApply', value: true, confirmation: 'enable-auto-apply-learning' });
    else void submit({ action: 'autoApply', value: false });
  });
  body.append(label('Automatically apply learned preferences', applyLearning));
  body.append(node('p', model.autoApplyMessage || 'Off by default. Enabling automatic application turns off Nest Auto-Schedule and waits for confirmation before saving learned entries.', 'small-note'));
  if (view.message || model.message || model.pending) {
    const status = node('p', view.message || model.message || 'Waiting for Nest confirmation.', 'schedule-message');
    status.setAttribute('role', 'status'); body.append(status);
  }
  if (model.pending) {
    const request = model.pending.action === 'auto' ? 'Auto-Schedule ' + (model.pending.value ? 'On' : 'Off') : 'a weekly schedule update';
    const state = model.pending.failure ? 'Failed request: ' : 'Pending request: ';
    body.append(node('p', state + request + '. The controls show the last values reported by Nest.' +
      (model.pending.failure ? ' Check Nest before allowing another attempt; this request will not be retried automatically.' : ''), 'small-note'));
    body.append(button('Refresh confirmation', () => void submit({ action: 'check' }), live && !view.busy));
    if (Date.now() - model.pending.at > 60000) body.append(button('I checked Nest; allow retry', () => void submit({ action: 'acknowledge' }), live && !view.busy));
  }
  if (model.lastResponse) {
    const diagnostic = node('details', undefined, 'schedule-response');
    diagnostic.open = view.responseOpen === true;
    diagnostic.addEventListener('toggle', () => { view.responseOpen = diagnostic.open; });
    diagnostic.append(node('summary', 'Last Nest write response (redacted)'));
    const output = node('textarea'); output.readOnly = true; output.rows = 14;
    output.setAttribute('aria-label', 'Nest write response');
    output.value = JSON.stringify(model.lastResponse, null, 2);
    diagnostic.append(output);
    diagnostic.append(button('Download response JSON', () => {
      const url = URL.createObjectURL(new Blob([output.value], { type: 'application/json' }));
      const link = node('a'); link.href = url; link.download = 'nest-schedule-response.json';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, true));
    body.append(diagnostic);
  }
  if (view.confirm) {
    const prompt = node('div', undefined, 'schedule-confirm'); prompt.setAttribute('role', 'alertdialog');
    prompt.setAttribute('aria-label', 'Confirm schedule change'); prompt.append(node('p', view.confirm.message));
    prompt.append(button('Confirm', () => void submit(view.confirm.payload, view.confirm.expected),
      view.confirm.payload.action === 'autoApply' ? live && !view.busy && model.learning !== false : enabled));
    prompt.append(button('Cancel', () => { view.confirm = null; draw(); }, !view.busy)); body.append(prompt);
  }
  const modes = Object.keys(model.modes);
  if (!modes.length) { body.append(node('p', 'No editable temperature schedule has been reported by this thermostat.', 'small-note')); return box; }
  if (!modes.includes(view.mode)) view.mode = modes[0];
  const mode = node('select');
  for (const name of modes) { const option = node('option', name === 'range' ? 'Heat • Cool' : name === 'heat' ? 'Heat' : 'Cool'); option.value = name; mode.append(option); }
  mode.value = view.mode; mode.disabled = Boolean(view.draft) || view.busy;
  mode.addEventListener('change', () => { view.mode = mode.value; draw(); }); body.append(label('Schedule mode', mode));
  if (view.draft && view.draft.unit !== unit) {
    body.append(node('p', 'Temperature units changed. Cancel this draft and reopen the editor.', 'small-note'));
    body.append(button('Cancel draft', () => { delete view.draft; view.confirm = null; draw(); }, !view.busy)); return box;
  }
  const entries = view.draft?.entries ?? model.modes[view.mode];
  const rows = node('div', undefined, 'schedule-rows');
  if (!entries.length) rows.append(node('p', 'No scheduled changes for this mode.', 'small-note'));
  entries.forEach((entry, index) => {
    const row = node('div', undefined, 'schedule-row');
    if (!view.draft) {
      row.append(node('strong', days[entry.day] + ' · ' + clock(entry.time)));
      for (const key of ['heat', 'cool']) if (key in entry) row.append(node('span', (key === 'heat' ? 'Heat ' : 'Cool ') + displayTemperature(entry[key], unit).toFixed(1) + '°' + unit));
    } else {
      const day = node('select'); days.forEach((name, i) => { const option = node('option', name); option.value = i; day.append(option); });
      day.value = entry.day; day.addEventListener('change', () => { entry.day = Number(day.value); }); row.append(label('Day', day));
      const time = node('input'); time.type = 'time'; time.step = '60'; time.value = clock(entry.time);
      time.addEventListener('input', () => { const [h, m] = time.value.split(':').map(Number); entry.time = h * 3600 + m * 60; }); row.append(label('Time', time));
      for (const key of ['heat', 'cool']) if (key in entry) {
        const input = node('input'); input.type = 'number'; input.step = '0.1'; input.min = displayTemperature(9, unit); input.max = displayTemperature(32, unit);
        input.value = displayTemperature(entry[key], unit).toFixed(1); input.id = 'schedule-' + device.serial + '-' + index + '-' + key;
        input.addEventListener('input', () => { entry[key] = input.value === '' ? NaN : celsiusTemperature(Number(input.value), unit); });
        row.append(label((key === 'heat' ? 'Heat' : 'Cool') + ' (°' + unit + ')', input));
      }
      row.append(button('Remove', () => { view.draft.entries.splice(index, 1); draw(); }, !view.busy));
    }
    rows.append(row);
  });
  body.append(rows);
  if (view.draft) {
    body.append(button('Add time', () => {
      view.draft.entries.push({ day: 1, time: 7 * 3600, ...(view.mode !== 'cool' ? { heat: 21 } : {}), ...(view.mode !== 'heat' ? { cool: 24 } : {}) }); draw();
    }, !view.busy));
    body.append(button('Save schedule to Nest', () => confirm('Replace the ' + view.mode + ' schedule on ' + (device.data.description || 'this thermostat') + ' with these ' + entries.length + ' entries? Other schedule modes are preserved.',
      { action: 'save', mode: view.mode, entries: structuredClone(entries), confirmation: 'save-temperature-schedule',
        ...(view.draft.scheduleRevision ? { scheduleRevision: view.draft.scheduleRevision } : {}) }, view.draft.expected), enabled));
    body.append(button('Cancel draft', () => { delete view.draft; view.confirm = null; draw(); }, !view.busy));
  } else body.append(button('Edit schedule', () => { view.draft = { entries: structuredClone(entries), expected: model.expected, scheduleRevision: model.scheduleRevisions?.[view.mode], unit }; draw(); }));
  body.append(button('Clear temperature schedules', () => confirm('Clear all reported temperature schedules (' + modes.join(', ') + ') on ' + (device.data.description || 'this thermostat') + '? This removes their weekly entries. Auto-Schedule is a separate setting; if on, it may create new entries.',
    { action: 'clear', confirmation: 'clear-temperature-schedules' }), enabled && !view.draft));
  if (model.suggestions?.length) {
    body.append(node('h4', 'Room-temperature suggestions'));
    for (const suggestion of model.suggestions) {
      const summary = days[suggestion.day] + ' · ' + clock(suggestion.time) + ' · Heat ' + displayTemperature(suggestion.heat, unit).toFixed(1) + '°' + unit;
      const item = node('div', undefined, 'schedule-suggestion');
      item.append(node('p', summary + ' · ' + suggestion.observations + ' observed dates'));
      item.append(button('Approve and save to Nest', () => confirm('Save ' + summary + ' to Nest’s heating schedule? An entry at that exact day and time will be replaced; other entries stay unchanged.',
        { action: 'approve', id: suggestion.id }), enabled && !view.draft && Array.isArray(model.modes.heat)));
      item.append(button('Dismiss', () => void submit({ action: 'dismiss', id: suggestion.id }), live && !view.busy)); body.append(item);
    }
  } else body.append(node('p', 'No learning suggestions yet. Repeated intentional room-target choices build the evidence.', 'small-note'));
  return box;
}
