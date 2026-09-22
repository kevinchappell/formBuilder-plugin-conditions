import $ from 'jquery'
import { openConditionEditor } from './editor.js'

const activeRule = rule => rule && typeof rule === 'object' && !Array.isArray(rule) && Object.values(rule).some(value => value !== '' && value != null)
const fieldNodes = container => [...container.querySelectorAll('li.form-field')]
const attr = (field, name) => field.querySelector(`.fld-${name}`)?.value

export async function createBuilder(container, options = {}) {
  const seen = new Set()
  let serial = 0
  let controller
  const uniqueId = () => {
    let id
    do { id = `c_${Date.now().toString(36)}_${++serial}` } while (seen.has(id))
    seen.add(id)
    return id
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
      if (!activeRule(field.showWhen)) node?.querySelector('.showWhen-wrap')?.remove()
      onAddFieldAfter?.(id, field)
    },
    onOpenFieldEdit(panel) {
      openConditionEditor(panel, () => controller.actions.getData('js'))
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
  const setData = controller.actions.setData
  controller.actions.setData = data => {
    seen.clear()
    return setData(data)
  }
  return controller
}
