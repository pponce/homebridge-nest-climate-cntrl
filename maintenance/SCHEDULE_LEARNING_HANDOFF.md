# Schedule learning implementation

## Objective and repository

Improve intentional heating-schedule preference learning, expose its settings, explain heating-response observation alongside Nest control, move Climate rules above Sensors & fans, and group thermostat settings into clear collapsible cards.

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Remote base: `0bc0406173d9c19b444aa61cc7cf794f71a1ad31`, main / v0.6.12.
- Branch: `feature/schedule-learning-patterns`.
- Draft PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/43.
- Validated implementation commit: `379e1389ff7957f33140d4a471b3ac28643f2540`.
- Release authorization: publish stable v0.6.13 on GitHub with changelog and release notes, and supply the maintainer-run npm publication script. Do not publish to npm or change live devices from this environment.

## Completed changes and decisions

- Separate preference learner groups nearby local times, counts one final choice per date, applies exponential recency weights, requires a supporting-date minimum and weighted agreement, and proposes an actually selected temperature.
- Per-thermostat advanced settings control day grouping, evidence minimum, history window, half-life, time similarity, schedule rounding, temperature similarity and agreement. Defaults retain separate-weekday learning. Grouped modes deliberately propose entries for all days in the selected group.
- Only intentional room/manual choices are evidence. Compensation, schedule changes, Eco, other time zones, future data and non-heating events are excluded. Silence does not imply comfort or presence.
- History remains bounded to 500 observations and now retains up to 90 days; the default evidence window is 42 days.
- Automatic application only replaces confirmed plugin-owned nearby entries. Conflicting user entries require manual approval. Native edits invalidate ownership when values differ; manually saving a heating schedule clears ownership on confirmation. Failed writes retain their uncertain intent. Queue guards recheck learning settings.
- Settings use the existing config save/stage flow, strict shared validation, Celsius storage and Fahrenheit difference conversion. They apply without restarting and do not enable auto-apply.
- Heating-response observation remains advisory. Help explains True Radiant, Early-On, Heat Pump Balance, target-write intervals and adjustment limits. No predictive heating controller or equipment-timing setting was added.
- Sidebar and compact menu share the reordered navigation.
- Each thermostat's settings are contained in one bordered card, collapsed by default on a fresh page load. Its summary shows heating type, configured rule count, response observation, Home display preference and Apple Home extras, including unsaved changes. Cards expand independently and preserve their state through edits and saves. The Apple Home settings have a separate inner border. Saving an invalid field reopens its containing sections for correction.

## Validation checkpoint

- 285 focused unit/integration tests passed across scheduling, learner, config, temperature control, heating response, schedule display and polling.
- New learner and shared settings contract reached 100% local line, branch and function coverage before final formatting.
- Build and required-file verification passed.
- Remote CI passed lint, full tests and coverage gates, build verification, migration checks and package installation on all six declared Node/Homebridge combinations: 22/1.11.4, 22/2.4.0, 24/1.11.4, 24/2.4.0, 26/2.4.0 and 24/2.5.0.
- Standalone server CI and both jobs running the complete embedded, standalone and reverse-proxy browser suite passed. Browser coverage includes advanced learning save/reset, Celsius/Fahrenheit differences, invalid-value rejection, thermostat cards collapsed by default, keyboard opening, independent thermostat state, draft summaries, saved expansion, Apple Home borders, and mobile width. All nine applicable implementation jobs passed; the separate visual-publication job is intentionally skipped for this branch.
- Implementation check runs: https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/44481186872 and https://github.com/pponce/homebridge-nest-climate-cntrl/actions/runs/44481186857.
- Local dependency installation is blocked by registry network access and Chromium cannot start under the local socket restriction; remote CI supplied the full runtime/browser validation.
- Live Nest/backend/hardware behavior has not been verified. No claim of perfect True Radiant coordination is made; bounded setpoint changes can still influence native predictions.

## Exact next steps

1. Integrate the release commit into main by fast-forward after confirming the expected remote base, then wait for the existing gated release workflow.
2. Verify the v0.6.13 release, exact commit, uploaded assets and helper checksum. Return maintenance/publish-0.6.13.sh as one complete SSH-safe block.
3. For hardware validation, review suggestions before enabling auto-apply, confirm a manual schedule entry is protected, save learning settings in each host, and monitor a radiant heating cycle with bounded compensation.

## Design sources

- https://nest.com/support/images/Whitepapers/Nest_Auto_Schedule_Whitepaper.pdf
- https://nest.com/support/images/misc-nest-thermostat/3rd-gen/Nest-Fall-Whitepaper.pdf
- https://support.google.com/googlehome/answer/9250165
- https://support.google.com/googlehome/answer/9246532
- https://support.google.com/googlehome/answer/9248719

The weights and thresholds are independently implemented plugin heuristics, not a reproduction of Nest's undisclosed formulas.

## v0.6.13 release preparation

- package.json, lockfile, release marker, public changelog and existing stable helpers target 0.6.13.
- Publisher bootstrap: maintenance/publish-0.6.13.sh; helper SHA256: `045a1edbaa331407c50a832f3eda4a15b2a9ac4de9e4e46c627eb27ef3850d58`.
- The workflow derives stable release notes from the exact v0.6.13 changelog section and gates GitHub publication on the full test matrix and browser checks.
