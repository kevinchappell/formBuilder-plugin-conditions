import $ from 'jquery'
import { openConditionEditor, preserveRawRule, renderConditionIssues } from './editor.js'
import { validate } from './rules.js'

const activeRule = rule => rule && typeof rule === 'object' && !Array.isArray(rule) && Object.values(rule).some(value => value !== '' && value != null)
// A `showWhen` that is neither absent nor a plain object cannot be edited, but it is
// kept in the exported data and reported instead of being dropped.
const rawRule = rule => rule != null && rule !== '' && (typeof rule !== 'object' || Array.isArray(rule))
const fieldNodes = container => [...container.querySelectorAll('li.form-field')]
const attr = (field, name) => field.querySelector(`.fld-${name}`)?.value

const randomId = () => {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return `c_${source.randomUUID()}`
  const bytes = new Uint8Array(16)
  source.getRandomValues(bytes)
  return `c_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

export async function createBuilder(container, options = {}) {
  const seen = new Set()
  let controller
  const uniqueId = () => {
    let id
    do { id = randomId() } while (seen.has(id))
    seen.add(id)
    return id
  }
  const showIssues = () => {
    const fields = controller?.actions.getData('js')
    if (!fields) return
    const byField = new Map()
    for (const issue of validate(fields)) {
      if (!byField.has(issue.fieldId)) byField.set(issue.fieldId, [])
      byField.get(issue.fieldId).push(issue)
    }
    for (const node of fieldNodes(container)) {
      renderConditionIssues(node, byField.get(attr(node, 'conditionId')) ?? [])
    }
  }
  const callerEvents = options.typeUserEvents || {}
  const typeUserEvents = {}
  const types = new Set(['*', 'text', 'textarea', 'number', 'date', 'select', 'radio-group', 'checkbox-group', 'checkbox', 'autocomplete', ...Object.keys(callerEvents)])
  for (const type of types) {
    typeUserEvents[type] = { ...(callerEvents[type] || {}) }
    const caller = callerEvents[type]?.onclone || (type !== '*' ? callerEvents['*']?.onclone : undefined)
    typeUserEvents[type].onclone = field => {
      const idControl = field.querySelector('.fld-conditionId')
      if (idControl) idControl.value = uniqueId()
      caller?.(field)
    }
  }
  const mergedAttrs = { ...options.typeUserAttrs }
  mergedAttrs['*'] = {
    ...(mergedAttrs['*'] || {}),
    conditionId: { label: 'Condition ID', value: '' },
    showWhen: { label: 'Show when', value: { sourceId: '', operator: '', value: '' } },
  }
  const onAddField = options.onAddField
  const onAddFieldAfter = options.onAddFieldAfter
  const onOpenFieldEdit = options.onOpenFieldEdit
  const onRemoveField = options.onRemoveField
  const warning = typeof options.notify?.warning === 'function' ? options.notify.warning : message => console.warn(message)
  const instance = $(container).formBuilder({
    ...options,
    typeUserAttrs: mergedAttrs,
    typeUserEvents,
    onAddField(id, field) {
      if (typeof field.conditionId !== 'string' || !field.conditionId) field.conditionId = uniqueId()
      else seen.add(field.conditionId)
      onAddField?.(id, field)
    },
    onAddFieldAfter(id, field) {
      const node = document.getElementById(id)
      const idWrapper = node?.querySelector('.conditionId-wrap')
      if (idWrapper) idWrapper.hidden = true
      if (rawRule(field.showWhen)) preserveRawRule(node, field.showWhen)
      else if (!activeRule(field.showWhen)) node?.querySelector('.showWhen-wrap')?.remove()
      onAddFieldAfter?.(id, field)
    },
    onOpenFieldEdit(panel) {
      openConditionEditor(panel, () => controller?.actions.getData('js') ?? [])
      showIssues()
      onOpenFieldEdit?.(panel)
    },
    onRemoveField(id, data, field) {
      const sourceId = attr(field, 'conditionId') || data.conditionId
      if (sourceId) {
        let cleared = 0
        for (const node of fieldNodes(container)) {
          if (node === field) continue
          const source = node.querySelector('.fld-showWhen-sourceId')
          if (source?.value !== sourceId) continue
          node.querySelector('.showWhen-wrap')?.remove()
          const editor = node.querySelector('.condition-editor')
          if (editor) editor.remove()
          cleared += 1
        }
        if (cleared) warning(`Removed ${cleared} conditional display rule${cleared === 1 ? '' : 's'} because its source was deleted.`)
      }
      onRemoveField?.(id, data, field)
    },
  })
  controller = await instance.promise
  showIssues()
  return controller
}
