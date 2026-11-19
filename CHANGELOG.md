<!-- Modified by pponce for Nest Climate Cntrl; derived from Nest Accfactory. See NOTICE. -->
## v0.6.12-beta.5

**Choose how room targets follow thermostat changes, with clearer Overview controls.**

### Temperature rules
- Add **Room target mode** under **Climate rules → Temperature → your rule**. **Follow thermostat and schedule** starts with confirmed thermostat intent, follows confirmed schedule targets, and needs no fixed-temperature field. **Maintain fixed room temperature** maintains the value entered in **Fixed room temperature**.
- Keep selected sensors, averaging, compensation limits, update intervals, priorities, occupancy conditions and time windows in both modes. Switching an active rule to Follow retains its room target rather than adopting an already compensated Nest target.
- While a fixed rule is selected, pause plugin learning and automatic application without erasing their saved preferences. Request Nest Auto-Schedule off even after an explicit On override, and wait for reported confirmation before control. Prevent enabling Nest learning or applying learned entries while that fixed rule is selected.
- Preserve existing weekly entries. Fixed rules keep their own room target when those entries run. Direct Nest or Apple Home target changes pause fixed rules; Resume restores the fixed target. Edit fixed targets in Climate rules. Eco suspension and automatic recovery preserve the fixed target.
- Retain configuration compatibility for rules without an explicit mode, and preserve running room intent across restart and eligible rule handoffs.

### Overview
- Show the selected target mode and distinguish fixed room targets from scheduled or manual room targets in controller details and Coming up.
- Match **Temperature schedule** to the bordered, collapsible **Temperature controlled by** section.
- Label active control **Plugin Temp Rule** in green, or amber between updates with a description explaining the interval wait.
- Keep separate **Nest Auto-Schedule**, **Plugin learning**, and **Plugin auto-apply** badges visible when collapsed. Show On in green, Off in muted red, and Paused, Waiting or Needs attention in amber; identify offline Nest state as last reported. Saved On preferences paused by a fixed rule show Paused.
- Add a separate **Off · 0%** row to fan speed graphs. The reported-state marker shows Off even when the fan retains its last speed; running-speed curves and run conditions remain separate. Unknown feedback is not displayed as Off.
- Retain the automatic Overview refresh when returning from Climate rules.

### Validation and scope
- Automated regression coverage checks target initialization, schedule confirmation, manual overrides, Eco recovery, restart, mode switches, rule handoffs, learning suspension/resumption, queued-write guards and configuration validation.
- Browser checks cover both dashboard hosts, mode-specific fields, saving, Celsius/Fahrenheit input, paused controls, collapsed status badges and phone layouts. Release gates also check the supported Node/Homebridge matrix, package installation and publication helpers.
- Complete physical-thermostat behavior still requires live validation. Automatic application remains opt-in. Nest Auto-Schedule off preserves weekly entries and is not automatically restored when a fixed rule ends.

**Updating:** Reload the dashboard after installation. Open **Climate rules → Temperature → your rule → Room target mode**, choose a mode and save. Fixed mode reveals its temperature field and explains the learning changes before saving.

This GitHub prerelease includes a checksummed package and npm publication helper for the **beta** channel; **latest** is unchanged.

## v0.6.12-beta.4

**Optional automatic application of learned room-temperature preferences.**

### Learning controls
- Keep **Learn room-temperature preferences** separate from **Automatically apply learned preferences** on each Overview thermostat tile. Automatic application defaults off, including for existing installations.
- Enabling automatic application shows a confirmation explaining that Nest Auto-Schedule will be turned off. The plugin requests Off immediately and waits for matching Nest feedback before saving qualifying heating suggestions. Existing weekly entries are retained.
- With automatic application enabled, current and future qualifying suggestions are saved without individual approval. Checks continue every 30 seconds with the dashboard closed. Each suggestion adds or replaces its own weekday/time entry while preserving other entries and schedule modes.
- Turning learning off also turns automatic application off. Turning learning back on leaves automatic application off until explicitly enabled. Turning Nest Auto-Schedule on through the dashboard turns our automatic application off while allowing preference learning to continue.

### Confirmation and control
- Refresh live status when returning to Overview so temperature-rule changes appear without pressing Refresh. Unsaved rule edits are preserved.
- Require a current connection, heating schedule and schedule time zone before automatically saving entries. Queued writes recheck consent and reported state. Matching entries are not rewritten, and failed or uncertain writes are not automatically replayed after acknowledgement or restart.
- Learn only from supported intentional room-target changes in the dashboard and Apple Home. Nest Auto-Schedule edits, scheduled target changes, compensation and Eco events do not train this learner.
- Temperature rules stay enabled. A confirmed scheduled heating target becomes the rule's desired room temperature; the selected sensors, adjustment limit and update interval continue to govern compensation.

### Validation
- Automated checks cover opt-in persistence, Nest Auto-Schedule handoff, delayed confirmation, background execution, failure/restart handling, duplicate prevention, queued cancellation, unrelated schedule preservation and exclusion of automatic changes from learning.
- Browser checks cover the confirmation message, cancellation, independent controls and mobile layout. Release validation includes the supported Node/Homebridge matrix, package installation and installer/publisher simulations.
- The complete automatic-application flow still requires live thermostat validation; automated tests do not establish physical-device execution.

**Updating:** Reload the dashboard after installing. Existing learning preferences are retained, and automatic application starts off. Open **Temperature schedule**, leave learning enabled, then select **Automatically apply learned preferences** and review the confirmation to opt in.

See the [dashboard guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.6.12-beta.4/WEB_DASHBOARD.md#temperature-schedules-and-room-preference-learning).

This is a GitHub prerelease. The publication helper publishes its tested package to npm's **beta** channel and leaves **latest** unchanged.

## v0.6.12-beta.3

**More reliable schedule controls and a consistent Overview layout.**

### Schedule controls
- Send Nest Auto-Schedule On/Off requests with the native protobuf field mask expected by Google.
- Keep open weekly schedule drafts usable when Auto-Schedule or another schedule mode changes. Saving still requires review if the weekly schedule being edited has changed.
- Check local dashboard status every two seconds while a schedule request awaits confirmation, for up to one minute. Google acceptance and reported thermostat state remain separate; a request is complete only after matching fresh feedback.
- Identify failed requests clearly and retain them for review without automatic replay.
- View and download the complete redacted Nest write response, including decoded operation details and transport metadata. The last response remains available after confirmation or restart; omitted binary data and diagnostic limits are marked explicitly.

### Overview
- Display thermostat tiles alphabetically, with a stable device identifier resolving duplicate names.
- Place **Temperature schedule · Nest Auto-Schedule** directly below each thermostat's **Temperature controlled by** box.

### Validation and beta scope
- Validation covers scoped schedule conflicts, queued-write guards, native request fields, redacted response handling, pending-request polling, tile order and responsive dashboard behavior.
- Release checks include lint, coverage and build checks across six Node/Homebridge combinations, dashboard browser checks, package installation, and installer/publisher success and failure paths.
- Schedule clearing, entry deletion and approved suggestion writes still require device-specific validation. Automated tests do not establish physical thermostat behavior.

**Updating:** Reload the dashboard after installation. Reopen any schedule editor that was already open during the update. Turning Nest Auto-Schedule off stops learning but preserves the existing weekly schedule. Room-temperature preference learning remains optional and saves suggestions to Nest only after approval.

See the [dashboard guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.6.12-beta.3/WEB_DASHBOARD.md).

This is a GitHub prerelease. The attached package can be installed directly for testing.

## v0.6.12-beta.2

**Native weekly schedule controls and approved room-temperature learning.**

### Functional changes
- Expand schedule controls on each Overview thermostat tile to view Nest Auto-Schedule, edit weekly Heat/Cool/range entries, or request clearing of reported editable temperature schedules.
- Temperature rules request Auto-Schedule off by default on supported thermostats, preserving the existing weekly schedule. Enabling it requires confirming a warning that room-average compensation can influence Nest learning; the explicit On override is remembered.
- Learn heating preferences from intentional room-temperature choices, excluding automatic compensation, Eco and schedule events. Suggestions require similar choices on at least three distinct dates for the same weekday and half-hour. Approve a suggestion to merge it into Nest's heating schedule, or dismiss it without a device write.
- Edit schedules in the selected Fahrenheit/Celsius units. Unsaved drafts survive dashboard refreshes; stale drafts are rejected before writing.
- Require current-session reported feedback for write confirmation. Uncertain requests persist across restart without automatic replay. Unsupported controls are shown as unavailable.
- Includes the Eco suspension, automatic recovery and Google feedback improvements from beta.1.

### Validation
- Automated checks cover schedule validation, native request construction, default learning policy and overrides, persistence, stale feedback, approved suggestions, and authenticated dashboard routes.
- Dashboard browser checks cover phone-width layout, toggle warnings, Fahrenheit editing, draft retention and clear cancellation.
- Release validation runs lint, coverage, build and packaging checks across six supported Node/Homebridge combinations, plus dashboard browser checks and installer/publisher checks.

### Beta limitations
- Live Google/Nest acceptance and physical thermostat behavior have not been verified. Schedule editing, clearing and Auto-Schedule writes require device validation; readable traits alone do not establish write permission.
- Clearing uses setpoint replacement. Removal of existing entries must be confirmed by Nest feedback; a submitted request is not presented as completed without matching feedback.
- Approved learning currently adds heating schedule entries. This does not create a separate local schedule executor.

**Updating:** Reload the dashboard after updating. An active temperature rule may request Auto-Schedule off when it next qualifies to control heating. Review each thermostat's reported state and pending actions in Overview. Existing accessory pairing and saved weekly schedules are retained unless you explicitly edit or clear them.

See [dashboard setup and usage](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.6.12-beta.2/WEB_DASHBOARD.md).

This is a GitHub prerelease. npm publication uses the **beta** channel and does not change **latest**.

## v0.6.12-beta.1

**Eco suspension with automatic recovery and fresher Google feedback for climate rules.**

### Functional changes
- Temperature rules temporarily suspend while Nest reports Eco and recover automatically when Eco ends and current readings and control requirements permit. No compensating heating target is sent during Eco.
- Enable **Require Resume after Eco** on a temperature rule to keep it paused until you resume it. The default is automatic recovery, including for existing rules without this option.
- Recovery uses the current Nest schedule target when available, retains room-temperature intent otherwise, and respects the adjustment interval. Explicit user pauses and conflicts involving mode, lock or active sensor still require review.
- Direct Eco requests wait for reported Eco state; rejected requests and unconfirmed requests that time out pause for review.

### Fixes
- After Google reconnects, climate control waits for the required traits from the current Observe session. A partial update cannot make cached readings ready prematurely.
- Explicit invalid readings clear affected dashboard values; ordinary deltas preserve fields they omit. Room sensors and Home/Away feedback also require current-session data.
- Callbacks from retired Observe sessions cannot overwrite current feedback, including when a transport is reused.
- Preserve trait receipt times, state types and version metadata. Heating feedback is described as **Matching heating target reported by Google**, without implying independently verified physical-device execution.

### Regression coverage
- Tests cover partial and invalid updates, reconnect recovery, retired callbacks, room-sensor and Home/Away freshness, accepted matching-target feedback and full platform delivery.
- Eco tests cover default suspension/recovery, opt-in Resume, explicit pauses, fresh-data requirements, schedule recovery, direct-command success/failure, restart recovery and lock conflicts.
- Validation includes lint, coverage, build, migration and package checks across Node 22/24/26 and the supported Homebridge matrix, plus dashboard/browser checks. Release packaging also exercises installer and npm-publisher success and failure paths.
- Hardware and live Google/Nest backend behavior have not been verified by these automated tests.

**Updating:** Reload the dashboard after updating. An already-paused rule requires **Resume** once; ambiguous saved pauses are not automatically cleared. Future Eco periods use the selected recovery policy. Existing accessory pairing is retained.

This is a GitHub prerelease. npm publication uses the **beta** channel.

## v0.6.11

- Clarify the temperature-based fan speed fields and help: the calculated percentage rises between the configured temperatures, while mapped fans change physical speed at their mapped boundaries.
- Show the percentage curve's start and maximum temperatures beside each fan's first mapped speed-change temperature. Update these explanations with draft settings and selected units, and identify ranges that allow only one physical setting.
- Label mapped table output as Command sent to fan and explain the stable percentage used within each setting. Fan control calculations and saved rule settings retain their behavior.

## v0.6.10

- Add a temperature-based speed graph directly to Overview fan cards, with a current room-average guide, calculated curve point and separate reported-setting marker.
- Draw reachable mapped settings as steps within the rule's minimum and maximum. Show the percentage curve and supported setting when a complete mapping is unavailable. Follow the selected Fahrenheit/Celsius units and resize the graph for compact cards.
- Label pending feedback, update intervals and paused/inactive previews. Hide position markers when current room readings are unavailable, and keep off or out-of-range feedback explicit. Viewing the graph sends no device commands.

## v0.6.9

- Extend manual fan-hold shortcuts to every whole hour from 1 through 8 hours under When to run. Selecting a shortcut fills the duration in minutes; Save changes applies it.
- Indent duration, shortcuts, daily time and related help beneath After a manual fan change, with a subtle vertical guide. Wrap shortcuts across rows on narrow screens.
- Add one Time zone setting beside Temperature units, defaulting to the Homebridge host’s system zone. Scheduled rule windows and daily fan resume times use it; per-rule time-zone selectors are removed. Changes apply without a restart.
- Show up to 10 speed-curve rows per fan. When the selected range is fully mapped and has at most 10 reachable settings, show each physical setting with its temperature interval and requested percentage. Omit speeds outside the rule’s minimum and maximum. Larger sets and unmapped curves use evenly spaced samples.

- Add an optional read-only Big Ass Fans layout audit in the repository maintenance tools. It separates configured bridge caches from backups, identifies duplicated or orphaned light services, and can inspect the live local bridge without changing accessories or access settings.

**Updating:** Existing rule clock times use Settings → Time zone. Check the displayed system zone or select the zone in which those times should apply. Imported Nest schedules retain their thermostat/home time-zone interpretation.

## v0.6.8

- Add optional manual fan hold policies under When to run: Resume only, a duration from 1 minute to 7 days with 1/2/3-hour shortcuts, or the next daily time in a named time zone. All-day rules can respect an evening scene until a chosen morning time.
- Apply a manual hold to every rule sharing that fan. Use the controlling rule’s policy, or the highest eligible rule when no rule controls it. Further detected manual changes restart the hold; feedback within the same mapped physical speed does not.
- Preserve hold deadlines across restarts and recheck fan availability, temperature, occupancy, time windows and priorities before automatic control resumes. Expiry does not force the fan on.
- Show the hold deadline and originating rule in Overview and rule execution details. Changing a saved hold policy starts a new hold for fans already held by that rule; Resume can end it early.
- Keep explicit user pauses, restart-pause preferences, failed commands and conflicting pending feedback separate from timed manual holds. Existing rules default to Resume only.

**Updating:** Choose an automatic-resume policy separately for each fan rule. Recognized saved manual changes without a detection timestamp start their hold when the setting is applied. Ambiguous saved feedback errors require review and Resume. Daily times follow the selected zone: skipped clock times wait for their next occurrence; repeated times use the next occurrence.

## v0.6.7

- Add optional Occupied/Home or Unoccupied/Away requirements to temperature and fan rules under When to run. Select an individual occupancy sensor or a combined presence rule; combined outputs include motion holds, Away delays and manual presence overrides.
- Evaluate presence before dependent rules, require both the time window and occupancy condition, and preserve rule priorities. Unknown or unavailable occupancy cannot establish Home or Away. Release owned settings when the condition clears and resume when it matches again.
- Recover delayed fan speed and power feedback automatically without repeating accepted commands. Tolerate separate power and speed reports, retain pending ownership across restarts, and compare settled speeds using saved fan mappings for both speed and power-only rules.
- Distinguish fan feedback recovery from conflicting settings. Update accepted commands when confirmed, keep conflicting device changes suspended for review, and show fan execution details without unrelated Nest room-target text.
- Give rule setup sections larger, stronger headings. Align thermostat readings, humidity rows and controls across adjacent Overview cards, including cards with a desired room target and an additional reported Nest target.

- Make the runtime graph expand with the neighboring schedule card, keep its legend and coverage details at the bottom, and resize chart geometry without stretching labels. Show an explicit message when observed days contain no heating or cooling.

**Updating:** Existing rules keep their behavior until an occupancy requirement is selected. A fan already suspended by an earlier release still needs one explicit Resume after its reported power and speed have been reviewed; old suspended state does not contain enough command evidence to distinguish a timeout from an intentional change. Subsequent pending feedback can recover automatically. Existing user pauses remain in effect.

## v0.6.6

- Recover automatically from delayed automatic heating-command and Nest schedule feedback. Refresh observation after 30 seconds, back off further refreshes to a maximum five-minute interval, and show Recovering feedback after two minutes while awaiting confirmation. Never resend an accepted heating command as part of recovery.
- Retain pending heating feedback across bridge restarts. Recover saved schedule-confirmation waits when current equipment and schedule checks permit; preserve user pauses, restart-pause preferences, failed commands and conflicting Nest settings.
- Follow the current schedule event when another event becomes due during recovery. Ignore late confirmation of a superseded schedule target and retain the normal adjustment interval after confirmation.
- Coordinate refreshes for thermostats sharing an account and allow staggered room-sensor readings to return before restoring targets.
- Show the pending Nest target, confirmation-wait start, automatic-recovery status and next feedback refresh in thermostat details and rule execution status. Identify retained schedule targets while paused or waiting, and label heating requests superseded by a schedule change.

## v0.6.5

- Show compact fan and presence cards with matching icons and the same desktop card width as thermostats. Cards use a single column on narrow phone screens, and expanded details do not stretch adjacent cards.
- Include discovered Homebridge room fans on Overview even when Off or without a climate rule. Show current power, speed and saved mapped setting independently of rule activity; identify unavailable readings and retain known fans when a bridge drops out during the dashboard session.
- Refresh fan cards as source discovery completes. Keep live fan status separate from the saved rule explanation and retain expanded details across refreshes.
- Show Home & away only when a presence rule is saved. Keep disabled rules and rules awaiting engine feedback visible; raw presence sensors alone do not show this section.

## v0.6.4

- Show each rule-assigned room fan on Overview with reported power and speed, the selected rule, individual temperature inputs, their average, run thresholds, speed calculations and pending feedback.
- Explain combined presence with each source’s current contribution, last observed activity, motion holds, Away delay and manual overrides. Identify unavailable inputs and retain the distinction between current and last-known status.
- Expand thermostat rule details with sensor readings, the room average, temperature compensation and adjustment limits, target origin and update timing.


- Add optional manual speed-range mappings to individual fans in Sensors & fans. Add or remove labeled inclusive ranges, validate overlaps and bounds, and save without restarting the child bridge.
- Use configured mappings in fixed-speed and temperature-based rules, speed previews, feedback confirmation, manual-change detection and restoration. Avoid redundant commands within a physical setting; preserve native fan capabilities and rule command limits. Fans and percentages without mappings retain their normal behavior.
- Make the selected thermostat and mode prominent in Coming up. Show only relevant heating/cooling schedule targets in chronological order, explain the active climate rule’s effect, and provide accessible schedule help.
- Move Nest sensor-selection diagnostics to Settings → Diagnostics & troubleshooting.

This release also includes the v0.6.3 Nest feedback recovery and requested-versus-reported target diagnostics below. Existing accounts, rules and accessory identities are preserved. Fan mappings are optional and empty by default.

## v0.6.3

- Refresh Nest observation once when an accepted automatic heating target remains unconfirmed for 30 seconds. Keep the original temperature command and update interval; do not resend the command.
- Continue temperature-group control when matching Nest feedback returns. Wait for room sensors during recovery, preserve manual target changes, and pause if confirmation remains unavailable after two minutes.
- Distinguish a feedback timeout from a conflicting Nest target. Show the requested target, latest reported target and last device-update time, including while a group is paused.
- Report heating commands as awaiting confirmation, confirmed or unconfirmed so the execution status reflects the command outcome.

## v0.6.2

- Remove unsupported camera, doorbell and floodlight implementations, video assets, camera-only protocol definitions and streaming dependencies from the source and published package.
- Preserve the Nest climate integration and pinned HomeKitDevice, HomeKitHistory and fetchWrapper libraries.
- Include upstream acknowledgments at the end of the README, third-party notices and bundled-library license texts in the distribution.
- Verify production-package installation, required notices and the absence of camera/media code in the compatibility checks.

Existing Nest Climate Cntrl installations retain their settings and accessory identities.

## v0.6.1

- Enable Homebridge’s native Save button for restart-required configuration edits, including accessory and connection settings. Keep those edits staged until Homebridge saves them and offers its bridge restart prompt.
- Apply live climate settings with the interface’s Save changes button. Preserve the standalone dashboard’s Save and Restart child bridge flow.
- Validate staged settings, preserve credentials and bridge identities, and clear drafts on discard. Save the optional web login separately from connection configuration.

## v0.6.0

- Schedule temperature groups and fan rules using start days, start/end times, and a named time zone. Overnight windows are supported. Always is the default for all-day operation, including existing rules.
- Reorder temperature groups by dragging or using keyboard controls. The highest eligible group controls each thermostat; handoffs preserve the original target, minimum update interval, and temporary desired room temperature.
- Pause temperature automation across all groups for a thermostat, including the optional pause after manual target changes. Restart recovery selects the currently eligible window after equipment checks.
- Show Scheduled, Standby, Waiting, and active control states in both the Homebridge configuration interface and standalone dashboard. Fan windows preserve priority, manual overrides, and bounded restoration behavior.


## v0.5.4

**Account setup within the climate interface.**

- Manage Nest/Google credentials and optional web access from **Menu → Accounts & web access**, directly below Settings, using the shared responsive layout.
- Open account setup on first install when no usable account is saved. Open Overview on later visits, including when the bridge is temporarily unavailable.
- Configure the first web login before starting the bridge. Web access remains off by default, and the Homebridge interface works independently.
- Save account settings with **Save changes**, preserving climate rules, device settings and bridge identity. Keep edits visible when saving fails or configuration changes elsewhere.

## v0.5.3

**Compact navigation for Homebridge and mobile.**

- Use a collapsed Menu button in Homebridge Settings and on narrow standalone web screens. Navigation opens over the page, highlights the current page and closes after selection, outside interaction or Escape.
- Give climate settings and rule editors the full available width. Preserve the desktop dashboard sidebar and retain unsaved edits when switching between wide and narrow layouts.
- Keep navigation colors readable with Homebridge themes and in light or dark mode, with keyboard navigation and touch-friendly controls. The standalone mobile menu includes Sign out.

Saved accounts, climate rules, web access settings and accessory identities are preserved.

## v0.5.2

**Homebridge climate configuration interface.**

- Load the shared climate interface using JavaScript assets supported by Homebridge Config UI X. Settings, climate rules and sensor discovery work within Homebridge without enabling standalone web access.
- Keep connection setup accessible if climate interface assets cannot load, with guidance to reopen Settings or refresh Homebridge.
- Validate the installed package's shared interface and exercise embedded settings with Homebridge's restriction on additional HTML documents.

Saved accounts, climate rules, web access settings and accessory identities are preserved.

## v0.5.1

**Configured startup and resilient climate services.**

- Keep the plugin inactive until a usable, non-excluded Nest or Google account is configured. No dashboard listeners, automation timers or discovery start without an account, even when standalone web access is requested.
- Keep standalone web access off by default. Homebridge Settings remains available for account setup and opens the connection form when the climate runtime is unavailable. Configure an account, save and restart the bridge before setting up optional web access.
- Handle missing or malformed platform configuration with a logged message instead of an uncaught exception. Catch startup failures, clean up partially started services and retain native thermostat integration when optional climate services cannot start.
- Complete remaining shutdown steps if a component fails, and prevent services from starting after shutdown is requested. Log unexpected configuration-request, cached-accessory and Apple Home status-update failures without exposing their error contents.
- Clarify the climate feature set, independent project maintenance and supported device scope in the README. Project funding links point to pponce's GitHub Sponsors and PayPal.

Existing configured installations retain their saved web access setting, climate rules and accessory identities. This release does not enable standalone web access automatically.

## v0.5.0

**Nest Climate Cntrl: room temperature groups, fan automation and a live climate dashboard.**

- Adjust temperature directly on a standalone dashboard thermostat card using an inline editor with plus/minus controls, a numeric field, Apply and Cancel. Active climate rules edit the desired room temperature and show the adjusted Nest target separately. Native control and paused rules edit Nest heating/cooling targets, including both limits in Heat • Cool mode. Celsius and Fahrenheit are supported.
- Temperature commands show the requested target while checking feedback for up to 30 seconds. Failed or unconfirmed commands show the last reported setting. Stop waiting dismisses the check without reversing a command already sent. Stale edits, unsupported modes, Eco, lock, offline devices and invalid target ranges are checked before dispatch.
- Combine selected Nest and Homebridge temperature sensors using an equal average. Heating rules apply bounded target adjustments while retaining Nest's built-in control sensor. Confirmed built-in selection works when optional room-sensor scheduling metadata is absent. Missing or conflicting active-sensor feedback prevents compensation.
- Manual Nest target changes move the group's desired temperature by the same increase or decrease by default. Each rule can instead pause after a manual change. The optional per-thermostat Apple Home room-temperature display shows the group reading and desired target; it defaults off. Direct room-target edits retain the group and its adjustment interval.
- Previously active temperature and fan rules recover after a bridge restart once current readings and equipment checks pass. Explicit pauses remain paused. Pause after bridge restart is optional and defaults off. The overview distinguishes native control, active rules, waiting conditions and paused rules.
- Run Homebridge room fans by temperature or Nest heating/cooling activity. Choose the last setting, a fixed speed or a bounded temperature-based speed curve. Order competing rules by dragging them, with keyboard controls also available. Manual fan overrides suspend automatic control until Resume.
- Combine Nest Home/Away, motion and occupancy into a separate Climate presence accessory using any/all logic, motion holds and an Away delay. Timed Home/Away overrides are available; combined presence does not change Google's Home/Away or Eco state.
- Review heating response and tuning recommendations for the selected heating type, with local observations, confidence and explicit Apply controls.
- Homebridge Settings and the standalone dashboard share climate settings, source discovery, rule editors, help, previews and execution status. Temperature action editing appears only in the standalone dashboard. Eco commands use optimistic feedback with a bounded confirmation wait.
- The optional dashboard supports direct HTTPS, direct HTTP or HTTPS through a local reverse proxy, with separate sign-in, authenticated commands, CSRF protection, responsive layouts and light/dark themes. Weekly schedules and observed runtime remain available.
- Retain supported Nest thermostats, associated room sensors, Heat Links, Protect and native Home/Away, plus compatible legacy Google refresh-token authentication. Optional Apple Home Eco and HVAC fan timer switches default off.

Existing Nest Climate Cntrl installations update normally. Moving from Nest Accfactory or Plus requires a fresh Climate child bridge and Apple Home pairing; follow [Migration](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0/MIGRATION.md). This climate edition does not expose cameras, doorbells, floodlights, Yale locks or weather. See the [dashboard guide](https://github.com/pponce/homebridge-nest-climate-cntrl/blob/v0.5.0/WEB_DASHBOARD.md) for setup, controls and rule behavior.

[Support development](https://github.com/sponsors/pponce) · [Report an issue](https://github.com/pponce/homebridge-nest-climate-cntrl/issues)

# Nest Accfactory Plus changelog

## v0.4.4

### Nest Accfactory Plus

- Incorporates upstream Nest Accfactory 0.4.4.
- Retains legacy Google OAuth refresh-token authentication for compatible existing credentials. New legacy credentials cannot be generated.
- Preserves the NestAccfactory platform name, original accessory UUID namespace and existing camera identities.
- Packages nested camera modules and updated shared dependencies.

### ⚠️ Compatibility Changes

- Cameras and doorbells now require **FFmpeg 7.1 or newer**, including the video and audio codecs required by the plugin
- Homebridge 2 users must update to **Homebridge 2.4.0 or newer**; Homebridge 1.x remains supported on Node.js 22 and 24
- Added Node.js 26 beta support when using Homebridge 2.4.0 or newer
- Home/Away, Weather, Thermostats, Temperature Sensors and Heat Links now require the Google API to be enabled; Nest REST-only accounts no longer provide these accessories. Weather forecasts continue to use Nest REST polling
- Removed the HomeKit chime switch and the `chimeSwitch` option; configure the indoor chime and Quiet Time in Nest/Google Home instead

### 📹 Cameras and Doorbells

- Fixed a regression caused by a protobuf library update that reconnected NexusTalk cameras when two-way talk ended
- Fixed live view closing when the HomeKit microphone was idle, improving two-way audio availability before and between conversations
- Improved live-view startup time for cameras connected through Google Home and recovery after damaged or incomplete video packets
- Improved cleanup after failed or interrupted streams and recordings, preventing delayed callbacks from stopping replacement sessions or reopening streams after they were closed
- Improved HomeKit Secure Video recording startup and compatibility across software and hardware encoders
- Fixed Raspberry Pi hardware encoder detection and selection, including systems where the encoder is not `/dev/video0`; unavailable or unusable hardware encoders fall back to software encoding [@pace8](https://github.com/pace8)
- Fixed Raspberry Pi streaming failures with some video settings, recordings that would not appear or play in the Home app, and intermittent Raspberry Pi 4 HKSV timeouts [@pace8](https://github.com/pace8)
- Restored camera off/on control through the Home app recording settings after a camera was switched off in the Nest app [#345](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory/issues/345) [@go-faustino](https://github.com/go-faustino)
- Fixed standalone Nest Cam battery devices being identified as wired floodlight cameras
- Restored camera activity polling and corrected Google camera event handling, including vehicle and package events
- Default to two simultaneous live viewers per camera; `maxStreams` supports one to four viewers independently of HKSV recording
- Added `ignoreIndoorChime` to allow HomeKit doorbell alerts while the indoor chime is disabled. It defaults to `false`; Quiet Time continues to silence HomeKit doorbell alerts

### 🏠 Accessories and Controls

- Fixed Home/Away status failing to update in the Home app or incorrectly showing Away during startup
- Fixed weather accessories sometimes failing to appear during startup and restored regular weather updates
- Improved accessory discovery when device details arrive across separate updates, including thermostats, Heat Links, Protects, locks and cameras
- Fixed thermostat Off changes made in the Nest app not appearing correctly in HomeKit
- Fixed thermostat humidity controls and readings when heating/cooling was off or humidifier and dehumidifier capabilities changed
- Fixed temperature sensor active status not updating when the thermostat selected a different sensor
- Corrected fan and hot-water timer deadlines and initial thermostat and Heat Link values
- Improved external Daikin thermostat controls, including switching fan or dehumidifier operation off and keeping controls independent across multiple thermostats
- Failed device commands now report errors instead of updating the plugin's saved state as though the change succeeded

### 🔐 Reliability and Privacy

- Improved account reauthorisation, reconnect handling and shutdown so retired connections cannot restart background work or overwrite current device state
- Improved handling of Nest and Google updates so incomplete or rejected Nest data does not overwrite the preferred Google device state
- Improved support-dump redaction for credentials and personal details, and limited diagnostic collection and output
- Preserved configuration file permissions during legacy migration and restricted access to backups containing credentials

### 🔁 Maintenance

- Updated HomeKit support and dependencies while retaining existing accessory identities and Eve history compatibility
- Improved stream failure diagnostics and expanded automated regression coverage

### Known Issues

- Some newer Nest/Google cameras may use different video sizes or aspect ratios, causing the video to appear slightly cropped or not fill the screen correctly
- Enabling HomeKit Secure Video (HKSV) on battery-powered cameras will significantly reduce battery life
- Motion sensing on wired Nest Protect devices may report incorrect states due to recent firmware changes
- Video from Google Home-hosted streams may be slow to start up


## Upstream release history

# Change Log

All notable changes to `homebridge-nest-accfactory` are documented in this file.  
Pre-release notes for alpha and beta versions are maintained separately in `PRERELEASE_NOTES.md`.  
This project adheres to [Semantic Versioning](http://semver.org/).

### Known Issues

- Some newer Nest/Google cameras may use different video sizes or aspect ratios, causing the video to appear slightly cropped or not fill the screen correctly
- Enabling HomeKit Secure Video (HKSV) on battery-powered cameras will significantly reduce battery life
- Motion sensing on wired Nest Protect devices may report incorrect states due to recent firmware changes
- Video from Google Home-hosted streams may be slow to start up

## v0.4.4 (2026/10/20)

### ⚠️ Compatibility Changes

- Cameras and doorbells now require **FFmpeg 7.1 or newer**, including the video and audio codecs required by the plugin
- Homebridge 2 users must update to **Homebridge 2.4.0 or newer**; Homebridge 1.x remains supported on Node.js 22 and 24
- Added Node.js 26 beta support when using Homebridge 2.4.0 or newer
- Home/Away, Weather, Thermostats, Temperature Sensors and Heat Links now require the Google API to be enabled; Nest REST-only accounts no longer provide these accessories. Weather forecasts continue to use Nest REST polling
- Removed the HomeKit chime switch and the `chimeSwitch` option; configure the indoor chime and Quiet Time in Nest/Google Home instead

### 📹 Cameras and Doorbells

- Fixed a regression caused by a protobuf library update that reconnected NexusTalk cameras when two-way talk ended
- Fixed live view closing when the HomeKit microphone was idle, improving two-way audio availability before and between conversations
- Improved live-view startup time for cameras connected through Google Home and recovery after damaged or incomplete video packets
- Improved cleanup after failed or interrupted streams and recordings, preventing delayed callbacks from stopping replacement sessions or reopening streams after they were closed
- Improved HomeKit Secure Video recording startup and compatibility across software and hardware encoders
- Fixed Raspberry Pi hardware encoder detection and selection, including systems where the encoder is not `/dev/video0`; unavailable or unusable hardware encoders fall back to software encoding [@pace8](https://github.com/pace8)
- Fixed Raspberry Pi streaming failures with some video settings, recordings that would not appear or play in the Home app, and intermittent Raspberry Pi 4 HKSV timeouts [@pace8](https://github.com/pace8)
- Restored camera off/on control through the Home app recording settings after a camera was switched off in the Nest app [#345](https://github.com/n0rt0nthec4t/homebridge-nest-accfactory/issues/345) [@go-faustino](https://github.com/go-faustino)
- Fixed standalone Nest Cam battery devices being identified as wired floodlight cameras
- Restored camera activity polling and corrected Google camera event handling, including vehicle and package events
- Default to two simultaneous live viewers per camera; `maxStreams` supports one to four viewers independently of HKSV recording
- Added `ignoreIndoorChime` to allow HomeKit doorbell alerts while the indoor chime is disabled. It defaults to `false`; Quiet Time continues to silence HomeKit doorbell alerts

### 🏠 Accessories and Controls

- Fixed Home/Away status failing to update in the Home app or incorrectly showing Away during startup
- Fixed weather accessories sometimes failing to appear during startup and restored regular weather updates
- Improved accessory discovery when device details arrive across separate updates, including thermostats, Heat Links, Protects, locks and cameras
- Fixed thermostat Off changes made in the Nest app not appearing correctly in HomeKit
- Fixed thermostat humidity controls and readings when heating/cooling was off or humidifier and dehumidifier capabilities changed
- Fixed temperature sensor active status not updating when the thermostat selected a different sensor
- Corrected fan and hot-water timer deadlines and initial thermostat and Heat Link values
- Improved external Daikin thermostat controls, including switching fan or dehumidifier operation off and keeping controls independent across multiple thermostats
- Failed device commands now report errors instead of updating the plugin's saved state as though the change succeeded

### 🔐 Reliability and Privacy

- Improved account reauthorisation, reconnect handling and shutdown so retired connections cannot restart background work or overwrite current device state
- Improved handling of Nest and Google updates so incomplete or rejected Nest data does not overwrite the preferred Google device state
- Improved support-dump redaction for credentials and personal details, and limited diagnostic collection and output
- Preserved configuration file permissions during legacy migration and restricted access to backups containing credentials

### 🔁 Maintenance

- Updated HomeKit support and dependencies while retaining existing accessory identities and Eve history compatibility
- Improved stream failure diagnostics and expanded automated regression coverage

## v0.4.3 (2026/08/11)

### ⚠️ Compatibility Changes

- Homebridge 2 users must update to **Homebridge 2.3.1 or newer** before installing this release
- Updated Eve history support for Homebridge's new storage system
  - Existing Eve history data remains compatible and is not migrated, rewritten, or lost

### 🛠️ Fixes

- Fixed a Nest × Yale lock startup regression affecting some accessories [@alexis-andino](https://github.com/alexis-andino) / [@DigitalFokus](https://github.com/DigitalFokus)
- Fixed thermostat setpoint changes from HomeKit so heat and cool targets update the correct Nest setpoints
- Fixed Homebridge UI-X validation warnings from optional blank Home/Device placeholder rows [@starlessblack](https://github.com/starlessblack)
- Fixed Heat Link Eve Home history and status handling

### 📹 Camera Streaming Improvements

- Major internal rewrite of camera and doorbell streaming to improve reliability across live view and HomeKit Secure Video
- Improved WebRTC streaming for Google Home-hosted cameras, with smoother live playback and fewer short audio interruptions
- Improved audio/video synchronisation during live camera playback
- Improved handling of brief network jitter, packet reordering, and stream timing drift
- Improved handling of large, high-resolution WebRTC keyframes using bounded limits that adapt to the source resolution and bitrate
- Improved WebRTC video jitter-buffer performance by reducing repeated packet scans, sorting, and queue rebuilding
- Reduced repeated H264 frame scanning and unnecessary keyframe copying when preparing video output
- Added WebRTC connection and media statistics to support dumps, including ICE/DTLS state, candidate details, round-trip time, packet loss, jitter, NACKs, and PLIs
- Improved HomeKit Secure Video (HKSV) startup and decoder compatibility
- Improved stream recovery and reconnect handling for Nest and Google Home camera sessions
- Improved camera handling after Nest/Google credential refreshes, backend redirects, and device migration events
- Reduced ffmpeg timestamp warnings during live streaming and recording

### 🔁 Behaviour Changes / Improvements

- Improved thermostat and Heat Link service updates when optional fan, humidifier, dehumidifier, hot water temperature, or hot water boost features appear or change
- Improved Nest/Google account connection, retry, token refresh, and shutdown handling
- Improved Nest Protect smoke, carbon monoxide, wired/battery, and heat/temperature status handling
- Aligned device naming across plugins for more consistent HomeKit accessory names

### 📦 Dependency Updates

- Updated `chalk` from `5.6.2` to `6.0.0`
- Updated `protobufjs` from `8.0.3` to `8.7.2`
- Updated `werift` from `0.23.0` to `0.24.4`, removing the transitive `werift-ice` and `ip` dependency chain
  
## v0.4.1 (2026/05/07)

### ⚠️ Compatibility Changes

- Minimum supported Homebridge 2.x version is now **2.0.2**
  - Includes Homebridge-side fixes required for reliable HomeKit Secure Video behaviour
  - Earlier Homebridge 2.x releases are no longer officially supported

- Minimum supported FFmpeg version is now **6.1**
  - Older FFmpeg 6.0 builds are no longer officially supported

### ✅ Homebridge 2.x

- Removed the beta tag from Homebridge 2.x support
- Homebridge 2.x is now considered stable and fully supported when running **Homebridge 2.0.2 or newer**

### 🛠️ Fixes

- Fixed handling of Nest Heat Link hot water temperature data [@dhemesbrahma-commits](https://github.com/dhemesbrahma-commits)
  - Prevents HomeKit warnings when hot water temperature is unavailable
  - Hot water temperature controls are now hidden when unsupported by the connected system

- Improved FFmpeg detection and compatibility
  - Better support for macOS Homebrew installations, including Apple Silicon systems
  - Improved automatic FFmpeg discovery across supported platforms
  - Improved handling of custom FFmpeg paths and startup failures

- Improved camera streaming stability and cleanup
  - Fixed ffmpeg process exit handling for live streams, recordings, and two-way audio
  - Helps prevent stale HomeKit camera sessions after unexpected ffmpeg exits
  - Improved cleanup of reconnect, observe, and streaming timers during shutdown and reconnect cycles

- Improved protobuf and gRPC handling
  - Added shared protobuf schema caching to reduce repeated protobuf loading across camera and transport modules
  - Improved stability of long-running Google observe and streaming connections

- Improved HTTP retry handling
  - Retry logic now avoids retrying authentication and client-side failures such as `401`, `403`, and `404`
  - Reduces unnecessary API requests and improves overall reliability

- Improved internal logging and diagnostics
  - Improved handling of failed background API and gRPC requests to avoid unexpected plugin instability

### 📦 Dependency Updates

- Updated `protobufjs` from `8.0.1` to `8.0.3`
- Updated `werift` from `0.22.9` to `0.23.0`

## v0.4.0 (2026/04/30)

### ⚠️ Breaking Changes

- Dropped support for Node.js 20
  - Minimum supported Node.js version is now **22**
  - Node.js 20 is approaching end-of-life and is no longer actively tested
  - This plugin is now tested against Node.js **22 and 24**, aligning with newer Homebridge environments

- **HomeKit Secure Video (HKSV) is now mandatory for all cameras**
  - The `hksv` configuration option has been removed
  - All cameras now expose HKSV capability by default
  - Recording behaviour is controlled via HomeKit settings in the Apple Home app

- Plugin debug logging is now **independent of Homebridge debug mode**
  - Running Homebridge with `-D` will no longer enable debug output for this plugin
  - Debug output is now controlled by the `debug` configuration option (Verbose Logging)

- Weather station configuration is now **per-home**
  - Global `weather` and `elevation` options have been removed
  - Weather settings must now be configured using the `"homes"` array
  - Existing configurations may need to be updated to re-enable weather stations

### ✨ New Features

- Added support for a new `"accounts"` section in `config.json` to enable multiple Nest and Google accounts  
- Added plugin-level **verbose logging** option  
  - Enables debug output without requiring Homebridge debug mode  
  - Verbose log messages are displayed in gray to mirror Homebridge debug mode for easier identification  
- Added `logMotionEvents` option (global and per-device, enabled by default)  
  - Controls logging of motion events for cameras, doorbells, and Nest Protect devices  
- Added support for Nest Hub Max (1st gen, wired)  
- Added new **Home/Away accessory** per structure  
  - Exposes Nest home/away state as a HomeKit **OccupancySensor**  
  - Replaces occupancy reporting previously exposed on thermostat devices  

### ⚙️ Configuration & GUI

- Updated Nest/Google account configuration in the GUI to a combined **Accounts** section  
- Added **Home Settings** section to the GUI configuration  
  - Configure settings for individual Nest or Google homes  
- Added **Device Settings** section to the GUI configuration  
  - Configure global device-level options  
  - Supports per-device overrides  
  - Not all configuration options are exposed in the GUI and may require manual configuration  

### 🎥 Camera & Motion

- Updated camera motion handling — only a single motion sensor is now exposed per camera  
- Improved reliability of camera and doorbell snapshot images  
- Improved camera streaming stability and performance 

### 🔁 Behaviour Changes / Improvements

- Prefer Google API data when a device is available from both Google and Nest APIs
- Disabled weather stations are no longer reported as "excluded" in logs  

### 🛠️ Fixes

- Fixed an issue affecting live view and HKSV recording on migrated Nest/Google cameras  
- Fixed an issue affecting audio talkback on some older migrated Nest/Google cameras  
- Fixed an issue where the Google API observe connection could terminate on slow networks, causing the plugin to stop  
- Fixed an issue where Nest Protect settings would not update when Eve history integration was enabled

### 🧹 Internal Changes

- Refactored core modules to align with the updated base class  
- General code cleanup and stability improvements  

### 📚 Documentation

- Updated `README.md` with documentation for:  
  - `"accounts"` configuration section (`./README.md#Account Configuration`)  
  - Updated `"devices"` configuration section (`./README.md#devices`)  
  - Updated `"homes"` configuration section (`./README.md#homes`)  
  - Verbose logging and Support Dump options  
  - HKSV behaviour (recording is triggered by general motion events and does not support individual recording filters)   

### 📦 Dependency Updates

- Removed `undici` dependancy 
- Updated `protobufjs` from `8.0.0` to `8.0.1`

## v0.3.9 (2026/02/18)

- General code cleanup and stability improvements
- Fixed remaining issues with snapshot handling on some Nest/Google cameras
- Added strict checks to ensure the ffmpeg binary includes all required libraries for streaming from Nest/Google cameras, as per `README.md`
- Added battery level reporting for Nest/Google battery powered cameras (experimental)
- Updated `README.md` with a recommendation for a pre-built ffmpeg binary option
- Refined thermostat mode and temperature adjustments from the Home app

## v0.3.8 (2026/02/06)

- General code cleanup and stability improvements
- Fixed WebRTC streaming issues when a home does not contain any devices [@benbean303](https://github.com/benbean303)
- Fixed an issue where snapshots could appear empty on some Nest/Google cameras
- Added support for Nest Cam Outdoor (2nd gen, wired)
- Added support for Nest Doorbell (3rd gen, wired)

## v0.3.7 (2025/12/17)

This marks the final release of 2025. A huge thank you to everyone who’s used the plugin, reported issues, tested changes, and contributed feedback throughout the year. Your support genuinely helps shape the project.

- Fixed parsing of time values in the configuration file [@currybeast](https://github.com/currybeast)
- Added support for **Nest Cam Indoor (3rd gen, wired)**
- Added support for **Nest Doorbell (2nd gen, wired)**
- Added support for **Nest Thermostat (3rd gen v2)**
- Updated `README.md` with instructions to obtain Google issueToken and cookie using Safari (the only supported method)
- Refined repetitive connection status logging to only appear in debug mode [@MorelloCherry](https://github.com/MorelloCherry)

## v0.3.6 (2025/12/01)

- General code cleanup and stability improvements for Homebridge 2.0 compatibility
- Fixed an issue where hot water temperature control was not exposed for certain Nest Heat Link configurations [@josdegroot] (https://github.com/josdegroot)
- Added support for a new `"homes"` section in `config.json` to enable per-home configuration options
- Updated `README.md` with documentation for the new `"homes"` configuration section (`./README.md#homes`)
- Updated `README.md` to clarify Google authentication requirements, including that the required cookie **should start with `SIDCC=`**
- Removed the deprecated `"elevation"` device-specific configuration option

## v0.3.5 (2025/11/21)

- General code cleanup and stability improvements
- Fixed battery level reporting for Nest Thermostat (2020) 
- Updated instructions for obtaining access token for Nest accounts
- Updated instructions for obtaining issue token and cookie for Google accounts  
- Updated disclaimer in `README.md` to clarify support for official Homebridge installations only
- Added debug logging for thermostat mode and temperature changes received from outside of HomeKit [@MorelloCherry](https://github.com/MorelloCherry)

## v0.3.4 (2025/10/17)

- General code cleanup and stability improvements  
- General typo and grammar corrections  
- Fixed handling of the per-device `"hksv"` setting  
- Fixed thermostat cooling stage 3 checking  
- Fixed thermostat fan state checking
- Fixed periodic camera snapshots when camera is turned off
- Updated camera resource assets

## v0.3.3 (2025/08/23)

- Refined timeout warnings for camera and doorbell snapshot capture  
- Fixed video feed on/off control for HKSV-enabled cameras  
- Fixed battery percentage and transition state reporting for Nest × Yale Locks  
- Fixed handling of the global `"exclude"` device setting  
- Fixed support for `~` (home directory) in the `"ffmpegPath"` option  
- Fixed fan-related errors for Nest Thermostats  
- Improved authorisation handling: Nest/Google login will no longer retry repeatedly on `Unauthorized` or `Forbidden` responses  
- Fans that support only a single speed will now expose **only On/Off**, without the `RotationSpeed` control

### Thanks
Special thanks to [@Edwin](https://github.com/DigitalFokus) for testing and feedback on refinements to Nest X Yale support!

## v0.3.2 (2025/08/09)

- Now Homebridge Verified
- Refactored core to use the updated base class
- Refactored plugins for better codebase separation
- General code cleanup and improved stability
- Improved camera streaming and HKSV recording
- Initial support for video hardware acceleration during recording
- Initial support for Nest x Yale locks (more testing needed)
- Fixed missing audio on newer Nest/Google cameras
- Fixed missing Nest/Google cameras after Google Home migration
- Fixed startup errors caused by invalid thermostat temperature settings
- Fixed doorbell notifications
- Fixed EveHome integration (history recording)
- Fixed interference from other `undici`/`fetch` instances in Homebridge
- Fixed issue when setting device properties via Nest API
- Added support for hot water temperature control on compatible EU/UK thermostats — [see README](./README.md#devices)
- Removed support for using Nest Heat Link devices as room temperature sensors
- Removed standalone Docker version

### Thanks
Special thanks to [@Daniel](https://github.com/no1knows), [@Matthew](https://github.com/mphyde), [@Erik](https://github.com/esille), [@Neil](https://github.com/BertrumUK) and [@Guy](https://github.com/grhall) for testing and feedback on this release!
 
## v0.3.1 (2025/06/16)

- Minor stability improvements affecting standalone docker version

## v0.3.0 (2025/06/14)

- General code cleanup and stability improvements
- Introduced plugin-style architecture for Nest/Google devices
- Updated `README.md` to reflect changes to the `"devices"` section in configuration
- Prevent excluded devices from being restored from Homebridge cache
- Added internal support for selecting active temperature sensor (not yet exposed to HomeKit)
- Fixed loss of custom devices section when using the plugin config UI
- Fixed motion services being recreated when restored from Homebridge cache
- Fixed missing devices for Nest FieldTest accounts
- Added hot water heating boost (on/off) support for compatible EU/UK Thermostats
- Added support for Nest Heat Link devices as room temperature sensors

### Deprecation Notice
- Support for the standalone Docker version of this plugin is planned to be deprecated in an upcoming release. While it currently remains functional, future updates may no longer include Docker-specific build support. Users are encouraged to transition to standard Homebridge installations where possible.

### Known Issues

- Audio from newer Nest/Google cameras and doorbells is currently silent (blank audio output)
- The ip npm package has a known security advisory [GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp); this is used indirectly via the werift library

### Thanks
Special thanks to [@Daniel](https://github.com/no1knows) and [@Brad](https://github.com/bcullman) for testing and feedback on this release!

## v0.2.11 (2025/04/17)

- General code cleanup and bug fixes

## v0.2.9 (2025/03/23)

- General code cleanup and bug fixes
- Support for Nest Protect(s) in Google Home app
- Default location to check for ffmpeg binary is now `/usr/local/bin`
- Logs Nest Protect(s) self testing status

## v0.2.5 (2024/12/10)

- Fix for dropped sub modules.. Do not know why!

## v0.2.4 (2024/12/10)

- Fix for camera video stream when audio disabled

## v0.2.3 (2024/12/06)

- General code cleanup and bug fixes
- Fix for HomeKit Secure Video recording for migrated camera/doorbell to Google Home

## v0.2.2 (2024/10/05)

- Improved handling of configuration file with docker/standalone version
- Warning about the use of legacy configuration options with docker/standalone version

## Known Issues

- Audio from newer Nest/Google camera/doorbell devices is still blank
- npm package [ip](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) has severity issue. This is being used in external library (werift)

## v0.2.1 (2024/10/05)

- HomeKit support for multiple speeds on thermostat(s)
- Audio library in docker release went walkabout. Added back in

## Known Issues

- Audio from newer Nest/Google camera/doorbell devices is still blank
- npm package [ip](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) has severity issue. This is being used in external library (werift)

## v0.2.0 (2024/10/04)

## Breaking Change

Unfortunately, from version **0.2.0**, I've made some breaking changes in the code to help move forward with the project. 
So, what does this mean for you, the end user.
1) You'll need to remove all previously discovered devices from HomeKit before adding them back in after upgrading to this version
2) If using Homebridge version, remove any cached acccesory data associated with this plug-in
3) If using docker/standalone version, remove the 'persist' folder
4) Re-add devices to HomeKit once version upgraded
5) Any HomeKit Secure Video recordings will be lost
6) Will need to re-configure camera streaming and notification options
6) Any automations will need to be re-created in HomeKit
7) History in EveHome app will be lost

Apologies for this change, as I can understand what an inconvience and frustration it will be :-(

## Changes

- General code cleanup and bug fixes
- Common configuration between Homebridge plug-in and docker/standalone versions
- Seemlessly allow Nest/Google devices to be migrated between Nest <-> Google Home apps

## Known Issues

- Audio from newer Nest/Google camera/doorbell devices is still blank
- npm package [ip](https://github.com/advisories/GHSA-2p57-rm9w-gvfp) has severity issue. This is being used in external library (werift)


## v0.1.9 (alpha)

- General code cleanup and bug fixes
- Aligned version numbering to old Nest_accfactory repo
- Audio talkback support for newer Nest/Google camera/doorbell devices

## v0.0.7 (alpha)

- General code cleanup and bug fixes
- Updated streaming/recording support for newer Nest/Google camera/doorbell devices
    - No incoming audio, just video stream

## v0.0.6 (2024-09-14)

- Fix for two/way audio starting on non-enabled HKSV camera/doorbells

## v0.0.5 (2024-09-13)

- General code cleanup and bug fixes
- External dependancy reductions, dropped pbf and axios libraries
- Nest Cam with Floodlight support with light on/off and brightness control
- Fixed issued with setting range temperatures on Nest Thermostat(s)

## v0.0.4 (2024-09-07)

- Camera/Doorbell support for snapshots and live video re-introduced
- HomeKit Secure Video recording support re-introduced
- Should support Nest Thermostat 4th Gen (untested)
- *might* have finally resolved audio sync issues with live video and recording
- Depending on the libraries present in ffmpeg binary, we limit functionality for camera/doorbells
    - missing libspeex = no two-way audio
    - missing libfdk_aac = no audio
    - missing libx264 = no streaming/recording
- Cleanup fix for when removing a camera/doorbell from Nest/Google
- Fix for virtual weather device when missing configured city and/or state details
- Fix for retrieving data from Nest systems when using both a Nest and Google accounts
- Initial support for newer Nest/Google camera/doorbell devices (streaming/recording - coming)

## v0.0.1 (2024-08-27)

- Inital re-coding from Nest_accfactory code base. These projects will now share a common code base
- Camera/Doorbell support currently removed will re-worked





