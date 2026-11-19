# Schedule learning implementation

## Objective and repository

Improve intentional heating-schedule preference learning, expose its settings, explain heating-response observation alongside Nest control, and move Climate rules above Sensors & fans.

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Remote base: `0bc0406173d9c19b444aa61cc7cf794f71a1ad31`, main / v0.6.12.
- Branch: `feature/schedule-learning-patterns`.
- No version change, release, npm publication, or live-device setting changes are part of this task.

## Completed changes and decisions

- Separate preference learner groups nearby local times, counts one final choice per date, applies exponential recency weights, requires a supporting-date minimum and weighted agreement, and proposes an actually selected temperature.
- Per-thermostat advanced settings control day grouping, evidence minimum, history window, half-life, time similarity, schedule rounding, temperature similarity and agreement. Defaults retain separate-weekday learning. Grouped modes deliberately propose entries for all days in the selected group.
- Only intentional room/manual choices are evidence. Compensation, schedule changes, Eco, other time zones, future data and non-heating events are excluded. Silence does not imply comfort or presence.
- History remains bounded to 500 observations and now retains up to 90 days; the default evidence window is 42 days.
- Automatic application only replaces confirmed plugin-owned nearby entries. Conflicting user entries require manual approval. Native edits invalidate ownership when values differ; manually saving a heating schedule clears ownership on confirmation. Failed writes retain their uncertain intent. Queue guards recheck learning settings.
- Settings use the existing config save/stage flow, strict shared validation, Celsius storage and Fahrenheit difference conversion. They apply without restarting and do not enable auto-apply.
- Heating-response observation remains advisory. Help explains True Radiant, Early-On, Heat Pump Balance, target-write intervals and adjustment limits. No predictive heating controller or equipment-timing setting was added.
- Sidebar and compact menu share the reordered navigation.

## Validation checkpoint

- 263 focused unit/integration tests passed across scheduling, learner, config, temperature control and heating response.
- New learner and shared settings contract reached 100% local line, branch and function coverage before final formatting.
- Build and required-file verification passed.
- Local dependency installation is blocked by registry network access. Chromium cannot start under the local socket restriction. Remote CI must validate lint, full coverage, package installation, compatibility and browser checks.
- Live Nest/backend/hardware behavior has not been verified. No claim of perfect True Radiant coordination is made; bounded setpoint changes can still influence native predictions.

## Exact next steps

1. Commit and publish the feature branch against the stated remote base; open a pull request without an npm release.
2. Run existing CI. Review lint, every coverage gate, Node/Homebridge combinations, package checks, and embedded/standalone browser checks.
3. Correct failures, rerun relevant checks, and update this checkpoint with the final result.
4. For later hardware validation, review suggestions before enabling auto-apply, confirm a manual schedule entry is protected, save learning settings in each host, and monitor a radiant heating cycle with bounded compensation.

## Design sources

- https://nest.com/support/images/Whitepapers/Nest_Auto_Schedule_Whitepaper.pdf
- https://nest.com/support/images/misc-nest-thermostat/3rd-gen/Nest-Fall-Whitepaper.pdf
- https://support.google.com/googlehome/answer/9250165
- https://support.google.com/googlehome/answer/9246532
- https://support.google.com/googlehome/answer/9248719

The weights and thresholds are independently implemented plugin heuristics, not a reproduction of Nest's undisclosed formulas.
