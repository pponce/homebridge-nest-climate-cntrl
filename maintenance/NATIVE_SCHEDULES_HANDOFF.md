# Native temperature schedules and room preference learning

## Objective
Add Overview thermostat controls for Nest Auto-Schedule, editable weekly schedules and clearing schedules. Learn room-temperature preferences locally and save suggestions to Nest only after approval. Temperature rules request Nest learning off by default, with an explicit warned On override.

## Repository and branch
- Repository: pponce/homebridge-nest-climate-cntrl
- Branch: feature/native-schedules-room-learning
- Base: f82078a3d03f74fce2d2d7abb0084ba6713e45cb (main, 0.6.12-beta.1)
- No release/version bump, npm publication, live thermostat write or deployment.

## Completed
- Per-thermostat expandable schedule controls in shared standalone/Homebridge Overview UI.
- Auto-Schedule toggle with inline enable confirmation and persistent On-state warning.
- Heat/Cool/range editor with day/time/temperature entries, Fahrenheit conversion, draft retention, stale-revision checks, and explicit save confirmation.
- Clear all reported editable schedule modes; sensor schedules and other thermostat settings remain separate.
- Native Google trait writes using explicit state masks. All batch operation results are checked. Actual acceptance remains device/account-dependent.
- Default learning-off policy before compensation on devices reporting learning capability; explicit On choice persists. Unsupported models retain existing rule behavior with an unavailable notice.
- Bounded local learning from explicit dashboard/Apple Home room changes and confirmed manual requests. Compensation, Eco and schedule events are excluded.
- Suggestions require three similar observations on distinct dates for the same weekday/half-hour, over a 42-day window. Approval merges one heating entry; dismissal does not write Nest.
- Pending actions persist across restart, do not automatically replay, and require matching current-session feedback. Float32/temperature quantization is tolerated for confirmation.
- Authentication/origin/CSRF route coverage, wire-request construction tests and integration coverage through the existing climate engine.

## Verification
- Tested code commit: 94622a3e9df698571a27e5bbef76ae482f98aab8.
- Draft PR: https://github.com/pponce/homebridge-nest-climate-cntrl/pull/39
- Focused schedule, feedback, climate engine/dashboard, system SET and web route suites: 244 tests passed.
- GitHub Test run 44238505713 passed all six Node/Homebridge combinations (Node 22/24/26 with Homebridge 1.11.4/2.4.0/2.5.0 as configured), including lint, coverage, build, migration and package checks. Dashboard browser job passed.
- Standalone climate dashboard run 44238505882 passed server and browser jobs; optional visual-review job was skipped.
- New schedule module coverage: 97.87% lines, 92.64% branches, 94.12% functions; reviewed baseline adds this module without lowering existing floors.
- Schedule browser coverage includes phone-width layout, enable confirmation, Fahrenheit editing, draft retention, clear cancellation, missing-mode toggle and no page errors.
- Local dependency/browser restrictions were resolved for verification by using the existing CI environment.
- Live Nest/Google acceptance and physical device behavior are NOT verified. Readable traits do not establish write permission. This change remains a draft until device validation is completed.

## Important decisions
- Preserve existing native schedules when disabling learning.
- Clear schedules via explicit setpoint-field replacement on reported schedule traits, not a factory reset or guessed reset resource label.
- Approved schedules live in Nest; this does not create a second local schedule executor.
- Learned entries are suggestions only; no automatic schedule publication.
- Default-disable cannot be enforced when the thermostat does not report the learning trait. The UI states this limitation.
- Do not restore Auto-Schedule automatically when a rule is removed or disabled.
- No backups were created.

## Exact next steps
1. On an explicitly selected test thermostat, verify learning toggle writes and current-session reported feedback. Test a reviewed schedule edit, then removal of a test entry. Do not clear a live weekly schedule merely to validate the endpoint.
2. Verify whether replacing setpoints removes old map keys on the actual backend. An unchanged map must remain unconfirmed; do not claim reset support until observed.
3. Verify suggestion approval preserves all unrelated schedule entries and native room-average compensation still adopts a confirmed scheduled target.
4. Review the full application on the installed thermostat configuration, including Homebridge embedding.
5. Resolve any failures, then prepare a beta only when requested. Ask before npm publication.
