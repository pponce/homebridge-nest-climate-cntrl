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
