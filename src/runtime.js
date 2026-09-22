import $ from 'jquery'
import { evaluate, fieldId, isBlank, ruleState, sourceKind, validate } from './rules.js'

const instances = new WeakMap()
// A malformed rule counts as a rule: it is reported and fails closed rather than
// being treated as an unconditional field.
const hasRule = field => ruleState(field?.showWhen) !== 'inactive'
const clone = value => {
  if (Array.isArray(value)) return value.map(clone)
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
  }
  return value
}
// A hidden target's descendant controls are disabled, buttons included.
const CONTROL_SELECTOR = 'input,select,textarea,button'
const controlsFor = (container, name) => [...container.querySelectorAll(CONTROL_SELECTOR)]
  .filter(control => control.name === name || control.name === `${name}[]`)
const standardWrapperFor = (container, field) => {
  // formRender applies `field-${id}` to standard wrappers. Display-only
  // controls have no input to locate, so resolve them by that class.
  const identities = [field.name, field.id].filter(value => !isBlank(value))
  if (!identities.length) return null
  return [...container.querySelectorAll('.rendered-form .form-group')]
    .find(element => identities.some(identity => element.classList.contains(`field-${identity}`))) ?? null
}
const answerFor = (field, allControls) => {
  const controls = allControls.filter(control => control.tagName !== 'BUTTON')
  const kind = sourceKind(field)
  if (kind === 'checkbox') return controls.some(control => control.checked)
  if (kind === 'multi') {
    if (controls.length === 1 && controls[0].tagName === 'SELECT') {
      return [...controls[0].selectedOptions].map(option => option.value)
    }
    return controls.filter(control => control.checked).map(control => control.value)
  }
  if (kind === 'choice' && controls.some(control => control.type === 'radio')) {
    return controls.find(control => control.checked)?.value
  }
  return controls[0]?.value
}
const report = (state, warning) => {
  const callback = state.onWarning ?? state.notify?.warning
  callback?.(warning)
}
const restore = state => {
  if (!state) return
  state.container.removeEventListener('input', state.update)
  state.container.removeEventListener('change', state.update)
  for (const item of state.items) {
    if (item.wrapper) item.wrapper.hidden = item.originalHidden
    for (const [control, disabled] of item.originalDisabled) control.disabled = disabled
  }
}

function update(state) {
  const byId = new Map()
  for (const item of state.items) {
    if (!isBlank(item.field.conditionId) && !byId.has(item.field.conditionId)) {
      byId.set(item.field.conditionId, item)
    }
  }
  const resolved = new Map()
  const visiting = new Set()
  const visible = item => {
    if (resolved.has(item)) return resolved.get(item)
    if (visiting.has(item)) return false
    visiting.add(item)
    let result = !item.originalHidden
    if (item.rule) {
      const source = byId.get(item.field.showWhen?.sourceId)
      // Always short-circuit a hidden source, including for `unchecked` rules.
      result = result && !item.invalid && !!source && source.resolved && !source.invalid && visible(source) &&
        evaluate(item.field.showWhen, source.field, answerFor(source.field, source.controls))
    }
    visiting.delete(item)
    resolved.set(item, result)
    return result
  }
  for (const item of state.items) {
    const shown = visible(item)
    // Wrapper-less targets (e.g. `type: 'hidden'`) have no element to hide, so
    // disabling their controls is what keeps them out of userData.
    if (item.wrapper) item.wrapper.hidden = shown ? item.originalHidden : true
    for (const [control, authoredDisabled] of item.originalDisabled) {
      control.disabled = shown ? authoredDisabled : true
    }
  }
}

/**
 * Render a form with conditional visibility. Returns the formRender instance; a hidden target's
 * controls are disabled, so core `userData` reports that field with an empty answer array.
 */
export function render(container, { formData, resolveFieldElement, onWarning, ...formRenderOptions } = {}) {
  if (!(container instanceof Element)) throw new TypeError('render requires a DOM container')
  if (formRenderOptions.dataType === 'xml') throw new Error('Conditional render does not support XML formData')
  if (formRenderOptions.render === false) throw new Error('Conditional render does not support render: false')
  let fields = formData
  if (typeof fields === 'string') {
    try { fields = JSON.parse(fields) } catch { throw new Error('formData must be a JSON array') }
  }
  if (!Array.isArray(fields)) throw new TypeError('formData must be an array')
  const inputFields = clone(fields)
  const renderedFields = inputFields.map(field => {
    const copy = { ...field }
    delete copy.conditionId
    delete copy.showWhen
    return copy
  })
  const previous = instances.get(container)
  restore(previous)
  instances.delete(container)

  const errors = validate(inputFields)
  const badIds = new Set(errors.map(error => error.fieldId))
  const duplicateIds = new Set(errors.filter(error => error.code === 'duplicate-id').map(error => error.fieldId))
  const state = {
    container,
    items: [],
    instance: null,
    onWarning,
    notify: formRenderOptions.notify,
    update: null,
  }
  const onRender = formRenderOptions.onRender
  const options = {
    ...formRenderOptions,
    formData: renderedFields,
    onRender: () => {
      state.items = inputFields.map(field => {
        const named = controlsFor(container, field.name)
        const custom = resolveFieldElement?.(field, container)
        const wrapper = custom ?? named[0]?.closest('.form-group') ?? standardWrapperFor(container, field)
        const controls = wrapper ? [...wrapper.querySelectorAll(CONTROL_SELECTOR)] : named
        const item = {
          field,
          rule: hasRule(field),
          invalid: badIds.has(fieldId(field)) || duplicateIds.has(field.showWhen?.sourceId),
          wrapper,
          controls,
          // A wrapper-less target (e.g. `type: 'hidden'`) is still governed through its controls.
          resolved: Boolean(wrapper) || controls.length > 0,
          originalHidden: wrapper?.hidden ?? false,
          originalDisabled: new Map(),
        }
        for (const control of item.controls) item.originalDisabled.set(control, control.disabled)
        if (item.rule && !item.resolved) report(state, { fieldId: fieldId(field), code: 'missing-rendered-field' })
        return item
      })
      update(state)
      onRender?.()
    },
  }
  try {
    for (const error of errors) report(state, error)
    state.instance = $(container).formRender(options)
    state.update = () => update(state)
    container.addEventListener('input', state.update)
    container.addEventListener('change', state.update)
    instances.set(container, state)
    return state.instance
  } catch (error) {
    restore(state)
    throw error
  }
}

/** Remove visibility listeners and restore wrapper/control state. */
export function destroy(container) {
  const state = instances.get(container)
  restore(state)
  instances.delete(container)
}
