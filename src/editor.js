import { canBeTarget, operatorsFor, sourceKind } from './rules.js'

const LABELS = {
  checked: 'Checked', unchecked: 'Unchecked', contains: 'Contains', notContains: 'Does not contain',
  equals: 'Equals', notEquals: 'Does not equal', greaterThan: 'Greater than', lessThan: 'Less than',
}

const ISSUE_MESSAGES = {
  'duplicate-id': 'Another field already uses this condition ID, so rules pointing at it cannot be resolved.',
  'malformed-rule': 'This conditional display rule is incomplete or malformed. It is kept as imported until you replace it.',
  'missing-source': 'The source field of this conditional display rule no longer exists.',
  'self-reference': 'A field cannot depend on itself.',
  cycle: 'This conditional display rule is part of a loop of rules.',
  'operator-type-mismatch': 'The operator does not match the type of the source field.',
  'unsupported-operator': 'The operator is not supported for the type of the source field.',
  'stale-choice-value': 'The option this rule compares against no longer exists on the source field.',
  'unsupported-target': 'This field cannot be shown or hidden by a rule, because the rendered form has no element for it.',
}

const messageFor = issue => ISSUE_MESSAGES[issue?.code] ?? `Conditional display rule error: ${issue?.code ?? 'unknown'}`

function input(name, tag = 'input', type = 'text') {
  const control = document.createElement(tag)
  control.className = `fld-showWhen-${name}`
  control.name = `showWhen[${name}]`
  if (tag === 'input') control.type = type
  return control
}

function option(select, value, label) {
  const item = document.createElement('option')
  item.value = value
  item.textContent = label
  select.append(item)
}

/** Select a stored value, adding a placeholder option when it no longer exists. */
function selectStored(control, value, label) {
  control.value = value ?? ''
  if (!value || control.value === value) return
  option(control, value, label(value))
  control.value = value
}

/** One edit-panel row laid out like core's own attribute rows: label column, then `.input-wrap`. */
function row(labelText, control) {
  const wrapper = document.createElement('div')
  wrapper.className = 'form-group'
  const label = document.createElement('label')
  label.textContent = labelText
  const inputWrap = document.createElement('div')
  inputWrap.className = 'input-wrap'
  if (control.type !== 'checkbox') control.classList.add('form-control')
  inputWrap.append(control)
  wrapper.append(label, inputWrap)
  return wrapper
}

const STYLE_ID = 'formbuilder-plugin-conditions-styles'
// Core injects its own stylesheet, so the plugin does the same for the few rules its
// editor needs beyond core's `.form-elements` layout. Scoped to the builder panel only.
const STYLES = `
.form-builder .form-elements .condition-editor { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd; }
.form-builder .form-elements .condition-editor .form-group + .form-group { margin-top: 6px; }
.form-builder .form-elements .condition-error { margin: 6px 0 0 18.66666667%; color: #b3261e; font-size: 13px; }
.form-builder .form-elements .condition-error[hidden] { display: none; }
.form-builder .form-elements .condition-issue { margin: 0 0 4px; }
@media (max-width: 480px) { .form-builder .form-elements .condition-error { margin-left: 0; } }
`
function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLES
  document.head.append(style)
}

function wouldCycle(candidateId, targetId, byId) {
  const visited = new Set()
  let id = candidateId
  while (id && !visited.has(id)) {
    if (id === targetId) return true
    visited.add(id)
    id = byId.get(id)?.showWhen?.sourceId
  }
  return false
}

function ensureErrorElement(node) {
  const existing = node?.querySelector('.condition-error')
  if (existing) return existing
  const host = node?.querySelector('.form-elements-inner')
  if (!host) return null
  let editor = node.querySelector('.condition-editor')
  if (!editor) {
    ensureStyles()
    editor = document.createElement('div')
    editor.className = 'condition-editor'
    host.append(editor)
  }
  const error = document.createElement('div')
  error.className = 'condition-error'
  error.setAttribute('role', 'alert')
  editor.append(error)
  return error
}

/**
 * Render validation issues for one field into its inline `.condition-error` element,
 * creating the element when the field has no editor yet. Reused for load-time,
 * open-time and save-time reporting.
 *
 * @param {Element} node   the field node (`li.form-field`) or its edit panel
 * @param {Array}   issues issues from `validate()` that belong to this field
 * @return {Element|null}  the error element, when one could be resolved
 */
export function renderConditionIssues(node, issues = []) {
  const error = issues.length ? ensureErrorElement(node) : node?.querySelector('.condition-error')
  if (!error) return null
  error.replaceChildren(...issues.map(issue => {
    const item = document.createElement('p')
    item.className = 'condition-issue'
    item.dataset.code = issue.code
    item.textContent = messageFor(issue)
    return item
  }))
  error.hidden = issues.length === 0
  return error
}

/**
 * Keep an imported `showWhen` that is not a rule object in the field's exported data.
 * formBuilder's object attribute renders one input per entry, which would turn a
 * string into `{0: 'y', …}`, so the raw value is carried by a single input instead.
 *
 * @param {Element} node the field node (`li.form-field`)
 * @param {*}       rule the imported value
 * @return {Element|null} the input carrying the raw value
 */
export function preserveRawRule(node, rule) {
  const raw = document.createElement('input')
  raw.type = 'hidden'
  raw.className = 'fld-showWhen condition-raw-rule'
  raw.name = 'showWhen'
  raw.value = typeof rule === 'string' ? rule : (JSON.stringify(rule) ?? '')
  const wrap = node?.querySelector('.showWhen-wrap')
  if (wrap) {
    wrap.replaceChildren(raw)
    wrap.hidden = true
    return raw
  }
  const host = node?.querySelector('.form-elements-inner')
  if (!host) return null
  host.append(raw)
  return raw
}

export function openConditionEditor(panel, getFields) {
  const field = panel.closest('li.form-field')
  if (!field) return
  const target = { type: field.getAttribute('type'), name: field.querySelector('.fld-name')?.value }
  if (!canBeTarget(target)) return

  const previousEditor = panel.querySelector('.condition-editor')
  const savedControls = [...panel.querySelectorAll('.fld-showWhen-sourceId, .fld-showWhen-operator, .fld-showWhen-value')]
  const saved = Object.fromEntries(savedControls.map(control => [control.name.match(/\[([^\]]+)\]/)?.[1], control.value]))
  previousEditor?.remove()
  // A raw imported rule stays in the data until the author replaces it.
  const raw = panel.querySelector('.condition-raw-rule')
  if (!raw) panel.querySelector('.showWhen-wrap')?.remove()

  ensureStyles()
  const editor = document.createElement('div')
  editor.className = 'condition-editor'
  const enabled = document.createElement('input')
  enabled.type = 'checkbox'
  enabled.className = 'condition-enabled'
  enabled.checked = Boolean(saved.sourceId || saved.operator || saved.value)
  const switchRow = row('Conditional display', enabled)
  const detail = document.createElement('div')
  detail.className = 'condition-details'
  const error = document.createElement('div')
  error.className = 'condition-error'
  error.setAttribute('role', 'alert')
  error.hidden = true
  editor.append(switchRow, detail, error)
  panel.querySelector('.form-elements-inner')?.append(editor)

  const render = (sourceId = '', operator = '', value = '') => {
    detail.replaceChildren()
    if (!enabled.checked) return
    // Authoring a rule replaces any raw imported value.
    panel.querySelector('.showWhen-wrap')?.remove()
    const fields = getFields()
    const targetId = field.querySelector('.fld-conditionId')?.value
    const byId = new Map(fields.map(item => [item.conditionId, item]))
    const candidates = fields.filter(item => item.conditionId !== targetId && sourceKind(item) && !wouldCycle(item.conditionId, targetId, byId))
    const source = input('sourceId', 'select')
    option(source, '', 'Choose a field')
    for (const item of candidates) option(source, item.conditionId, item.label || item.name || item.conditionId)
    selectStored(source, sourceId, id => {
      const known = byId.get(id)
      return known ? `${known.label || known.name || id} (not selectable)` : `Missing field (${id})`
    })
    detail.append(row('Source field', source))

    const selected = byId.get(source.value)
    const operatorControl = input('operator', 'select')
    option(operatorControl, '', 'Choose an operator')
    for (const entry of operatorsFor(selected)) option(operatorControl, entry, LABELS[entry] || entry)
    selectStored(operatorControl, operator, entry => LABELS[entry] || entry)
    detail.append(row('Operator', operatorControl))

    const kind = sourceKind(selected)
    if (selected ? kind !== 'checkbox' : Boolean(source.value)) {
      let valueControl
      if (kind === 'choice' || kind === 'multi') {
        valueControl = input('value', 'select')
        option(valueControl, '', 'Choose a value')
        for (const entry of selected.values || []) {
          if (entry && typeof entry === 'object') option(valueControl, String(entry.value ?? ''), String(entry.label ?? entry.value ?? ''))
          else option(valueControl, String(entry), String(entry))
        }
        selectStored(valueControl, value, entry => `${entry} (option removed)`)
      } else {
        // A `number` input would be exported as a JSON number by core's getAttrVals;
        // the saved rule value is always a string, so a text input carries it.
        valueControl = input('value', 'input', kind === 'date' ? 'date' : 'text')
        if (kind === 'number') valueControl.inputMode = 'decimal'
        valueControl.value = value
      }
      detail.append(row('Value', valueControl))
    }

    source.addEventListener('change', () => render(source.value))
  }
  enabled.addEventListener('change', () => render())
  render(saved.sourceId, saved.operator, saved.value)
  return editor
}
