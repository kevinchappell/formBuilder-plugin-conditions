import $ from 'jquery'
import { evaluate, sourceKind, validate } from './rules.js'

const instances = new WeakMap()
const isBlank = value => value === '' || value === null || value === undefined
const hasRule = field => {
  const rule = field?.showWhen
  if (rule == null) return false
  if (typeof rule !== 'object' || Array.isArray(rule)) return true
  return ![rule.sourceId, rule.operator, rule.value].every(isBlank)
}
const fieldKey = field => field.conditionId ?? field.name ?? null
const clone = value => {
  if (Array.isArray(value)) return value.map(clone)
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
  }
  return value
}
const controlsFor = (container, name) => [...container.querySelectorAll('input,select,textarea')]
  .filter(control => control.name === name || control.name === `${name}[]`)
const answerFor = (field, controls) => {
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
  if (state.instance) delete state.instance.userData
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
      result = result && !item.invalid && !!source && !!source.wrapper && !source.invalid && visible(source) &&
        evaluate(item.field.showWhen, source.field, answerFor(source.field, source.controls))
    }
    visiting.delete(item)
    resolved.set(item, result)
    return result
  }
  for (const item of state.items) {
    const shown = visible(item)
    if (!item.wrapper) continue
    item.wrapper.hidden = shown ? item.originalHidden : true
    for (const [control, authoredDisabled] of item.originalDisabled) {
      control.disabled = shown ? authoredDisabled : true
    }
  }
}

/** Render a form with conditional visibility. The returned formRender instance supports userData. */
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
        const controls = controlsFor(container, field.name)
        const resolved = resolveFieldElement?.(field, container)
        const wrapper = resolved ?? controls[0]?.closest('.form-group') ?? null
        const item = {
          field,
          rule: hasRule(field),
          invalid: badIds.has(fieldKey(field)) || duplicateIds.has(field.showWhen?.sourceId),
          wrapper,
          controls: wrapper ? [...wrapper.querySelectorAll('input,select,textarea')] : controls,
          originalHidden: wrapper?.hidden ?? false,
          originalDisabled: new Map(),
        }
        for (const control of item.controls) item.originalDisabled.set(control, control.disabled)
        if (item.rule && !wrapper) report(state, { fieldId: fieldKey(field), code: 'missing-rendered-field' })
        return item
      })
      update(state)
      onRender?.()
    },
  }
  try {
    for (const error of errors) report(state, error)
    state.instance = $(container).formRender(options)
    const baseGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(state.instance), 'userData')?.get
    if (baseGetter) {
      Object.defineProperty(state.instance, 'userData', {
        configurable: true,
        get() {
          const raw = baseGetter.call(this)
          const hiddenNames = new Set(state.items.filter(item => item.wrapper?.hidden).map(item => item.field.name))
          return raw.filter(field => !hiddenNames.has(field.name))
        },
      })
    }
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
