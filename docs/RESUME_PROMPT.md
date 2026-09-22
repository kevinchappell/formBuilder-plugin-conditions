# Resume prompt

Continue the conditional visibility plugin work from the handoff in `/home/kevin/Dev/OpenSource/formBuilder/formBuilder-plugin-conditions/docs/HANDOFF.md`. The approved spec and six-task plan are under `docs/superpowers/`. The user chose subagent-driven development and wants independent tasks parallelized where safe. Work on plugin branch `feat/conditional-visibility`; do not modify core unless a specific missing hook is proven, and do not touch the pre-existing core `package-lock.json` change. The plugin repository is outside the writable workspace root, so file writes/commits may need `require_escalated`.

At handoff, HEAD is `a5680be`, plugin worktree is clean, and `npm test -- --configLoader native` passes 53 tests. Tasks 1 and 2 are fully implemented and reviewed. Task 3 is implemented and spec-approved but still needs code quality review. Task 5 is implemented and its non-input target fix `a5680be` needs spec re-review, then quality review. Tasks 4 and 6 remain. `src/index.js` has no public exports yet.

Resume with the pending reviews, fix and re-review findings, then implement Tasks 4 and 6. Run full tests and build, perform final feature review, and report completed work and any remaining risks. Do not merge, publish, or open a PR without separate authorization. Keep the user updated during long work; do not ask whether to continue between tasks.
