# Conditional visibility hook probe

Focused probe run: `npm test -- hooks.test.js` (5 passing tests).

| Hook or integration point | Status | Evidence |
| --- | --- | --- |
| `onAddField` pre-editor mutation | Pass | The callback assigns `conditionId`; the generated editor input and `actions.getData('js')` contain `condition-email`. |
| Wildcard `typeUserAttrs` persistence | Pass | Wildcard attributes round-trip `conditionId` and nested `showWhen`, including after `setData` reopens the editor. |
| Wildcard `typeUserEvents.onclone` | Pass | The wildcard `onclone` callback receives the real clone and updates its identifier dataset. |
| Custom Save with built-in Save disabled | Pass | `disabledActionButtons: ['save']` removes the built-in control while the custom callback fires once. |
| `formRender` `.form-group` wrapper | Pass | A real text control renders inside `.rendered-form .form-group`, which resolves its input. |
