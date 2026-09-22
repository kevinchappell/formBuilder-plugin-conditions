# Conditional visibility plugin handoff

Date: 2026-09-22 (updated after completion)

## Status

All six tasks of the [implementation plan](superpowers/plans/2026-09-22-conditional-visibility-plugin.md) are implemented, spec-reviewed, quality-reviewed, and fixed on branch `feat/conditional-visibility`. A final whole-branch review found one Critical and five Important issues; a single fix wave (`dc1774a`..`6243806`) addressed all of them and a scoped re-review confirmed it. `npm test -- --configLoader native` passes 5 files / 91 tests; `npm run build` produces the ES and UMD bundles. No formBuilder core code changed. The core checkout's pre-existing modified `package-lock.json` was left alone.

Not done: merge, push, PR, or npm publish (require separate authorization). `package.json` is still `private: true`, `dist/` is git-ignored, and there is no `files`/`exports`/`prepare`/LICENSE. The example page (`examples/basic.html`) was exercised only under jsdom, never in a real browser.

## Decisions made during execution (deviations from plan text)

- Caller `onSave` is called as `onSave(evt, formData)` where `formData` is the parsed array (not core's JSON string); `evt` is undefined for programmatic `controller.save()`.
- The formRender `userData` accessor override was removed (spec forbids patching core). A hidden target's row stays in `userData` with an empty `userData: []`.
- `controller.destroy()` empties the container; core has no teardown, so core document handlers and the plugin's container `change` listeners remain.
- `controller.validate()` renders inline issues as well as returning them.
- `autocomplete` is not a supported source type (dropped from `sourceKind`).
- Number-source rule values are stored as strings (text input with `inputmode="decimal"`).
- A hidden source hides every dependent regardless of operator (fail closed); the spec sentence "treated as having no answer" is stale and should be amended.
- `hidden` inputs can be rule targets; a rule on a field `canBeTarget` rejects yields `unsupported-target` from `validate` and fails closed at render.
- The example loads core from pinned jsDelivr URLs with SRI (unpkg cannot serve the package name) plus `jquery-ui-sortable`, and the plugin from `../dist`.

## Deferred minor findings (triaged by the final review as safe to wait)

- hardcoded nine-type onclone list is dead config (builder.js:39)
- `controller` read before assignment in onOpenFieldEdit closure under editOnAdd (builder.js:77,98)
- switch off/on within a session discards the configured rule (editor.js:219)
- source removal deletes whole .condition-editor on open dependent panel (builder.js:88-90)
- caller return values dropped in onclone/onAddFieldAfter (builder.js:46,74)
- stage-visibility test asserts container not fields (tests/builder.test.js:381)
- reload path never exercised with an active showWhen (tests/builder.test.js:266,386)
- afterEach destroy sweep never matches (tests/runtime.test.js:229)
- resolveFieldElement test cannot fail (tests/runtime.test.js:379-388)
- dead/hazardous field.id identity in standardWrapperFor (runtime.js:44)
- restore() clobbers post-render app toggles (runtime.js:81-90)
- O(fields×DOM) wrapper resolution (runtime.js:39-46)
- originalDisabled snapshot precedes rAF control post-processing (runtime.js:174-176)
- no tests for missing-rendered-field warning, notify.warning fallback; rerender-listener test weak
- editor gate derives target from DOM (`type` attr + .fld-name) so named header/paragraph allowance never reachable in builder (editor.js:133-134)
- number/date value input blanks an unparseable stored value (flagged malformed-rule, but original value lost) (editor.js:203)
- randomId throws if globalThis.crypto absent entirely (builder.js:16)
- dead `unsupported-operator` entry in ISSUE_MESSAGES (editor.js:16)
- no test asserts the duplicate-id inline error
- dataType:'xml' throws an opaque SyntaxError inside core on the save path (builder.js:79); guard or document
- withoutEmptyRule keeps showWhen: null while ruleState treats null as inactive (builder.js:11)
- save() after destroy() returns { ok:false, issues:[] } indistinguishable from validation failure (builder.js:76)
- destroy() ignores core fieldEditContainer markup (builder.js:90); doc note
- mixed reads of options vs coreOptions after destructure (builder.js:40-46)
- no test for disabledActionButtons dedupe branch or non-empty validate() return (builder.js:116)
- plugin button id `<formID>-conditions-save-action` matches `[id$="-save-action"]` selectors
- createBuilder/render accept only DOM elements, not selector strings, unlike the plan sketch
- integration test extracts example schema via indentation-sensitive regex (tests/integration.test.js:257)
- example page's inline script has no committed guard (only throwaway jsdom run)
- release readiness incomplete by design (private:true, dist ignored, no files/exports/prepare/LICENSE)

Parked after the final fix wave:
- Container `change` listeners used for subtype-change repair are not removed by `controller.destroy()` (`src/builder.js` ~188-203).
- Code comment above `save()` in `src/builder.js` still describes core's payload shape; README is correct.
- `standardWrapperFor` in `src/runtime.js` still falls back to `field.id`, which core overwrites with `name`.
- `unsupported-operator` remains in `ISSUE_MESSAGES` though `validate` never emits it.
