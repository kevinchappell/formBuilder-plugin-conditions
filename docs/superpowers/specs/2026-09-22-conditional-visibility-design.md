# Conditional visibility plugin design

Date: 2026-09-22  
Issue: [formBuilder #478](https://github.com/kevinchappell/formBuilder/issues/478)  
Authoring reference: [Darthmaul's comment](https://github.com/kevinchappell/formBuilder/issues/478#issuecomment-404647277)

## Goal and scope

Ship conditional visibility as a separate `formBuilder-plugin-conditions` package. A form author can enable a rule on an ordinary field: “Show this field when [another field] [comparison] [value].” The plugin adds editor controls through existing formBuilder options and applies the rule to forms rendered with formRender. The first release targets JSON form data and the standard formRender layout. It does not introduce a special control type.

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

The package exposes `createBuilder(container, options)`, which initializes formBuilder with composed plugin and caller options and returns a controller with `save()`, `validate()`, and `destroy()`. It uses the wildcard `typeUserAttrs` hook to persist `conditionId` and `showWhen` on existing fields. `onAddField` assigns an ID before the field editor is built. The adapter composes `typeUserEvents.onclone` with any caller callbacks and assigns each clone a new ID. A clone keeps its rule and points at the same source. `onRemoveField` clears rules referencing a removed source and reports that change to the author. A renamed source keeps its ID, so references survive renaming and sorting.

`onOpenFieldEdit` adds a “Conditional display” switch. Source, operator, and value controls appear only when the switch is enabled. The source selector lists existing supported fields by label. Selecting a source limits the operator list to that source's type. For select, radio, and checkbox groups, the value selector uses the source's configured options and stores the option value, not its label. Text, number, and date sources use a suitable value input. A single checkbox offers checked/unchecked without a value input. The plugin excludes self-references and choices that would create a cycle.

The editor stage always shows every field. The rule editor is hidden for field types that cannot be resolved as targets. Existing rules are read back when form data is loaded or a field editor is reopened. The plugin shows a clear inline error for malformed imported rules or duplicate IDs; it does not silently reinterpret them. Disabling the switch removes `showWhen` from exported form data.

The plugin validates on edit and before explicit save: the source exists, IDs are unique, the graph has no cycle, the operator matches the source type, and a selected option value still exists. Because formBuilder's built-in Save callback runs after its save, `createBuilder` disables that button and adds a plugin Save action using the existing `disabledActionButtons` and `actionButtons` options. The plugin action calls `validate()` before its `save()` invokes core save and the caller's save callback. Invalid rules remain editable but cannot pass the plugin Save action. Callers that export through core `getData` or `actions.save` directly must call the exported `validate(formData)` first; those core APIs cannot be intercepted with the current hooks.

## Rendering integration

The package exposes `render(container, { formData, ...formRenderOptions })`. It validates rules, clones and strips plugin metadata, then invokes formRender. After rendering, it resolves fields within that container by their rendered names and standard wrappers, evaluates all rules, and registers delegated `input` and `change` listeners. A source change reevaluates dependent fields, including downstream dependencies. A hidden source is treated as having no answer, even if its disabled input retains a value. Invalid references and cycles fail closed: affected target fields stay hidden and the plugin reports a diagnostic through its warning callback. This follows the data-driven rendering idea in the linked [conditionize.js](https://github.com/renvrant/conditionize.js) project without adding it as a dependency or evaluating rule text as JavaScript.

A hidden target's wrapper receives the `hidden` property, and its descendant controls are disabled. The adapter remembers each control's authored disabled state and restores it when the target becomes visible. Input values are retained while hidden. This makes native required validation and formRender `userData` omit hidden answers without discarding an answer if its field reappears. Multiple rendered forms have independent state. Calling `render` again on the same container replaces the prior listeners and state. The plugin exposes `destroy(container)` to remove its listeners and restore controls it changed.

## Compatibility boundaries

The plugin requires consumers to use its render adapter for conditional behavior; a direct call to formRender still renders the fields but does not activate rules. The first release supports JSON form data and DOM rendering. XML, `render: false` markup output, single-control rendering, nested group controls, and custom layouts are outside this first release. The adapter accepts an optional `resolveFieldElement` callback so an application can opt in a custom layout without changing core. Forms with no rules render normally through the adapter.

## Verification and core-change policy

First verify the existing hooks with a small proof of concept: ID assignment before editor construction, nested `showWhen` round-trip through `typeUserAttrs`, clone handling, replacement of the Save action, and reliable field wrapper lookup after formRender. Then implement the plugin against those hooks. Tests cover authoring and reload, source option changes, rename/clone/remove, blocking invalid explicit saves, checkbox and date examples from #478, chained rules, invalid/cyclic rules, retained values, validation and `userData`, rerendering, and independent containers.

No core change is planned. If the proof of concept finds a specific missing hook, document the failing case and propose the smallest additive core change before using it. The plugin must not depend on private formBuilder functions or monkey-patch core methods.
