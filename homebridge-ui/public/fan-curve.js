import { fanCurveStages, fanRulePlan, fanSpeedError, mappedSpeed, supportedSpeed } from './fan-speed.js';

// A read-only view of the same bounded curve and mapping used by fan rules.
export function fanCurveView(rule, source, temperature, reportedSpeed, reportedRunning) {
  if (rule.speedMode !== 'curve' || fanSpeedError(rule)) return null;
  const average = Number.isFinite(temperature) ? temperature : null;
  const startsAt = rule.desiredTemperature + rule.startGap;
  const fullAt = rule.desiredTemperature + rule.fullSpeedGap;
  const padding = Math.max(0.2, (fullAt - startsAt) * 0.1);
  const low = Math.min(startsAt, average ?? startsAt) - padding;
  const high = Math.max(fullAt, average ?? fullAt) + padding;
  const stages = fanCurveStages(rule, source);
  const requested = average === null ? null : fanRulePlan({ ...rule, action: 'cooling' },
    { temperature: average, hvacState: 'cooling' }).speed;
  const setting = requested === null ? null : supportedSpeed(source, requested, rule.minimumSpeed, rule.maximumSpeed);
  const mapping = mappedSpeed(source?.speedMapping, setting);
  const points = stages ? stages.flatMap((stage) => [
    [stage.from ?? low, stage.commandMin], [stage.through ?? high, stage.commandMin],
  ]) : [[low, rule.minimumSpeed], [startsAt, rule.minimumSpeed], [fullAt, rule.maximumSpeed], [high, rule.maximumSpeed]];
  const shown = stages?.length > 10 ? Array.from({ length: 10 }, (_, i) => stages[Math.round(i * (stages.length - 1) / 9)]) : stages;
  const levels = shown ? shown.map((stage) => ({ value: stage.commandMin, label: stage.mapping.label })) :
    [...new Set(Array.from({ length: 5 }, (_, i) => rule.minimumSpeed + i / 4 * (rule.maximumSpeed - rule.minimumSpeed)))]
      .map((value) => ({ value, label: Number(value.toFixed(1)) + '%' }));
  const reportedRange = mappedSpeed(source?.speedMapping, reportedSpeed);
  const reportedStage = stages?.find((stage) => stage.mapping === reportedRange);
  const reportedOff = reportedRunning === false;
  const reported = reportedOff ? 0 : Number.isFinite(reportedSpeed) ? stages ? reportedStage?.commandMin ?? null :
    reportedSpeed >= rule.minimumSpeed && reportedSpeed <= rule.maximumSpeed ? reportedSpeed : null : null;
  return { low, high, startsAt, fullAt, minimum: rule.minimumSpeed, maximum: rule.maximumSpeed,
    points, levels, mapped: Boolean(stages), average, requested, setting, settingLabel: mapping?.label ?? null,
    current: stages ? setting : requested, reported, reportedOff,
    reportedOutside: !reportedOff && Number.isFinite(reportedSpeed) && reported === null };
}

export function drawFanCurve(host, view, formatTemperature, unit) {
  const width = host.clientWidth;
  if (width < 120) return;
  const height = Math.max(240, view.levels.length * 19 + 80);
  const left = view.mapped ? 78 : 64; const right = width - 16; const top = 26; const bottom = height - 42;
  const runningBottom = bottom - 32; const offRow = bottom - 6;
  const x = (value) => left + (value - view.low) / (view.high - view.low) * (right - left);
  const y = (value) => value === 0 ? offRow : view.maximum === view.minimum ? (top + runningBottom) / 2 :
    runningBottom - 9 - (value - view.minimum) / (view.maximum - view.minimum) * (runningBottom - top - 18);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('role', 'img'); svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-label', (view.mapped ? 'Mapped fan settings' : 'Requested fan percentage') +
    ' by room temperature. Rule limits ' + view.minimum + ' to ' + view.maximum + ' percent. ' +
    (view.average === null ? 'Current room temperature is unavailable.' : 'Room average ' + formatTemperature(view.average) + '. ') +
    (view.current === null ? '' : 'Curve point ' + view.current.toFixed(1) + ' percent. ') +
    'Off is a separate row below the running-speed curve. ' +
    (view.reportedOff ? 'Hollow marker shows the fan is off.' : view.reported === null ? '' : 'Hollow marker shows the reported setting.'));
  const add = (tag, attrs, value) => {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, String(val));
    if (value !== undefined) node.textContent = value;
    svg.append(node); return node;
  };
  for (const level of view.levels) {
    add('line', { x1: left, x2: right, y1: y(level.value), y2: y(level.value), class: 'fan-curve-grid' });
    const label = level.label.length > 11 ? level.label.slice(0, 10) + '…' : level.label;
    const text = add('text', { x: left - 9, y: y(level.value) + 4, 'text-anchor': 'end', class: 'fan-curve-axis' }, label);
    const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = level.label; text.append(title);
  }
  add('line', { x1: left, x2: right, y1: offRow, y2: offRow, class: 'fan-curve-grid fan-curve-off-line' });
  add('text', { x: left - 9, y: offRow + 4, 'text-anchor': 'end', class: 'fan-curve-axis fan-curve-off-label' }, 'Off · 0%');
  const d = view.points.map(([temperature, speed], index) => (index ? 'L' : 'M') + x(temperature).toFixed(2) + ' ' + y(speed).toFixed(2)).join(' ');
  add('path', { d: d + ' L' + right + ' ' + runningBottom + ' L' + left + ' ' + runningBottom + ' Z', class: 'fan-curve-area' });
  add('path', { d, class: 'fan-curve-line' });
  const ticks = width < 320 ? [view.low, view.high] : [view.low, (view.low + view.high) / 2, view.high];
  ticks.forEach((value, index) => add('text', { x: x(value), y: bottom + 19,
    'text-anchor': index === 0 ? 'start' : index === ticks.length - 1 ? 'end' : 'middle', class: 'fan-curve-axis' },
  formatTemperature(value)));
  add('text', { x: (left + right) / 2, y: height - 3, 'text-anchor': 'middle', class: 'fan-curve-axis' }, 'Room average · °' + unit);
  if (view.average !== null) {
    add('line', { x1: x(view.average), x2: x(view.average), y1: top, y2: bottom, class: 'fan-curve-now' });
    add('text', { x: Math.max(left + 15, Math.min(right - 15, x(view.average))), y: 14,
      'text-anchor': 'middle', class: 'fan-curve-axis fan-curve-now-label' }, 'Now');
    if (view.reported !== null) add('circle', { cx: x(view.average), cy: y(view.reported), r: 7,
      class: 'fan-curve-reported', 'data-speed': view.reported });
    if (view.current !== null) add('circle', { cx: x(view.average), cy: y(view.current), r: 4,
      class: 'fan-curve-current', 'data-speed': view.current });
  } else if (view.reportedOff) {
    // Off is known independently of the room temperature; do not invent an x-axis reading.
    const marker = add('circle', { cx: (left + right) / 2, cy: offRow, r: 7,
      class: 'fan-curve-reported', 'data-speed': 0, 'data-temperature-unavailable': true });
    const title = document.createElementNS(svg.namespaceURI, 'title');
    title.textContent = 'Fan reports Off; room temperature unavailable.'; marker.append(title);
  }
  host.replaceChildren(svg);
}

