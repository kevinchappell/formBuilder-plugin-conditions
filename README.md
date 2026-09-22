# formbuilder-plugin-conditions

Conditional visibility for [formBuilder](https://github.com/kevinchappell/formBuilder) and formRender:
an author enables a rule on an ordinary field — *show this field when [another field] [comparison] [value]* —
and the rendered form applies it. Implements [formBuilder issue #478](https://github.com/kevinchappell/formBuilder/issues/478).

The plugin is a separate package. It uses only public formBuilder options and hooks, adds no field type,
patches nothing in core, and never evaluates rule text as JavaScript.

## Requirements

| Peer | Version |
| --- | --- |
| `formBuilder` | `^3.23.1` |
| `jquery` | `>=3.4.1` |

## Demo

The example page is deployed from `main` to
[kevinchappell.github.io/formBuilder-plugin-conditions](https://kevinchappell.github.io/formBuilder-plugin-conditions/).

## Install

```bash
npm install jquery formBuilder formbuilder-plugin-conditions
```

The package ships `dist/formbuilder-plugin-conditions.js` (ES module, the `import` entry) and
`dist/formbuilder-plugin-conditions.umd.js` (the `require` entry and the `<script>` build). For a
plain `<script>` page, no install is needed: point a tag at the UMD file on a CDN, for example
`https://cdn.jsdelivr.net/npm/formbuilder-plugin-conditions/dist/formbuilder-plugin-conditions.umd.js`.

To use an unpublished checkout instead, run `npm install && npm run build` in it and then
`npm install /path/to/formBuilder-plugin-conditions` in the consuming project. `dist/` is not
committed; it is built on `npm pack` and `npm publish`.

### Script order

jQuery, then jQuery UI sortable, then formBuilder, then formRender, then the plugin. formRender is
needed on any page that calls the plugin's `render` adapter, which delegates to it. formBuilder's
`dist` bundle does not include jQuery UI sortable, so a plain `<script>` page must load it for the
builder's drag and drop (core declares it as the `jquery-ui-sortable` dependency, which a bundler
install resolves for you).

```html
<script src="https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jquery-ui-sortable@1.0.0/jquery-ui.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/formBuilder@3.23.1/dist/form-builder.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/formBuilder@3.23.1/dist/form-render.min.js"></script>
<script src="dist/formbuilder-plugin-conditions.umd.js"></script>
<script>
  const { createBuilder, render, destroy, validate } = window.FormBuilderConditions
</script>
```

formBuilder 3.23.1 injects its own stylesheet, so no extra CSS link is needed. The plugin does the
same for its edit-panel controls: the first time a rule editor opens it appends one small
`<style id="formbuilder-plugin-conditions-styles">` to `<head>`, scoped to `.form-builder .form-elements`.
The rows themselves reuse core's own `label` + `.input-wrap` layout, so they follow any theme
applied to core's attribute rows. jsDelivr is used
rather than unpkg because unpkg lowercases package names and cannot serve the capitalised
`formBuilder` package; `examples/basic.html` pins the same URLs with Subresource Integrity hashes.

With a bundler, import the four entry points instead:

```js
import { createBuilder, render, destroy, validate } from 'formbuilder-plugin-conditions'
```

## Authoring

```js
const conditions = await createBuilder(document.querySelector('#builder'), {
  formData: savedFields,     // any formBuilder option is accepted and passed through
})
```

`createBuilder(container, options)` resolves to a controller once formBuilder is ready.
`container` must be a **DOM element**, not a selector string or a jQuery object.
Caller options are composed with the plugin's, not replaced: `onAddField`, `onAddFieldAfter`,
`onOpenFieldEdit`, `onRemoveField`, `typeUserAttrs`, `typeUserEvents.*.onclone`, `actionButtons`
and `disabledActionButtons` all keep working and each caller callback still runs exactly once.

| Controller member | Behavior |
| --- | --- |
| `save(evt?)` | Validates, and on success calls core save. Returns `{ ok: false, issues }` or `{ ok: true, formData }`. |
| `validate()` | Validates the current builder state, repaints inline errors, returns the issues array (`[]` when valid). |
| `destroy()` | Empties the builder container and drops the plugin's references. Safe to call twice. |
| `actions` | The core formBuilder `actions` object, unpatched (`getData`, `setData`, `addField`, …). `actions.save()` still runs core's own `onSave`, which is the default no-op: your callback is captured by the plugin and never handed to core. |
| `instance` | The raw core formBuilder instance. |

In the field edit panel the plugin adds a **Conditional display** switch. Turning it on reveals a
source selector (existing supported fields, by label), an operator list limited to that source's type,
and a value control suited to the source — a `<select>` of the source's own options for choice and
multi-choice sources, a date input for a date source, a text input otherwise (a number source gets a
text input with `inputmode="decimal"`, so its value is saved as a string). A single checkbox source
shows no value control. Self-references and choices that would create a loop are left out of the
source list. Existing rules are read back when form data is loaded or a panel is reopened;
turning the switch off removes `showWhen` from the exported data.

Renaming a source does not break a rule: references use the stable `conditionId`, not the field name.
Cloning a field gives the clone a new `conditionId` and keeps its rule pointing at the same source.
Deleting a source clears rules that referenced it and reports that through `notify.warning`
(falling back to `console.warn`).

### Saving, and why there is a plugin Save button

formBuilder's built-in Save button runs its `onSave` callback *after* core has already saved, so a
plugin cannot block a save with invalid rules there. `createBuilder` therefore adds `'save'` to
`disabledActionButtons` and appends its own action button (`button.conditions-save`, after any
`actionButtons` you passed). Your `onSave` is captured by the plugin and is never handed to core.

The plugin calls it as **`onSave(evt, formData)`** exactly once per successful save. `evt` is the
button's click event; for a programmatic `controller.save()` it is `undefined`. `formData` is the
**parsed array** of fields, with all-empty `showWhen` objects stripped — not the JSON string that core's
own Save button passes as its second argument, so a caller moving from core's button to the plugin's
does not need to `JSON.parse` it.

```js
const result = conditions.save()
if (result.ok) {
  render(document.querySelector('#output'), { formData: result.formData })
} else {
  console.warn(result.issues)   // inline errors are already rendered in the builder
}
```

### Exporting through core APIs instead

`actions.save()` and `getData()` cannot be intercepted with today's hooks. If you export that way,
validate the data yourself before trusting it:

```js
import { validate } from 'formbuilder-plugin-conditions'

const formData = conditions.actions.getData('js')
const issues = validate(formData)
if (!issues.length) save(formData)
```

`validate(formData)` returns an array of `{ fieldId, code }` issues — empty when the rules are sound.

| `code` | Meaning |
| --- | --- |
| `duplicate-id` | Two fields share a `conditionId`, so references to it cannot be resolved. |
| `malformed-rule` | `showWhen` is not a usable rule object, or its value does not suit the source type. |
| `missing-source` | The rule's `sourceId` matches no field. |
| `self-reference` | A field's rule points at itself. |
| `cycle` | The rule is part of a loop of rules. |
| `operator-type-mismatch` | The operator is not one the source's type supports. |
| `stale-choice-value` | The option the rule compares against no longer exists on the source. |
| `unsupported-target` | The field carrying the rule cannot be shown or hidden, because the rendered form has no element for it. |

## Rendering

```js
import { render, destroy } from 'formbuilder-plugin-conditions'

const instance = render(document.querySelector('#output'), {
  formData,                 // the array (or JSON string) saved by the plugin
  onWarning: issue => console.warn(issue),
  // every other option is forwarded to formRender
})
```

`render` validates the rules, copies the data, strips `conditionId` and `showWhen` from the copy, calls
formRender, then resolves each field in that container, applies the rules, and listens for delegated
`input` and `change` events. It returns the formRender instance and never mutates the array you passed.

- Changing a source re-evaluates its dependants, including chained ones downstream.
- A hidden source hides every field that depends on it, whatever the operator — `unchecked`,
  `notEquals` and `notContains` included, even though a blank answer would otherwise satisfy them.
- Invalid or cyclic rules **fail closed**: the affected target stays hidden and a warning is reported.
- Calling `render` again on the same container replaces the previous listeners and state.
- `destroy(container)` removes the listeners and restores the wrappers and controls the plugin changed.
- Several containers are independent of each other.

### Hidden answers

A hidden target's wrapper gets the `hidden` property and its descendant controls
(`input`, `select`, `textarea`, `button`) are disabled. Each control's authored `disabled` state is
remembered and restored when the field reappears, and values are kept while hidden. That is what
keeps hidden answers out of native required validation and out of formRender's `userData`, without
throwing away an answer the user may see again.

`$(container).formRender('userData')` still lists a hidden field — as a row whose `userData` is `[]`,
because core skips disabled controls. It is not removed from the result:

```js
$(output).formRender('userData')   // rows abridged: every field is listed, not only these two
// [ { name: 'agree', userData: [] }, { name: 'nickname', userData: [] } ]  // while hidden (abridged)
// [ { name: 'agree', userData: ['yes'] }, { name: 'nickname', userData: ['Kev'] } ]  // once shown (abridged)
```

### Warnings

Runtime problems are reported as `{ fieldId, code }` objects: the `validate` codes above, plus
`missing-rendered-field` when a field with a rule has no element in the rendered container. They go to
`onWarning` if you pass one, otherwise to `notify.warning` if you pass a `notify` object through to
formRender. With neither, they are dropped.

### Custom layouts

By default a field's element is found by its rendered control, then by the standard
`.form-group.field-<name|id>` wrapper. For a layout that does not follow that structure, pass a
resolver; returning `undefined` falls back to the default lookup:

```js
render(output, {
  formData,
  resolveFieldElement: (field, container) => container.querySelector(`[data-field="${field.name}"]`),
})
```

### Rendering without the adapter

A direct `$(container).formRender({ formData })` call still renders every field, but no rule is
applied and every field is visible. Conditional behavior requires this package's `render`.

## Saved data

Every field gets a plugin-managed `conditionId` (`c_` plus a UUID) that survives renaming. A target
with a rule also gets a `showWhen`:

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

Operators that need a comparison also store a `value`, and that value is **always a string** — a number
comparison is saved as `"18"`, never as `18`. That is why the number value control is a text input:
core exports a `number` input as a JSON number. The plugin converts the string per source type when it
validates and evaluates. This metadata lives in form data, not in HTML attributes, and the render
adapter removes it before formRender sees the fields.

### Sources and operators

| Source field type | Operators | Value control |
| --- | --- | --- |
| `checkbox` (single) | `checked`, `unchecked` | none |
| `checkbox-group`, multi `select` | `contains`, `notContains` | the source's options |
| `select` (single), `radio-group` | `equals`, `notEquals` | the source's options |
| `text`, `textarea` | `equals`, `notEquals` | text input |
| `number` | `greaterThan`, `lessThan` | text input, `inputmode="decimal"` |
| `date` | `greaterThan`, `lessThan` | date input |

Any other field type cannot be a source and is not offered in the source list. `autocomplete` is
deliberately not one: formRender gives it an unnamed display input in front of the named hidden input
that holds the value, and choosing a suggestion fires neither `input` nor `change`, so a rule on it
could not be evaluated reliably.

Choice rules store the option's **value**, not its label. Dates compare the input's ISO `YYYY-MM-DD`
value and numbers compare numerically; an empty or unparsable source answer never satisfies an ordered
comparison.

A blank answer is still an answer to the other operators: `notEquals` and `notContains` are **true**
while the source is empty, and `unchecked` is true while a checkbox is clear. Only the ordered
comparisons (`greaterThan`, `lessThan`) and `checked` need a real answer. A source that is itself
hidden overrides all of this — see [Rendering](#rendering): its dependants are hidden whatever the
operator says.

### Which fields can be targets

Any field type may be a target, including `hidden`: formRender gives a hidden input no wrapper, so the
plugin governs it through its own control — disabling it keeps its value out of `userData` exactly as it
does for a visible field.

The exception is a display-only field (`header`, `paragraph`) with no `name`. Their wrapper class is built
from the name, and they have no control to fall back on, so a nameless one renders bare and a rule on it
has nothing to toggle. The field editor offers the switch only once such a field has a name, and
`validate` reports `unsupported-target` for a hand-written rule on one that does not — the builder, the
exported `validate(formData)` and `render` all report it. `render` never applies such a rule; if a
`resolveFieldElement` resolver does hand it an element, that element stays hidden.

## Scope of the first release

- **One rule per target field.** `showWhen` holds a single condition; there is no AND/OR.
- **JSON only.** `render` throws on `dataType: 'xml'`, and XML form data cannot carry the nested
  `showWhen` object, so rules do not survive an XML export on the authoring side either.
- **`render: false` is not supported** — `render` throws, because markup-only output has no DOM to toggle.
- Single-control rendering, nested group controls, and custom layouts are out of scope; `resolveFieldElement`
  is the opt-in for the last of these.
- Forms with no rules render normally through the adapter.

### `destroy` caveats

`destroy(container)` (runtime) removes the plugin's listeners and restores the visibility and disabled state
it changed; it does not tear down formRender itself.

`controller.destroy()` (builder) empties the builder container, because core formBuilder exposes no teardown.
Core's own document-level handlers and the `fieldEditContainer` markup it appended elsewhere are not removed,
so repeatedly creating and destroying builders on one page leaks those.

## Example

`examples/basic.html` is a runnable page with a real checkbox rule and a real date rule, a plugin Save
button that renders the saved schema into an output container, and a live `userData` dump. Run
`npm run build` first, then open the file in a browser. The same page is what the demo deploys:
`npm run build:demo` assembles it into `site/` with the built bundle beside it.

## Development

```bash
npm install
npm test           # vitest under jsdom, driving real formBuilder/formRender
npm run build      # writes dist/formbuilder-plugin-conditions{,.umd.js}
npm run build:demo # builds, then assembles the GitHub Pages demo into site/
```

The test suite imports formBuilder's sources from the `formBuilder` npm package in
`node_modules` (pinned as a devDependency), so no adjacent core checkout is needed.

### Commits and releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/); a husky
`commit-msg` hook runs commitlint locally, and the CI workflow checks every commit on a pull
request. Releases are automated with [semantic-release](https://semantic-release.gitbook.io/):
each push to `main` analyses the commits since the last tag, and a `fix:` commit publishes a patch,
a `feat:` commit a minor, and a `BREAKING CHANGE` footer or `!` a major. The version in
`package.json` stays `0.0.0-development`; the published version comes from the git tag.

GitHub Actions workflows:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `ci.yml` | pull request | `npm test`, `npm run build`, `npm run build:demo`, commitlint on the PR's commits |
| `pages.yml` | push to `main` | builds the demo and deploys it to GitHub Pages with the workflow's OIDC token (no personal access token) |
| `release.yml` | push to `main` | runs semantic-release: tags, publishes to npm, and creates the GitHub release |

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC) once
the trusted publisher is configured for the package on npmjs.com, pointing at
`release.yml` in this repository. npm only lets you configure that after the package exists, so the
first publish needs an `NPM_TOKEN` repository secret (a granular automation token). After the first
release, configure the trusted publisher and delete the token; the workflow needs no change.
