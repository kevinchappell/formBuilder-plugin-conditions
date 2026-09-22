# Conditional Visibility Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone plugin that lets authors attach one typed visibility rule to an ordinary formBuilder field and applies it in formRender, with no planned core changes.

**Architecture:** A small rule model validates and evaluates saved `showWhen` data. The builder adapter composes public formBuilder hooks and replaces the explicit Save button so invalid rules cannot pass the plugin save path. The render adapter strips plugin metadata before formRender and manages visibility and input disabling per container.

**Tech Stack:** JavaScript ES modules, jQuery/formBuilder/formRender peer APIs, Vite, Vitest, jsdom. Development tests import the adjacent `../formBuilder/src/js` source; the published plugin uses public jQuery plugin APIs only.

---

## File map and boundaries

- `package.json`, `vite.config.js`, `vitest.config.js`, `tests/setup.js`: package, build, test harness. No runtime logic.
- `src/rules.js`: field indexing, source type classification, operator lists, rule validation, cycle detection, pure evaluation. No DOM.
- `src/editor.js`: populate and synchronize the condition controls in an existing field editor. No saving or rendering.
- `src/builder.js`: compose formBuilder options, assign stable IDs, handle clone/remove, validate explicit saves, own the builder controller.
- `src/runtime.js`: call formRender, map field IDs to rendered wrappers, update visibility and disabled states, own listeners and cleanup.
- `src/index.js`: public exports only.
- `tests/hooks.test.js`, `tests/rules.test.js`, `tests/builder.test.js`, `tests/runtime.test.js`: focused tests. Add tests for concrete failure risks; do not mirror every line.
- `README.md`, `examples/basic.html`: install, integration, supported behavior, and a working checkbox/date example.

Do not modify `../formBuilder` during the plugin implementation. A failed hook probe is the trigger to document a precise additive core change and revise this plan before editing core.

## Task 1: Scaffold and prove the public hooks

**Files:** Create `package.json`, `vite.config.js`, `vitest.config.js`, `src/index.js`, `tests/setup.js`, `tests/style.js`, `tests/hooks.test.js`.

- [ ] **Step 1: Create the package and test configuration.** Keep the first package private until Task 6 verifies the public API. Run `npm install` in the plugin directory after adding these files. The local test imports from the adjacent formBuilder checkout; published runtime code uses the installed peer plugins.

```json
{
  "name": "formbuilder-plugin-conditions",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/formbuilder-plugin-conditions.umd.js",
  "module": "dist/formbuilder-plugin-conditions.js",
  "scripts": { "test": "vitest run", "build": "vite build" },
  "peerDependencies": { "formBuilder": "^3.23.1", "jquery": ">=3.4.1" },
  "devDependencies": {
    "jquery": "^3.7.1", "vite": "^8.0.16", "vitest": "^4.1.9", "jsdom": "^29.1.1"
  }
}
```

```js
// vite.config.js
import { defineConfig } from 'vite'
export default defineConfig({ build: { lib: {
  entry: 'src/index.js', name: 'FormBuilderConditions', formats: ['es', 'umd'],
  fileName: format => format === 'es'
    ? 'formbuilder-plugin-conditions.js' : 'formbuilder-plugin-conditions.umd.js'
}, rollupOptions: { external: ['jquery'], output: { globals: { jquery: 'jQuery' } } } } })
```

```js
// vitest.config.js
import { defineConfig } from 'vitest/config'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const requireFromCore = createRequire(new URL('../formBuilder/package.json', import.meta.url))
const language = requireFromCore('formbuilder-languages')['en-US']
export default defineConfig({
  define: { FB_EN_US: JSON.stringify(language) },
  resolve: { alias: [{ find: /.*\.(css|less|sass|scss)(\?.*)?$/,
    replacement: fileURLToPath(new URL('./tests/style.js', import.meta.url)) }] },
  test: { environment: 'jsdom', setupFiles: ['./tests/setup.js'] }
})
```

```js
// src/index.js and tests/style.js are initially empty ES modules.
export {}
```

```js
// tests/setup.js
import $ from 'jquery'
globalThis.$ = globalThis.jQuery = $
window.$ = window.jQuery = $
process.env.FB_JEST_TEST = 'TEST'
$.fn.sortable = function () { return this }
```

- [ ] **Step 2: Write a probe test, then run it.** Import `../../formBuilder/src/js/form-builder.js` and `../../formBuilder/src/js/form-render.js`. Create a builder with `typeUserAttrs['*']` for `conditionId` and `showWhen`, plus `onAddField`, `typeUserEvents['*'].onclone`, and a custom `actionButtons` entry. Add a field, call `actions.getData('js')`, reopen it, clone it through the UI, and click the custom action. Assert the ID persists, `showWhen` round trips as an object, the clone callback runs, and the custom button runs. Also render a text field and locate its `.form-group` wrapper. Run `npm test -- tests/hooks.test.js`; expect the probe to fail until the config and test are wired, then pass.

```js
const config = {
  typeUserAttrs: { '*': {
    conditionId: { label: 'Condition ID', value: '' },
    showWhen: { label: 'Conditional display', showWhen: {
      sourceId: '', operator: '', value: ''
    } }
  } },
  onAddField(_id, field) { field.conditionId ||= 'c_probe' },
  actionButtons: [{ id: 'conditions-save', type: 'button',
    label: 'Save', events: { click: () => { clicked = true } } }]
}
```

- [ ] **Step 3: Record the hook outcome and commit.** Add `docs/hook-probe.md` with a table of `onAddField`, nested `typeUserAttrs`, `onclone`, custom Save action, and rendered wrapper; mark each pass/fail and the observed value. Run `npm test -- tests/hooks.test.js` and `npm run build`; expect both to pass. Commit with `git add package.json package-lock.json vite.config.js vitest.config.js src/index.js tests docs/hook-probe.md && git commit -m "test: prove conditions plugin hooks"`.

## Task 2: Rule model and validation

**Files:** Create `src/rules.js`, `tests/rules.test.js`.

- [ ] **Step 1: Write failing pure tests.** Use `validate(fields)` to assert: duplicate `conditionId`, missing source, self-reference, A→B→A cycle, unsupported operator, and an option value removed from a select each produce an issue with `{ fieldId, code }`. Assert a valid checkbox rule and date `greaterThan` rule return no issues. Use `evaluate(rule, sourceField, answer)` to assert checked, contains, numeric, date, and blank behavior. Run `npm test -- tests/rules.test.js`; expect missing exports.

```js
expect(validate([{ type: 'checkbox', conditionId: 'a', name: 'a' },
  { type: 'text', conditionId: 'b', name: 'b',
    showWhen: { sourceId: 'a', operator: 'checked' } }])).toEqual([])
expect(evaluate({ sourceId: 'a', operator: 'greaterThan', value: '2026-09-01' },
  { type: 'date' }, '2026-09-02')).toBe(true)
```

- [ ] **Step 2: Implement the exact rule vocabulary.** Export `sourceKind(field)` returning `checkbox`, `multi`, `choice`, `number`, `date`, `text`, or `null`; `operatorsFor(field)` returning `checked/unchecked`, `contains/notContains`, `equals/notEquals`, or `greaterThan/lessThan` as specified in the design; `evaluate(rule, sourceField, answer)`; and `validate(fields)`. Treat missing values as false for ordered comparisons and when a source is hidden. Use `Number(...)` only after rejecting blank input and `Number.isNaN`; compare HTML date `YYYY-MM-DD` strings only after validating both values against `/^\d{4}-\d{2}-\d{2}$/`. For choices, compare saved option `value`, never label. Build an ID map, report duplicates, and detect cycles with DFS states `visiting`/`visited`.

```js
export function evaluate(rule, source, answer) {
  if (answer == null || answer === '') return rule.operator === 'unchecked'
  switch (rule.operator) {
    case 'checked': return answer === true
    case 'unchecked': return answer !== true
    case 'equals': return String(answer) === rule.value
    case 'notEquals': return String(answer) !== rule.value
    case 'contains': return Array.isArray(answer) && answer.includes(rule.value)
    case 'notContains': return Array.isArray(answer) && !answer.includes(rule.value)
    case 'greaterThan':
    case 'lessThan': {
      const left = sourceKind(source) === 'date' ? String(answer) : Number(answer)
      const right = sourceKind(source) === 'date' ? rule.value : Number(rule.value)
      if (sourceKind(source) === 'date' &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(left) || !/^\d{4}-\d{2}-\d{2}$/.test(right))) return false
      if (sourceKind(source) !== 'date' && (Number.isNaN(left) || Number.isNaN(right))) return false
      return rule.operator === 'greaterThan' ? left > right : left < right
    }
    default: return false
  }
}
```

- [ ] **Step 3: Run `npm test -- tests/rules.test.js` and commit.** Expect all rule cases to pass. Commit `src/rules.js` and `tests/rules.test.js` with `git commit -m "feat: validate and evaluate visibility rules"`.

## Task 3: Field editor and stable IDs

**Files:** Create `src/editor.js`, begin `src/builder.js`, create `tests/builder.test.js`.

- [ ] **Step 1: Write failing builder tests.** Test that loading a form without IDs assigns unique IDs; renaming a source leaves a target's `sourceId` unchanged; cloning regenerates only the clone's ID and keeps its `showWhen`; removing a source clears dependent rules. Verify existing caller `onAddField`, `onOpenFieldEdit`, `onRemoveField`, and type-specific `onclone` callbacks each execute once. Run `npm test -- tests/builder.test.js`; expect missing `createBuilder`.

- [ ] **Step 2: Implement editor controls through public hooks.** `onOpenFieldEdit(panel)` finds its owning `.form-field`, reads `actions.getData('js')`, and uses `conditionId` to identify the target. Build a checkbox switch, source `<select>`, operator `<select>`, and value input/select inside the existing `.form-elements-inner`; use `.fld-showWhen` inputs with `name="showWhen[sourceId]"`, `name="showWhen[operator]"`, and `name="showWhen[value]"` so formBuilder's `getAttrVals` creates the nested object. On source changes, rebuild operator and value choices from `operatorsFor(source)`. For `values`, create `<option value="...">label</option>` using DOM APIs and preserve stored values. When disabled, remove `showWhen` editor controls so exported data omits the property. Never hide a field on the editor stage.

```js
const input = (name, value = '') => Object.assign(document.createElement('input'), {
  name: `showWhen[${name}]`, value, className: `fld-showWhen-${name}`
})
const source = document.createElement('select')
source.name = 'showWhen[sourceId]'
source.className = 'fld-showWhen-sourceId'
```

- [ ] **Step 3: Implement stable ID and hook composition in `src/builder.js`.** `createBuilder(container, options)` calls `$(container).formBuilder(mergedOptions).promise`; its `onAddField` assigns `conditionId` before the editor is built. Generate `c_` plus `crypto.randomUUID()` when available, or hex from `crypto.getRandomValues` otherwise. For every type-specific callback supplied by the caller, compose the plugin `onclone` callback so formBuilder's type-over-wildcard behavior does not skip it. In `onclone`, write a new ID to the clone's `.fld-conditionId` input. In `onRemoveField`, clear `showWhen` inputs on dependent fields and dispatch `input` to refresh formBuilder data. Compose caller callbacks after the plugin operation, preserving their arguments and return values.

```js
function compose(plugin, caller) {
  return (...args) => {
    plugin?.(...args)
    return caller?.(...args)
  }
}
```

- [ ] **Step 4: Run `npm test -- tests/builder.test.js` and commit.** Expect all editor data, callback, rename, clone, and removal assertions to pass. Commit `src/editor.js`, `src/builder.js`, and `tests/builder.test.js` with `git commit -m "feat: edit conditions on existing fields"`.

## Task 4: Explicit save validation

**Files:** Modify `src/builder.js`, `tests/builder.test.js`; create `src/index.js`.

- [ ] **Step 1: Write failing save tests.** Initialize a builder with a dangling source rule and a spy callback. Click the plugin Save button; expect one inline error, zero callback calls, and no plugin `save()` result. Repair the rule and click again; expect one callback with JSON form data. Also assert the built-in Save button is absent and caller action buttons remain. Run `npm test -- tests/builder.test.js`; expect failure.

- [ ] **Step 2: Replace explicit Save using existing options.** Add `save` to `disabledActionButtons`, append `conditions-save` to `actionButtons`, and capture the caller's `onSave` rather than passing it to core. `controller.validate()` calls `validate(builder.actions.getData('js'))`; treat an all-empty `showWhen` object as no rule. `controller.save()` returns `{ ok: false, issues }` on failure and `{ ok: true, formData }` after `builder.actions.save()` on success. Remove all-empty `showWhen` objects from the returned form data before calling the caller callback once. The action button calls `controller.save()`. Render errors next to their target field editor and clear them after repair. Export `validate` from `src/index.js` for callers with their own persistence path.

```js
function save() {
  const issues = validate(builder.actions.getData('js'))
  if (issues.length) { showIssues(issues); return { ok: false, issues } }
  const formData = builder.actions.save().map(field => {
    if (field.showWhen && !field.showWhen.sourceId && !field.showWhen.operator) {
      const { showWhen, ...clean } = field
      return clean
    }
    return field
  })
  callerOnSave?.(formData)
  return { ok: true, formData }
}
```

- [ ] **Step 3: Run `npm test -- tests/builder.test.js` and commit.** Expect invalid rules to block the plugin Save action. Commit `src/builder.js`, `src/index.js`, and `tests/builder.test.js` with `git commit -m "feat: validate conditions before save"`.

## Task 5: Render adapter and visibility lifecycle

**Files:** Create `src/runtime.js`, `tests/runtime.test.js`; modify `src/index.js`.

- [ ] **Step 1: Write failing runtime tests.** Render a checkbox source and required text target. Assert the target starts hidden/disabled, checked shows/enables it, unchecked hides/disables it, and `$(container).formRender('userData')` excludes the hidden answer. Test date comparison, retained values, a hidden source forcing a downstream target hidden, authored disabled controls remaining disabled, two independent containers, rerender without duplicate listeners, `destroy`, and invalid/cyclic rules failing closed. Run `npm test -- tests/runtime.test.js`; expect missing `render`.

- [ ] **Step 2: Implement render with per-container state.** Keep a `WeakMap<Element, State>`. `render(container, options)` calls `destroy(container)`, parses JSON string or array, validates, makes a deep copy of fields, deletes `conditionId` and `showWhen` from the copy, and calls `$(container).formRender({ ...options, formData: cleanFields, onRender: () => {} })`. Resolve each field's named input and nearest standard `.form-group` wrapper within that container; use `resolveFieldElement(field, container)` when supplied. Read answers from checked state, selected value(s), or input value. Evaluate dependencies in topological order; treat a hidden source as unanswered. Add one delegated `input` and `change` handler to the container; recompute on either event. Call the caller's `onRender` only after the initial visibility update, so it observes the final state.

```js
function setVisible(wrapper, visible, originalDisabled) {
  wrapper.hidden = !visible
  wrapper.querySelectorAll('input, select, textarea, button').forEach(control => {
    if (!originalDisabled.has(control)) originalDisabled.set(control, control.disabled)
    control.disabled = visible ? originalDisabled.get(control) : true
  })
}
```

- [ ] **Step 3: Implement cleanup and unsupported-mode behavior.** `destroy(container)` removes listeners, restores remembered disabled states, clears `hidden` only on wrappers the plugin changed, and deletes the WeakMap entry. `render` rejects `dataType: 'xml'` or `render: false` with a clear error. It warns and hides affected targets if a source is missing, an ID is duplicated, or a cycle exists. It leaves caller input data untouched. Export `render` and `destroy` from `src/index.js`.

- [ ] **Step 4: Run `npm test -- tests/runtime.test.js` and commit.** Expect all lifecycle and validation cases to pass. Commit `src/runtime.js`, `src/index.js`, and `tests/runtime.test.js` with `git commit -m "feat: render conditional visibility"`.

## Task 6: Integration, documentation, and release readiness

**Files:** Create `README.md`, `examples/basic.html`, `tests/integration.test.js`; modify `package.json` if scripts or peer ranges need correction.

- [ ] **Step 1: Write the integrated test.** Create a builder through `createBuilder`, add a checkbox and a required text field, configure the rule through the actual editor, call plugin `save()`, render the returned form data, and toggle the checkbox. Assert that authoring, JSON output, initial visibility, event updates, validation, and `userData` agree. Add one date example. Run `npm test -- tests/integration.test.js`; expect failure until any integration gaps are resolved.

- [ ] **Step 2: Add usage docs and example.** Show package installation, required formBuilder/formRender script order, `createBuilder(...)`, `controller.save()`, and `render(...)`. Document the one-rule limit, supported types/operators, JSON-only scope, custom-layout resolver, explicit plugin Save path, `validate(formData)` for direct core exports, and the behavior of hidden answers. In `examples/basic.html`, provide actual checkbox and date rules with the saved schema from the spec; keep the example runnable with local development assets.

```js
import { createBuilder, render } from 'formbuilder-plugin-conditions'
const conditions = await createBuilder('#builder', { formData: savedFields })
const result = conditions.save()
if (result.ok) render('#output', { formData: result.formData })
```

- [ ] **Step 3: Run verification and commit.** Run `npm test`, `npm run build`, and `git status --short`; expect tests/build to pass and no generated files staged accidentally. Manually inspect the checkbox/date example in a browser. Commit docs, example, integration test, and any fixes with `git commit -m "docs: show conditional plugin integration"`.

## Plan self-check

- Every spec section maps to a task: schema and validation (2), authoring and IDs (3), save gate (4), runtime and cleanup (5), compatibility and docs (6).
- The hook probe in Task 1 is the decision point for a core change. A core patch is permitted only after a documented failing probe and a reviewed plan amendment.
- `showWhen`, `conditionId`, `createBuilder`, `validate`, `render`, and `destroy` use the same names throughout.
