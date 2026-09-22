import $ from 'jquery'
import { openConditionEditor, preserveRawRule, renderConditionIssues } from './editor.js'
import { validate } from './rules.js'

const activeRule = rule => rule && typeof rule === 'object' && !Array.isArray(rule) && Object.values(rule).some(value => value !== '' && value != null)
// A `showWhen` that is neither absent nor a plain object cannot be edited, but it is
// kept in the exported data and reported instead of being dropped.
const rawRule = rule => rule != null && rule !== '' && (typeof rule !== 'object' || Array.isArray(rule))
// A rule object whose every entry is blank is not a rule: the author enabled the
// switch without choosing anything. It validates as absent and is dropped on save.
const emptyRule = rule => rule != null && typeof rule === 'object' && !Array.isArray(rule) && !activeRule(rule)
const withoutEmptyRule = field => {
  if (!field || !emptyRule(field.showWhen)) return field
  const { showWhen, ...rest } = field
  return rest
}
const fieldNodes = container => [...container.querySelectorAll('li.form-field')]
const attr = (field, name) => field.querySelector(`.fld-${name}`)?.value
// The condition ID is plugin-managed: it is kept out of sight and out of reach in
// the edit panel, while still being exported by core like any other attribute.
const hideConditionId = node => {
  const wrapper = node?.querySelector('.conditionId-wrap')
  if (wrapper) {
    wrapper.hidden = true
    // Core's panel CSS sets `display: flex` on every `.form-group`, which beats the
    // `hidden` attribute, so an inline rule is needed to actually hide the row.
    wrapper.style.display = 'none'
  }
  const control = node?.querySelector('.fld-conditionId')
  if (control) control.readOnly = true
}
// True while the regenerated `showWhen` inputs still carry an authored rule, which
// must not be discarded with the raw markup core rebuilt.
const hasShowWhenValue = node => [...node.querySelectorAll('.showWhen-wrap [class*="fld-showWhen"]')]
  .some(control => control.value !== '')

const randomId = () => {
  const source = globalThis.crypto
  if (typeof source?.randomUUID === 'function') return `c_${source.randomUUID()}`
  const bytes = new Uint8Array(16)
  source.getRandomValues(bytes)
  return `c_${[...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Initialize formBuilder with the conditional display plugin composed into the
 * caller's options.
 *
 * @param  {Element} container the builder container
 * @param  {Object}  options   formBuilder options; `onSave` is captured by the
 *                             plugin instead of being passed to core, so it only
 *                             runs once the rules validate
 * @return {Promise<Object>} controller with `save`, `validate`, `destroy`, the
 *                           core `actions`, and the raw core `instance`
 */
export async function createBuilder(container, options = {}) {
  const {
    onSave: callerOnSave,
    actionButtons: callerActionButtons = [],
    disabledActionButtons: callerDisabledActionButtons = [],
    ...coreOptions
  } = options
  const seen = new Set()
  let core
  const uniqueId = () => {
    let id
    do { id = randomId() } while (seen.has(id))
    seen.add(id)
    return id
  }
  const currentFields = () => core?.actions.getData('js') ?? []
  const renderIssues = issues => {
    const byField = new Map()
    for (const issue of issues) {
      if (!byField.has(issue.fieldId)) byField.set(issue.fieldId, [])
      byField.get(issue.fieldId).push(issue)
    }
    for (const node of fieldNodes(container)) {
      renderConditionIssues(node, byField.get(attr(node, 'conditionId')) ?? [])
    }
  }
  /** Validate the current fields and repaint every field's inline issue list. */
  const showIssues = () => {
    if (!core) return []
    const issues = validate(currentFields())
    renderIssues(issues)
    return issues
  }
  // `evt` is the action button's click event, so the captured callback sees the
  // same `(evt, formData)` shape core's built-in Save button passes, with the
  // plugin's cleaned data as `formData`. A programmatic `save()` passes no event.
  const save = evt => {
    if (!core) return { ok: false, issues: [] }
    const issues = showIssues()
    if (issues.length) return { ok: false, issues }
    const formData = core.actions.save().map(withoutEmptyRule)
    callerOnSave?.(evt, formData)
    return { ok: true, formData }
  }
  // Core exposes no teardown, so the plugin drops the builder markup it created
  // and releases its references to the core instance. Repeat calls are a no-op.
  const destroy = () => {
    if (!core) return
    core = null
    controller.actions = null
    controller.instance = null
    $(container).empty()
  }
  const controller = { save, validate: showIssues, destroy, actions: null, instance: null }
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
  const disabledActionButtons = callerDisabledActionButtons.includes('save')
    ? [...callerDisabledActionButtons]
    : [...callerDisabledActionButtons, 'save']
  // The built-in Save fires its callback after core has already saved, so it is
  // disabled and replaced by an action that validates first.
  const actionButtons = [...callerActionButtons, {
    type: 'button',
    id: 'conditions-save',
    label: 'save',
    className: 'btn btn-primary conditions-save',
    events: { click: evt => save(evt) },
  }]
  const pending = $(container).formBuilder({
    ...coreOptions,
    actionButtons,
    disabledActionButtons,
    typeUserAttrs: mergedAttrs,
    typeUserEvents,
    onAddField(id, field) {
      if (typeof field.conditionId !== 'string' || !field.conditionId) field.conditionId = uniqueId()
      else seen.add(field.conditionId)
      onAddField?.(id, field)
    },
    onAddFieldAfter(id, field) {
      const node = document.getElementById(id)
      hideConditionId(node)
      if (rawRule(field.showWhen)) preserveRawRule(node, field.showWhen)
      else if (!activeRule(field.showWhen)) node?.querySelector('.showWhen-wrap')?.remove()
      onAddFieldAfter?.(id, field)
    },
    onOpenFieldEdit(panel) {
      openConditionEditor(panel, currentFields)
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
  // Core regenerates `.form-elements-inner` on a subtype change, which drops the
  // typed editor and brings back the raw metadata inputs. Its handler sits on the
  // select itself, so the plugin repairs the panel from a delegated listener that
  // runs afterwards. The select is detached by then, hence the capture pass that
  // remembers which field it belonged to.
  const isSubtype = target => target instanceof Element && target.classList.contains('fld-subtype')
  let subtypeChange = null
  container.addEventListener('change', evt => {
    subtypeChange = isSubtype(evt.target) ? { evt, node: evt.target.closest('li.form-field') } : null
  }, true)
  container.addEventListener('change', evt => {
    const node = subtypeChange?.evt === evt ? subtypeChange.node : null
    subtypeChange = null
    if (!node || !container.contains(node)) return
    hideConditionId(node)
    const panel = node.querySelector('.frm-holder')
    if (!panel) return
    // A field that cannot be a target keeps no editor, so its rebuilt `showWhen`
    // inputs are dropped unless they still hold an imported rule.
    if (!openConditionEditor(panel, currentFields) && !hasShowWhenValue(node)) {
      panel.querySelector('.showWhen-wrap')?.remove()
    }
    showIssues()
  })
  core = await pending.promise
  controller.actions = core.actions
  controller.instance = core
  showIssues()
  return controller
}
