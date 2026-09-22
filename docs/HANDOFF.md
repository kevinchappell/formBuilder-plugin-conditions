# Conditional visibility plugin handoff

Date: 2026-09-22

## Objective and decisions

Build `formbuilder-plugin-conditions` as a separate plugin for [formBuilder issue #478](https://github.com/kevinchappell/formBuilder/issues/478). Use existing attributes and hooks on ordinary fields; do not add a special conditional control. Prefer zero formBuilder core changes, but a minimal additive core change is allowed if a concrete hook gap is demonstrated. The [approved design](superpowers/specs/2026-09-22-conditional-visibility-design.md) adopts the authoring flow from the linked issue comment: enable “Conditional display,” choose a source field, choose a type-appropriate operator and value, and validate before explicit Save. The [implementation plan](superpowers/plans/2026-09-22-conditional-visibility-plugin.md) has six tasks.

## Repositories and branch

- Plugin: `/home/kevin/Dev/OpenSource/formBuilder/formBuilder-plugin-conditions`
- Core: `/home/kevin/Dev/OpenSource/formBuilder/formBuilder`
- Plugin branch: `feat/conditional-visibility`, currently at `a5680be` (`fix: resolve display-only conditional wrappers`). `main` remains at the plan commit `7e69da1`.
- Plugin worktree is clean at handoff. Core checkout has a pre-existing modified `package-lock.json`; do not reset or include it.
- The plugin directory is outside the current writable workspace root. Prior turns used `exec_command` with `sandbox_permissions: "require_escalated"` for writes and commits. Read-only inspection works normally.

## Implemented and verified

1. **Task 1, hook probe and scaffold:** commits `502b550`, `b8ed17c`. Public `onAddField`, wildcard `typeUserAttrs`, `onclone`, custom action button, and formRender wrapper probes pass. Spec and quality reviews approved. See `docs/hook-probe.md`.
2. **Task 2, pure rule model:** commits `247b263`, `5f79737`, `7f3f0e8`, `b748754`. `src/rules.js` exports `sourceKind`, `operatorsFor`, `evaluate`, and `validate`. It handles malformed numbers, dates, text operands, duplicate IDs, missing sources, cycles, and stale option values. Spec and quality reviews approved.
3. **Task 3, builder/editor:** commits `d4cc49d`, `ebe9bfe`. `src/builder.js` and `src/editor.js` use existing hooks to assign stable IDs, build a typed rule editor, compose callbacks, retain imported duplicate IDs for validation, handle clone/remove, and keep the stage visible. Spec review approved after duplicate-ID fix. **Code quality review was interrupted at the user's request and must be restarted.** Task 4 still needs to add save validation, inline errors, and the public controller contract.
4. **Task 5, runtime:** commits `6477162`, `776fda2`, `a5680be`. `src/runtime.js` implements conditional rendering, per-container listeners/state, metadata stripping, fail-closed invalid rules, retained hidden values with disabled inputs, userData filtering, and cleanup. Initial spec review found non-input targets (header/paragraph/button) were not resolved; `a5680be` adds wrapper lookup and a test. **Re-run spec review for that fix, then code quality review.**

At handoff, `npm test -- --configLoader native` passed: **4 files, 53 tests**. Task 1's initial ES/UMD build passed, but the full build has not been rerun after later code was added. No core code changed.

## Remaining work

1. Finish Task 3 code quality review. Route any Important/Critical finding to the Task 3 implementer or a fresh focused fix agent, then re-review.
2. Re-review Task 5 spec compliance after `a5680be`, then run Task 5 code quality review. Fix and re-review any findings.
3. Implement Task 4: replace explicit Save using `disabledActionButtons`/`actionButtons`, validate through `validate(formData)`, show inline errors, normalize inactive rules in returned data, and expose the controller's `save()`/`validate()`/`destroy()` without duplicate caller `onSave` calls. `src/index.js` is still a one-line empty module. Run focused and full tests; commit and run spec review followed by code quality review.
4. Implement Task 6: public exports, integrated builder→save→render test, README, working checkbox/date example, and full test/build check. Review both stages and commit.
5. Run final whole-feature review and verify the feature branch is clean. Do not merge, publish, or open a PR without separate authorization.

## Coordination notes

- The user explicitly chose subagent-driven development and asked for parallel work when tasks are independent. Tasks 1+2 and 3+5 were implemented in parallel. Respect file ownership when parallelizing; agents share the same worktree.
- The subagent-driven-development skill requires a spec review before a code quality review for each task, and review findings must be fixed and re-reviewed. Do not stop between tasks to ask whether to continue.
- The planned API uses canonical `field.conditionId` and `field.showWhen = { sourceId, operator, value }`. Rule references are by `sourceId`, not field name.
- Rule evaluation expects boolean checkbox answers and arrays for multi-choice answers. A hidden source must force dependents hidden, even for an `unchecked` operator.
- `createBuilder` currently returns the core builder instance; Task 4 must finish the controller API from the spec. `src/runtime.js` is not yet exported through `src/index.js`.
- `npm test -- --configLoader native` avoids read-only Vite cache writes observed during reviews.
