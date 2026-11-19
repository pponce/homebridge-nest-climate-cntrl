# Beta 5 implementation handoff

## Objective and repository

Implement Follow thermostat and schedule / Maintain fixed room temperature, make Overview schedule controls match the controller panel, publish a GitHub beta and supply the npm beta publisher.

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Base: main at `3535103c4ae56548840c775ec79885bee65d6ecc`, v0.6.12-beta.4.
- Branch: `feature/room-target-modes`.
- Release intent: v0.6.12-beta.5.

## Changes and decisions

- Explicit Follow mode needs no saved temperature. Initialize from reported thermostat intent, preserve current room intent when changing an active rule, and keep compensation from becoming new intent. Missing mode preserves configuration compatibility with the saved initial temperature.
- Fixed mode requires a saved temperature and ignores scheduled targets as room preferences, while reconciling their feedback before bounded compensation resumes. Eco recovery retains the fixed target. Manual native changes pause fixed control; Resume restores the saved target.
- Fixed values are edited in Climate rules. Fixed rules use native Nest readings in Apple Home so direct manual intent can pause the rule. Follow mode keeps the optional room-temperature HomeKit display and editor.
- Selected fixed rules pause learning and auto-application without changing stored preferences, block learned schedule writes and Nest learning On, and request Nest Auto-Schedule Off even with a prior override. Policy follows rule priority, window, occupancy, pause and enable state. Existing weekly entries remain; Nest Auto-Schedule is not automatically reenabled.
- Overview and Coming up show target mode. Temperature schedule has matching border, collapse control and three visible badges: Nest Auto-Schedule, Plugin learning, Plugin auto-apply. Off uses muted red, On green, and paused/waiting/attention amber. Paused preferences and last reported offline Nest state are identified.
- The controller badge reads Plugin Temp Rule in green during control and amber between updates, with an interval explanation.
- Fan graphs include a separate Off · 0% row. Fresh reported Off sets the hollow marker to zero independently of retained speed; the running curve remains unchanged. Unknown power does not imply Off.
- All user-facing behavior is shared between embedded and standalone dashboard hosts.

## Validation checkpoint

- 250 focused tests passed through the controller-badge update; fan Off coverage is added in the final validation. Coverage includes initialization, schedules, mode changes, restart, Eco, manual overrides, rule handoffs, priority/occupancy, learner pause/resume, queue guards and config validation.
- Browser regressions updated for mode fields, both hosts, saving, Fahrenheit bounds, fixed policy controls and collapsed status badges.
- Local build, installer/publisher simulations and whitespace checks passed. PR #42 passed full lint/coverage, six Node/Homebridge combinations, package validation and both browser suites on `f92414ceafd506b13a7e2ae41f70c94644c54c6a`. The final documentation and collapsed request-status wording use the release workflow gates again.
- Live thermostat execution has not been verified. The previously deferred temperature-rule confirmation-wait investigation is not part of this change.

## Exact next steps

1. Commit the final documentation and collapsed request-status wording, update PR #42 and main, and run the gated release workflow.
2. Verify v0.6.12-beta.5 points to that final commit and all checksummed assets are uploaded.
3. Supply a checksum-pinned npm beta publisher bootstrap. Do not claim npm publication before registry verification; the requested helper performs it on the user's host.
4. Test a real thermostat: save each mode, confirm the room target source and Nest learning state, run a schedule boundary, verify fixed learning pauses/resumes, and check collapsed Overview badges.
