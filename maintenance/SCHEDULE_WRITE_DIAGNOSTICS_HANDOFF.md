# Schedule write investigation

## Objective and current state
Investigate native Auto-Schedule writes before choosing a fallback. On beta.2, both On and Off attempts failed to change the setting. Changes made in the Nest app appear correctly in Overview and clear matching pending requests. Live write support remains unverified.

## Repository and branch
- pponce/homebridge-nest-climate-cntrl
- fix/schedule-write-diagnostics; draft PR #40
- Base main: c08da6e69ca9a44f106bbd64cb35ca22177aeee2 (0.6.12-beta.2)

## Completed
- Preserve numeric Google transport and operation codes through AggregateError handling, timeout and restart.
- Log schedule write failures at warning level without raw server payloads.
- Identify pending Auto-Schedule On/Off requests.
- Retain uncertain intent without automatic replay or false confirmation.
- 41 focused tests pass; build and bundled checks passed before formatting-only changes. Browser checks passed on the preceding diagnostic revision. Full CI is being rerun after removing unexercised inline helper functions that caused the coverage gate to fail. Existing coverage floors remain unchanged.

## Decisions
- Do not guess undocumented write formats or claim live support from schema presence.
- Keep native-write investigation limited; obtain one live response before further protocol changes.
- If native writes cannot be made reliable, change Auto-Schedule to a read-only indicator with advice to disable learning when using room-average temperature rules.
- In that fallback, run schedules locally in the plugin, with instructions to disable or reset Nest schedules. Do not implement the fallback yet.
- No npm publication, live settings changes, or backups performed.

## Next steps
1. Finish CI validation of the diagnostic branch.
2. Install the pinned diagnostic revision on the existing test installation.
3. Clear only the existing pending lock using the UI after checking Nest, then attempt Off once on a thermostat without a temperature rule.
4. Collect the dashboard's diagnostic message and schedule warning from the Homebridge log; no credentials or raw account payloads.
5. Use the returned status to determine rejection, transport failure or confirmation failure. Do not silently retry writes.
6. Validate a supported correction on the device, or implement the agreed fallback if the investigation cannot establish reliable write support.

## Complete-response diagnostic checkpoint
- Live downstairs result: transport status 0, operation COMPLETE/13. Off did not take effect. Reads from Nest work. This establishes an operation-level internal error, not a successful write awaiting feedback.
- Current diagnostic source adds the complete redacted decoded response, all frames and operations, headers/trailers, known Any error-detail decoding and Google's standard error detail schemas. Unknown binary details and diagnostic limits are explicitly marked. Raw binary metadata is omitted alongside decoded status details.
- The last response persists after timeout/restart and external confirmation. Overview provides a read-only JSON view and Download response JSON. Failure wording distinguishes retained failed intent from an outstanding request. The native write payload is unchanged.
- 45 focused tests pass. Final code commit 83a9057c6d1fab9bcfe2a9baf123424b2e2be283 passed all six runtime combinations and both browser suites, including response viewing and JSON download. CI runs: 44254843162 and 44254843125.
- Next test: install the final tested pinned diagnostic revision, reload Overview, clear the old pending lock after checking Nest, attempt downstairs Off once, then download nest-schedule-response.json from Last Nest write response (redacted). No broad logs or account dump are needed.
- Do not claim the native control works until a live correction is verified. The agreed read-only/local-schedule fallback remains deferred while investigating this response.

## Field-mask correction
- Live full-description result: COMPLETE/13 with `No such field scheduleLearningEnabled on type ...`.
- Binary protobuf FieldMask paths use server proto field names, whereas the JS value is encoded by field number. Change only the mask path to `schedule_learning_enabled`; retain the JS value `scheduleLearningEnabled`.
- Evidence: https://protobuf.dev/programming-guides/json/ describes the snake_case-to-camelCase conversion as a JSON representation rule. This connection uses binary gRPC, with the paths strings encoded literally.
- Tests exercise both On and Off payloads. Live Nest acceptance still requires verification after installing the corrected revision.
