# Beta 4 handoff

## Objective and repository

Add separate room-preference learning and automatic-application controls, release v0.6.12-beta.4 on GitHub, and provide the npm beta publication script requested by the user.

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Base: main at `352c112820495afb6a40934e8d7def3b1320b8f3`, v0.6.12-beta.3.
- Working branch: `feature/auto-apply-room-learning`.
- Release: v0.6.12-beta.4. The existing main-branch release workflow gates publication on validation.

## Implementation and decisions

- Learning collects supported intentional dashboard/Apple Home room-target choices. Nest schedule edits, schedule execution, compensation, Eco and unclassified external target changes do not become learning evidence.
- Automatic application defaults off and requires an explicit confirmation. Enabling it immediately starts a request to turn Nest Auto-Schedule off and waits for reported confirmation before applying existing or future qualified suggestions.
- Turning Nest Auto-Schedule on through the dashboard disables plugin automatic application, but leaves learning enabled. Turning learning off disables automatic application; reenabling learning alone does not restore automatic application.
- Background processing runs every 30 seconds without an open browser. It serializes requests and preserves unrelated entries/modes. Existing matching entries need no write.
- Persist intent before sending. Pending or failed requests block further automatic changes. Remember the newest attempted observation per weekday/time/zone so evidence aging, restart, or acknowledgement cannot replay it without new intentional evidence. A late matching confirmation can resolve a failed request.
- Queued writes recheck consent, connection, schedule, time zone and Nest learning state. Shutdown waits for in-progress automatic work and revokes its queued-write permission.
- Temperature rules remain enabled and use confirmed scheduled targets as desired room temperatures. Their sensors, compensation limits and intervals remain in effect.
- Overview navigation requests current status after any earlier status read, preserving rule drafts and showing failed reads as unavailable. Browser regression coverage changes the rule's execution state while on another page and verifies Overview refreshes automatically.
- A follow-versus-fixed room-target UX was discussed. Proposed fixed mode would pause learning/application and request Nest learning off, with reasons shown on Overview. This separate design is not implemented in beta.4.

## Validation and scope

- 224 local tests pass across schedule controls, climate automation, dashboard behavior and confirmation polling.
- Schedule module focused coverage exceeds its existing gate: 98.74% lines, 95.45% branches, 94.29% functions at the initial auto-application checkpoint.
- Build verification and whitespace checks pass. Full lint, coverage, runtime matrix, browser, package and helper simulations run in CI before the GitHub release.
- Browser fixture checks verify confirmation text, cancellation, independent controls and the learning-off disabled state.
- Full automatic-application hardware behavior remains unverified. Schedule deletion/clearing and the deferred older temperature-rule confirmation wait are not resolved by these changes.
- No live thermostat settings or npm packages are changed by implementation or tests. npm beta publication is authorized and delivered through the requested publication script; do not claim it happened until registry verification succeeds.

## Next steps

1. Pass CI on `feature/auto-apply-room-learning` and fast-forward main to its tested release commit.
2. Confirm the release workflow publishes v0.6.12-beta.4 with package, checksums, installer and npm publisher assets.
3. Provide the checksum-pinned npm publisher bootstrap. It verifies the GitHub package, publishes to `beta`, leaves `latest` unchanged and prints a report transfer command if a report is produced.
4. Install the tested beta, reload the dashboard, and validate the opt-in confirmation, Nest Auto-Schedule Off feedback, learning status and continued temperature-rule control.
