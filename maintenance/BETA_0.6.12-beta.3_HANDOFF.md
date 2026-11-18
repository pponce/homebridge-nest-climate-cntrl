# Beta 3 release checkpoint

## Objective and repository

Release `homebridge-nest-climate-cntrl` v0.6.12-beta.3 on GitHub with an installer for testing. npm publication is not authorized by this request.

- Repository: https://github.com/pponce/homebridge-nest-climate-cntrl
- Development branch: `fix/schedule-write-diagnostics`; PR #40.
- Tested functional commit: `5064bfec6d08e225ddda3d95a8c136edf85e9b5b`.
- Previous main/release: `c08da6e69ca9a44f106bbd64cb35ca22177aeee2`, v0.6.12-beta.2.
- Release preparation updates package metadata, release notes, the changelog and existing release helpers to beta.3, then fast-forwards main. The existing release workflow publishes only after validation.

## Completed changes

- Use `schedule_learning_enabled` in the native binary FieldMask while retaining the JS `scheduleLearningEnabled` value field. Live testing confirmed Auto-Schedule Off and an existing weekly schedule edit.
- Preserve complete redacted schedule-write responses, known decoded error details, headers and trailers. Provide a JSON download and distinguish failures from pending confirmation.
- Protect schedule edits with per-mode revisions. Auto-Schedule and unrelated schedule-mode changes preserve a draft; changes to the edited schedule still block a stale save, including a queued write.
- Poll local status every two seconds for pending schedule requests, up to one minute. Do not replay writes or restart Nest observation.
- Sort Overview thermostats alphabetically, with a serial-number tie-breaker. Place schedule controls directly below the temperature controller.

## Validation

- Functional commit passed all six supported runtime combinations and both dashboard workflows: runs 44312071666 and 44312071604.
- Earlier scoped schedule/polling validation passed 58 focused tests. Browser checks cover draft retention, tile order, selected thermostat retention and controller/schedule placement.
- Release preparation passes local build verification, whitespace checks, and installer/publisher success and failure simulations. GitHub's release workflow reruns lint, coverage, build, browser checks, package installation, and installer/publisher simulations before publishing the package and checksums.
- Local browser execution is unavailable because Chromium cannot create its process socket in this environment; GitHub browser checks supply validation.

## Decisions and remaining work

- Auto-Schedule Off disables learning, not execution of existing weekly schedules. Temperature rules request Off by default; an explicit dashboard On override permits Nest learning.
- Room-preference learning remains optional and approval-based. Its checkbox does not change Nest Auto-Schedule. Both learners can remain enabled; the plugin does not coordinate them. The current room learner only observes supported intentional room-target changes associated with temperature rules.
- Clearing schedules, deleting entries and approving learned additions still require device validation. Do not infer physical behavior from automated tests.
- A previously reported temperature-rule confirmation wait was deferred and is not part of this release's fixes.
- No live settings, npm publication or backups are performed by this release task.

## Exact next steps

1. Confirm the `Release Climate Cntrl` workflow succeeds for the beta.3 release commit and that `v0.6.12-beta.3` is published as a prerelease.
2. Verify the release includes `homebridge-nest-climate-cntrl-0.6.12-beta.3.tgz`, `install-execution-beta.sh` and `SHA256SUMS`.
3. Run the checksum-verified installer on the test host. It downloads before stopping Homebridge and follows stop, add, start, including a start attempt if installation fails.
4. Reload the dashboard and reopen any existing editor. Verify stable thermostat order, schedule controls below the controller, draft preservation during learning toggles, and confirmation feedback.
5. Obtain explicit approval before publishing the tested release package to npm.
