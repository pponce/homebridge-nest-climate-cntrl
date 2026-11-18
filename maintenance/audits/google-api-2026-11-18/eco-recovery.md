# Eco recovery checkpoint

Objective: default to temporary Eco suspension, with optional manual Resume policy.

Branch: fix/google-observe-readiness (PR #38). This change extends the Observe-readiness work.

Implemented: ecoBehavior accepts suspend (default) or pause. Both dashboard hosts use the Require Resume after Eco toggle. Suspension relinquishes temperature command ownership without restoring an old target, preserves room intent and update intervals, and reconciles the current Nest schedule on recovery. Explicit pauses and non-Eco conflicts remain manual. Eco commands made through the plugin wait for API feedback; failures require review. Existing ambiguous saved pauses are not automatically cleared.

Tests: 179 focused tests pass, including Eco recovery, schedule adoption, restart, explicit pause, opt-in manual recovery, direct Eco commands and validation. Full checks run in GitHub CI because local dependencies are unavailable. Not hardware verified.

No release, merge or npm publication. Next: finish CI, review the PR, and test a real Eco on/off cycle after installation. The earlier implementation checkpoint's statement that Eco behavior is unchanged is superseded by this requested change.
