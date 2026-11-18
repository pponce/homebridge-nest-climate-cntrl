# Google Observe readiness checkpoint

Objective: prevent stale cached inputs from making climate control ready after reconnect, propagate explicit unavailable readings, and retain Google feedback provenance.

Base: pponce/homebridge-nest-climate-cntrl main at 510b153b1b8f44502e8602189c36237eef025511. Work branch: fix/google-observe-readiness.

Implemented:
- Observe generations with stale callback/completion guards, including reuse of the same transport.
- Per-trait receive time, state types and string-preserved version counters.
- Climate readiness based on critical traits received on the current Observe generation; cached values remain available for display.
- Explicit unknown temperature, target, Eco and occupancy fields clear the corresponding dashboard values instead of silently preserving them.
- Sensor receipt time is exposed independently from snapshot/read time; unchanged readings on a healthy stream do not expire merely for being unchanged.
- Matching target feedback uses wording that does not claim a separate device confirmation.
- Regression coverage through the extracted unchanged production Observe method, real mapper, dashboard, and automation readiness/feedback methods, plus direct sensor/HomeAway validity checks.

Validation: 301 existing tests plus 7 new regressions pass (308 total). Full npm run check remains blocked because npm registry access returned 403 and ESLint/Homebridge dependencies are unavailable. No live hardware/backend validation. Source syntax checks pass. Normal test, coverage, build and packaging checks are still required in CI or an installed development environment.

Decisions: preserve ACCEPTED compatibility; do not require CONFIRMED or discard lower version counters across state types until their semantics are established. State types and versions are retained for that investigation. Version-based stale-update rejection is not implemented. Existing Eco-triggered pause/Resume behavior is unchanged. No shared framework modifications, version bump, release, live installation changes or npm publication.

Next steps: review draft diff; run full CI including lint/coverage/package checks; verify reconnect and unavailable-reading recovery against a real account; examine sanitized accepted/confirmed/version sequences before adding ordering policy. The earlier reproduce.test.mjs records pre-fix behavior and is historical; the maintained regression suite is test/google-feedback.test.js.
