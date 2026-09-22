const OPERATORS = Object.freeze({
  checkbox: Object.freeze(['checked', 'unchecked']),
  multi: Object.freeze(['contains', 'notContains']),
  choice: Object.freeze(['equals', 'notEquals']),
  number: Object.freeze(['greaterThan', 'lessThan']),
  date: Object.freeze(['greaterThan', 'lessThan']),
  text: Object.freeze(['equals', 'notEquals']),
})

const VALUE_OPERATORS = new Set([
  'contains',
  'notContains',
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
])

export const isBlank = value => value === '' || value === null || typeof value === 'undefined'

/** The identity a rule and its issues are reported under. */
export const fieldId = field => field?.conditionId ?? field?.name ?? null

// formRender builds the `.form-group.field-<name>` wrapper class from the field's
// name, and a display-only field has no control to fall back on: a nameless one
// renders bare, so a rule on it has nothing to toggle. Every other type is
// governed either by its wrapper or, like `hidden`, by its named control.
const DISPLAY_ONLY_TYPES = new Set(['header', 'paragraph'])

/**
 * Whether a rule may target this field, i.e. whether the renderer can resolve an
 * element to show or hide for it. Shared with the editor and `validate` so the
 * authoring gate, the save-time check and the runtime resolver cannot drift.
 */
export function canBeTarget(field) {
  if (!field || typeof field !== 'object' || isBlank(field.type)) return false
  if (DISPLAY_ONLY_TYPES.has(field.type)) return !isBlank(field.name)
  return true
}

export function sourceKind(field) {
  if (!field || typeof field !== 'object') return null

  switch (field.type) {
    case 'checkbox':
      return 'checkbox'
    case 'checkbox-group':
      return 'multi'
    case 'select':
      return field.multiple ? 'multi' : 'choice'
    case 'radio-group':
      return 'choice'
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'text':
    case 'textarea':
      return 'text'
    default:
      return null
  }
}

export function operatorsFor(field) {
  const kind = sourceKind(field)
  return kind ? [...OPERATORS[kind]] : []
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12) return false

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

function validNumberOperand(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'string' || value.trim() === '') return false
  return Number.isFinite(Number(value))
}

export function evaluate(rule, sourceField, answer) {
  if (!rule || !operatorsFor(sourceField).includes(rule.operator)) return false

  switch (sourceKind(sourceField)) {
    case 'checkbox':
      return rule.operator === 'checked' ? answer === true : answer === false
    case 'multi': {
      const contains = Array.isArray(answer) && answer.includes(rule.value)
      return rule.operator === 'contains' ? contains : !contains
    }
    case 'choice':
    case 'text':
      if (typeof rule.value !== 'string') return false
      return rule.operator === 'equals' ? answer === rule.value : answer !== rule.value
    case 'number': {
      if (!validNumberOperand(answer) || !validNumberOperand(rule.value)) return false
      const left = Number(answer)
      const right = Number(rule.value)
      return rule.operator === 'greaterThan' ? left > right : left < right
    }
    case 'date':
      if (!validIsoDate(answer) || !validIsoDate(rule.value)) return false
      return rule.operator === 'greaterThan' ? answer > rule.value : answer < rule.value
    default:
      return false
  }
}

/** Whether a `showWhen` is absent, unusable, or a complete rule. */
export function ruleState(showWhen) {
  if (!showWhen || typeof showWhen !== 'object' || Array.isArray(showWhen)) {
    return showWhen == null ? 'inactive' : 'malformed'
  }

  const { sourceId, operator, value } = showWhen
  if ([sourceId, operator, value].every(isBlank)) return 'inactive'
  if (isBlank(sourceId) || isBlank(operator)) return 'malformed'
  if (VALUE_OPERATORS.has(operator) && isBlank(value)) return 'malformed'
  return 'active'
}

function hasSavedValue(field, value) {
  return Array.isArray(field.values) && field.values.some(option => {
    const savedValue = option && typeof option === 'object' ? option.value : option
    return savedValue === value
  })
}

export function validate(fields) {
  if (!Array.isArray(fields)) return []

  const errors = []
  const seenErrors = new Set()
  const addError = (id, code) => {
    const key = `${String(id)}\u0000${code}`
    if (seenErrors.has(key)) return
    seenErrors.add(key)
    errors.push({ fieldId: id, code })
  }

  const byId = new Map()
  for (const field of fields) {
    const id = field?.conditionId
    if (isBlank(id)) continue
    if (byId.has(id)) addError(id, 'duplicate-id')
    else byId.set(id, field)
  }

  const dependencies = new Map()
  for (const target of fields) {
    const id = fieldId(target)
    const state = ruleState(target?.showWhen)
    if (state === 'inactive') continue
    if (state === 'malformed') {
      addError(id, 'malformed-rule')
      continue
    }
    if (!canBeTarget(target)) {
      addError(id, 'unsupported-target')
      continue
    }

    const rule = target.showWhen
    const source = byId.get(rule.sourceId)
    if (!source) {
      addError(id, 'missing-source')
      continue
    }
    if (rule.sourceId === target.conditionId) {
      addError(id, 'self-reference')
      continue
    }

    dependencies.set(target.conditionId, rule.sourceId)

    if (!operatorsFor(source).includes(rule.operator)) {
      addError(id, 'operator-type-mismatch')
      continue
    }

    const kind = sourceKind(source)
    if (kind === 'number' && !validNumberOperand(rule.value)) {
      addError(id, 'malformed-rule')
      continue
    }
    if (kind === 'date' && !validIsoDate(rule.value)) {
      addError(id, 'malformed-rule')
      continue
    }
    if ((kind === 'text' || kind === 'choice') && typeof rule.value !== 'string') {
      addError(id, 'malformed-rule')
      continue
    }
    if ((kind === 'choice' || kind === 'multi') && !hasSavedValue(source, rule.value)) {
      addError(id, 'stale-choice-value')
    }
  }

  const state = new Map()
  const stack = []
  const cycleIds = new Set()
  const visit = id => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      const cycleStart = stack.indexOf(id)
      for (const cycleId of stack.slice(cycleStart)) cycleIds.add(cycleId)
      return
    }

    state.set(id, 1)
    stack.push(id)
    const sourceId = dependencies.get(id)
    if (dependencies.has(sourceId)) visit(sourceId)
    stack.pop()
    state.set(id, 2)
  }

  for (const field of fields) {
    if (!isBlank(field?.conditionId) && dependencies.has(field.conditionId)) visit(field.conditionId)
  }
  for (const field of fields) {
    if (cycleIds.has(field?.conditionId)) addError(field.conditionId, 'cycle')
  }

  return errors
}
