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
- Focused schedule, feedback, climate engine/dashboard, system SET and web route suites: 236 tests passed.
- Latest full test run before the final extra route test: 923 passed; 16 suites could not load missing homebridge, chalk or protobufjs dependencies.
- npm install --ignore-scripts failed with HTTP 403 from the package registry. Lint/full coverage remain unverified.
- Build and bundled-license/camera-exclusion checks passed. Syntax and whitespace checks passed.
- Browser check is prepared at maintenance/checks/schedule-controls-browser.mjs. Playwright's bundled browser is absent; the installed Chromium fails with socket Operation not permitted. No visual or browser-interaction pass is claimed.
- Live Nest/Google acceptance and physical device behavior are NOT verified. Readable traits do not establish write permission. This change belongs in a draft PR until validation is completed.

## Important decisions
- Preserve existing native schedules when disabling learning.
- Clear schedules via explicit setpoint-field replacement on reported schedule traits, not a factory reset or guessed reset resource label.
- Approved schedules live in Nest; this does not create a second local schedule executor.
- Learned entries are suggestions only; no automatic schedule publication.
- Default-disable cannot be enforced when the thermostat does not report the learning trait. The UI states this limitation.
- Do not restore Auto-Schedule automatically when a rule is removed or disabled.
- No backups were created.

## Exact next steps
1. Run npm install --ignore-scripts in an environment with package access; run npm run check with the supported Node/Homebridge versions.
2. Run the browser check with Playwright installed (optional CHROMIUM_PATH for an available browser). Verify mobile and desktop rendering in the complete application, including Homebridge embedding.
3. On an explicitly selected test thermostat, verify learning toggle writes and current-session reported feedback. Test a reviewed schedule edit, then removal of a test entry. Do not clear a live weekly schedule merely to validate the endpoint.
4. Verify whether replacing setpoints removes old map keys on the actual backend. An unchanged map must remain unconfirmed; do not claim reset support until observed.
5. Verify suggestion approval preserves all unrelated schedule entries and native room-average compensation still adopts a confirmed scheduled target.
6. Resolve any failures, then prepare a beta only when requested. Ask before npm publication.
