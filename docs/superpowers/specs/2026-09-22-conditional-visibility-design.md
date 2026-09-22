# Conditional visibility plugin design

Date: 2026-09-22  
Issue: [formBuilder #478](https://github.com/kevinchappell/formBuilder/issues/478)

## Goal and scope

Ship conditional visibility as a separate `formBuilder-plugin-conditions` package. A form author can set a rule on an ordinary field: “Show this field when [another field] [comparison] [value].” The plugin adds editor controls through existing formBuilder options and applies the rule to forms rendered with formRender. The first release targets JSON form data and the standard formRender layout. It does not introduce a special control type.

The first release supports one rule per target field. Sources are built-in checkbox, checkbox group, radio group, select, text, number, and date inputs. Targets may be any ordinary rendered field with a resolvable field wrapper. Operators are checked/unchecked for a checkbox; equals/not equals for text and single-choice fields; contains/does not contain for multi-choice fields; and greater than/less than for numbers and dates. Empty source values never satisfy an ordered comparison. Dates use the browser input's ISO date value, and numbers use numeric comparison. No expression strings or arbitrary JavaScript are evaluated.

## Saved data

Each field gets a plugin-managed `conditionId` that remains stable when the author changes its `name`. A target with a rule also gets:

```json
{
  "type": "text",
  "name": "explanation",
  "conditionId": "c_7d3e5f10",
  "showWhen": {
    "sourceId": "c_2a1b6c90",
    "operator": "checked"
  }
}
```

Operators needing a comparison store a string `value` in `showWhen`. The plugin validates and coerces it according to the source type at runtime. This metadata belongs to form data, not HTML attributes. The render adapter copies the data and removes `conditionId` and `showWhen` before passing fields to formRender; it never mutates the caller's data.

## Authoring integration

The package exposes a `builderOptions(options)` adapter that returns options for `$(element).formBuilder(...)` and composes any caller-provided callbacks. It uses the wildcard `typeUserAttrs` hook to persist `conditionId` and `showWhen` on existing fields. `onAddField` assigns an ID before the field editor is built. The adapter composes `typeUserEvents.onclone` with any caller callbacks and assigns each clone a new ID. A clone keeps its rule and points at the same source. `onOpenFieldEdit` presents source fields by label and refreshes the editor's source choices. The plugin excludes self-references, fields without supported source values, and choices that would create a cycle. `onRemoveField` clears rules referencing a removed source and reports that change to the author. A renamed source keeps its ID, so references survive renaming and sorting.

The editor stage always shows every field. The rule editor is hidden for field types that cannot be resolved as targets. Existing rules are read back when form data is loaded or a field editor is reopened. The plugin shows a clear inline error for malformed imported rules or duplicate IDs; it does not silently reinterpret them.

## Rendering integration

The package exposes `render(container, { formData, ...formRenderOptions })`. It validates rules, clones and strips plugin metadata, then invokes formRender. After rendering, it resolves fields within that container by their rendered names and standard wrappers, evaluates all rules, and registers delegated `input` and `change` listeners. A source change reevaluates dependent fields, including downstream dependencies. A hidden source is treated as having no answer, even if its disabled input retains a value. Invalid references and cycles fail closed: affected target fields stay hidden and the plugin reports a diagnostic through its warning callback.

A hidden target's wrapper receives the `hidden` property, and its descendant controls are disabled. The adapter remembers each control's authored disabled state and restores it when the target becomes visible. Input values are retained while hidden. This makes native required validation and formRender `userData` omit hidden answers without discarding an answer if its field reappears. Multiple rendered forms have independent state. Calling `render` again on the same container replaces the prior listeners and state. The plugin exposes `destroy(container)` to remove its listeners and restore controls it changed.

## Compatibility boundaries

The plugin requires consumers to use its render adapter for conditional behavior; a direct call to formRender still renders the fields but does not activate rules. The first release supports JSON form data and DOM rendering. XML, `render: false` markup output, single-control rendering, nested group controls, and custom layouts are outside this first release. The adapter accepts an optional `resolveFieldElement` callback so an application can opt in a custom layout without changing core. Forms with no rules render normally through the adapter.

## Verification and core-change policy

First verify the existing hooks with a small proof of concept: ID assignment before editor construction, nested `showWhen` round-trip through `typeUserAttrs`, clone handling, and reliable field wrapper lookup after formRender. Then implement the plugin against those hooks. Tests cover authoring and reload, rename/clone/remove, checkbox and date examples from #478, chained rules, invalid/cyclic rules, retained values, validation and `userData`, rerendering, and independent containers.

No core change is planned. If the proof of concept finds a specific missing hook, document the failing case and propose the smallest additive core change before using it. The plugin must not depend on private formBuilder functions or monkey-patch core methods.
