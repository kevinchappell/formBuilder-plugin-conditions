import { operatorsFor, sourceKind } from './rules.js'

const LABELS = {
  checked: 'Checked', unchecked: 'Unchecked', contains: 'Contains', notContains: 'Does not contain',
  equals: 'Equals', notEquals: 'Does not equal', greaterThan: 'Greater than', lessThan: 'Less than',
}

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

function row(labelText, control) {
  const wrapper = document.createElement('div')
  wrapper.className = 'form-group'
  const label = document.createElement('label')
  label.textContent = labelText
  wrapper.append(label, control)
  return wrapper
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

export function openConditionEditor(panel, getFields) {
  const field = panel.closest('li.form-field')
  if (!field) return
  const previousEditor = panel.querySelector('.condition-editor')
  const savedControls = [...panel.querySelectorAll('.fld-showWhen-sourceId, .fld-showWhen-operator, .fld-showWhen-value')]
  const saved = Object.fromEntries(savedControls.map(control => [control.name.match(/\[([^\]]+)\]/)?.[1], control.value]))
  previousEditor?.remove()
  panel.querySelector('.showWhen-wrap')?.remove()

  const editor = document.createElement('div')
  editor.className = 'condition-editor form-group'
  const switchLabel = document.createElement('label')
  switchLabel.textContent = 'Conditional display'
  const enabled = document.createElement('input')
  enabled.type = 'checkbox'
  enabled.className = 'condition-enabled'
  enabled.checked = Boolean(saved.sourceId || saved.operator || saved.value)
  switchLabel.prepend(enabled)
  const detail = document.createElement('div')
  detail.className = 'condition-details'
  const error = document.createElement('div')
  error.className = 'condition-error'
  error.setAttribute('role', 'alert')
  editor.append(switchLabel, detail, error)
  panel.querySelector('.form-elements-inner')?.append(editor)

  const render = (sourceId = '', operator = '', value = '') => {
    detail.replaceChildren()
    if (!enabled.checked) return
    const fields = getFields()
    const targetId = field.querySelector('.fld-conditionId')?.value
    const byId = new Map(fields.map(item => [item.conditionId, item]))
    const candidates = fields.filter(item => item.conditionId !== targetId && sourceKind(item) && !wouldCycle(item.conditionId, targetId, byId))
    const source = input('sourceId', 'select')
    option(source, '', 'Choose a field')
    for (const item of candidates) option(source, item.conditionId, item.label || item.name || item.conditionId)
    source.value = sourceId
    detail.append(row('Source field', source))

    const selected = byId.get(source.value)
    const operatorControl = input('operator', 'select')
    option(operatorControl, '', 'Choose an operator')
    for (const entry of operatorsFor(selected)) option(operatorControl, entry, LABELS[entry] || entry)
    operatorControl.value = operator
    detail.append(row('Operator', operatorControl))

    if (selected && sourceKind(selected) !== 'checkbox') {
      let valueControl
      const kind = sourceKind(selected)
      if (kind === 'choice' || kind === 'multi') {
        valueControl = input('value', 'select')
        option(valueControl, '', 'Choose a value')
        for (const entry of selected.values || []) {
          if (entry && typeof entry === 'object') option(valueControl, String(entry.value ?? ''), String(entry.label ?? entry.value ?? ''))
          else option(valueControl, String(entry), String(entry))
        }
      } else {
        valueControl = input('value', 'input', kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text')
      }
      valueControl.value = value
      detail.append(row('Value', valueControl))
    }

    source.addEventListener('change', () => render(source.value))
  }
  enabled.addEventListener('change', () => render())
  render(saved.sourceId, saved.operator, saved.value)
  return editor
}
