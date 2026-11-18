// Preserve observation provenance separately from the last-known device values.
// Version counters are diagnostic metadata until ordering across state types is established.
export function climateFeedback(raw, type, generation, data) {
  const traits = raw?.value ?? {};
  const feedback = raw?.feedback ?? {};
  const current = (name) => Number.isInteger(generation) && feedback[name]?.generation === generation;
  let required = [];
  const invalidFields = [];
  if (type === 'Thermostat') {
    required = ['current_temperature', 'target_temperature_settings', 'eco_mode_state', 'liveness'];
    // Optional traits must be refreshed if this device has previously supplied them.
    for (const name of ['hvac_control', 'remote_comfort_sensing_settings', 'hvac_equipment_capabilities']) {
      if (Object.hasOwn(traits, name)) {
        required.push(name);
      }
    }
    for (const [trait, fields] of [
      ['current_temperature', ['current_temperature', 'physical_temperature']],
      ['target_temperature_settings', ['hvac_mode', 'target_temperature', 'target_temperature_low', 'target_temperature_high']],
      ['eco_mode_state', ['eco_mode']],
    ]) {
      if (current(trait)) {
        for (const field of fields) {
          if (data[field] === undefined) {
            invalidFields.push(field);
          }
        }
      }
    }
  } else if (type === 'TemperatureSensor') {
    required = ['current_temperature', 'last_updated_beacon'];
    if (current('current_temperature') && !Number.isFinite(data.current_temperature)) {
      invalidFields.push('current_temperature');
    }
  } else if (type === 'HomeAway') {
    required = ['structure_mode'];
    if (current('structure_mode') && typeof data.occupancy !== 'boolean') {
      invalidFields.push('occupancy');
    }
  }
  const target = feedback.target_temperature_settings;
  return {
    ready: required.every(current),
    invalidFields,
    generation,
    schedules: type === 'Thermostat' ? Object.fromEntries(
      ['schedule_learning_settings', 'heat_schedule_settings', 'cool_schedule_settings', 'range_schedule_settings']
        .filter((name) => feedback[name]).map((name) => [name, { ...feedback[name] }]),
    ) : undefined,
    temperatureReceivedAt: feedback.current_temperature?.receivedAt ?? null,
    target: target ? { ...target, stateTypes: [...target.stateTypes] } : null,
  };
}

