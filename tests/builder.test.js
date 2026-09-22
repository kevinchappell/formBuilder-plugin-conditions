import $ from 'jquery'
import { afterEach, describe, expect, test, vi } from 'vitest'
import 'formBuilder/src/js/form-builder.js'
import { createBuilder } from '../src/builder.js'
import * as plugin from '../src/index.js'

async function mount(options = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const builder = await createBuilder(container, { disableInjectedStyle: true, ...options })
  return { container, builder }
}

function field(container, name) {
  return [...container.querySelectorAll('li.form-field')].find(node => node.querySelector('.fld-name')?.value === name)
}

function nodeOfType(container, type) {
  return [...container.querySelectorAll('li.form-field')].find(node => node.getAttribute('type') === type)
}

function open(builder, node) {
  if (!node.classList.contains('editing')) builder.actions.toggleFieldEdit(node.id)
  return node.querySelector('.frm-holder')
}

afterEach(() => document.body.replaceChildren())

describe('condition builder', () => {
  test('preserves duplicate imported IDs while assigning unique IDs to missing fields', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'first', conditionId: 'c_saved' },
      { type: 'text', name: 'second', conditionId: 'c_saved' },
      { type: 'text', name: 'third' },
      { type: 'text', name: 'fourth' },
    ] })
    const ids = builder.actions.getData('js').map(item => item.conditionId)
    expect(ids.slice(0, 2)).toEqual(['c_saved', 'c_saved'])
    expect(ids[2]).toMatch(/^c_/)
    expect(ids[3]).toMatch(/^c_/)
    expect(new Set(ids.slice(2)).size).toBe(2)
    expect(ids.slice(2)).not.toContain('c_saved')
    builder.actions.setData(builder.actions.getData('js'))
    expect(builder.actions.getData('js').map(item => item.conditionId)).toEqual(ids)
    expect(container.querySelectorAll('li.form-field')).toHaveLength(4)
  })

  test('source rename preserves a dependent rule by stable ID', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'country', label: 'Country', conditionId: 'c_country' },
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city', showWhen: { sourceId: 'c_country', operator: 'equals', value: 'PT' } },
    ] })
    open(builder, field(container, 'country')).querySelector('.fld-label').value = 'Nation'
    const data = builder.actions.getData('js')
    expect(data.find(item => item.name === 'city').showWhen.sourceId).toBe('c_country')
    expect(data.find(item => item.name === 'country').conditionId).toBe('c_country')
  })

  test('clone regenerates its ID and retains copied rule', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'source', conditionId: 'c_source' },
      { type: 'text', name: 'target', conditionId: 'c_target', showWhen: { sourceId: 'c_source', operator: 'equals', value: 'yes' } },
    ] })
    field(container, 'target').querySelector('.copy-button').click()
    const data = builder.actions.getData('js')
    expect(data).toHaveLength(3)
    expect(data[2].conditionId).toMatch(/^c_/)
    expect(data[2].conditionId).not.toBe('c_target')
    expect(data[2].showWhen).toEqual({ sourceId: 'c_source', operator: 'equals', value: 'yes' })
  })

  test('removing source clears dependent rules and notifies', async () => {
    const notify = { warning: vi.fn() }
    const { builder, container } = await mount({ notify, formData: [
      { type: 'text', name: 'source', conditionId: 'c_source' },
      { type: 'text', name: 'target', conditionId: 'c_target', showWhen: { sourceId: 'c_source', operator: 'equals', value: 'yes' } },
    ] })
    builder.actions.removeField(field(container, 'source').id)
    expect(builder.actions.getData('js').find(item => item.name === 'target').showWhen).toBeUndefined()
    expect(notify.warning).toHaveBeenCalled()
  })

  test('composes caller callbacks exactly once', async () => {
    const onAddField = vi.fn()
    const onOpenFieldEdit = vi.fn()
    const onRemoveField = vi.fn()
    const onclone = vi.fn()
    const { builder, container } = await mount({ onAddField, onOpenFieldEdit, onRemoveField, typeUserEvents: { text: { onclone } } })
    builder.actions.addField({ type: 'text', name: 'field' })
    expect(onAddField).toHaveBeenCalledTimes(1)
    const node = field(container, 'field')
    open(builder, node)
    expect(onOpenFieldEdit).toHaveBeenCalledTimes(1)
    node.querySelector('.copy-button').click()
    expect(onclone).toHaveBeenCalledTimes(1)
    builder.actions.removeField(node.id)
    expect(onRemoveField).toHaveBeenCalledTimes(1)
  })

  test('source list excludes self and fields that would create a cycle', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'first', conditionId: 'c_first', showWhen: { sourceId: 'c_second', operator: 'equals', value: 'yes' } },
      { type: 'text', name: 'second', conditionId: 'c_second' },
      { type: 'text', name: 'third', conditionId: 'c_third' },
    ] })
    const panel = open(builder, field(container, 'second'))
    const toggle = panel.querySelector('.condition-enabled')
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    const choices = [...panel.querySelector('.fld-showWhen-sourceId').options].map(option => option.value)
    expect(choices).not.toContain('c_first')
    expect(choices).not.toContain('c_second')
    expect(choices).toContain('c_third')
  })

  test('single checkbox source offers checked operators without a value input', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'checkbox', name: 'consent', conditionId: 'c_consent' },
      { type: 'text', name: 'details', conditionId: 'c_details' },
    ] })
    const panel = open(builder, field(container, 'details'))
    const toggle = panel.querySelector('.condition-enabled')
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    const source = panel.querySelector('.fld-showWhen-sourceId')
    source.value = 'c_consent'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    expect([...panel.querySelector('.fld-showWhen-operator').options].map(option => option.value)).toContain('checked')
    expect(panel.querySelector('.fld-showWhen-value')).toBeNull()
  })

  test('switch shows typed source and saved choice value, with stage always visible', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'select', name: 'country', label: 'Country', conditionId: 'c_country', values: [{ label: 'Portugal', value: 'PT' }, { label: 'Spain', value: 'ES' }] },
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city' },
    ] })
    const panel = open(builder, field(container, 'city'))
    const toggle = panel.querySelector('.condition-enabled')
    expect(toggle).toBeTruthy()
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    const source = panel.querySelector('.fld-showWhen-sourceId')
    expect([...source.options].map(option => option.value)).toContain('c_country')
    source.value = 'c_country'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    const operator = panel.querySelector('.fld-showWhen-operator')
    expect([...operator.options].map(option => option.value)).toContain('equals')
    const value = panel.querySelector('.fld-showWhen-value')
    expect(value.tagName).toBe('SELECT')
    expect([...value.options].map(option => option.value)).toContain('PT')
    operator.value = 'equals'
    value.value = 'PT'
    expect(builder.actions.getData('js')[1].showWhen).toEqual({ sourceId: 'c_country', operator: 'equals', value: 'PT' })
    builder.actions.toggleFieldEdit(field(container, 'city').id)
    const reopened = open(builder, field(container, 'city'))
    expect(reopened.querySelector('.condition-enabled').checked).toBe(true)
    expect(reopened.querySelector('.fld-showWhen-value').value).toBe('PT')
    expect(container.querySelector('.frmb').hidden).toBe(false)
    const reopenedToggle = reopened.querySelector('.condition-enabled')
    reopenedToggle.checked = false
    reopenedToggle.dispatchEvent(new Event('change', { bubbles: true }))
    expect(builder.actions.getData('js')[1].showWhen).toBeUndefined()
    builder.actions.setData(builder.actions.getData('js'))
    const afterReload = open(builder, field(container, 'city'))
    expect(afterReload.querySelector('.condition-enabled').checked).toBe(false)
    expect(builder.actions.getData('js')[1].showWhen).toBeUndefined()
  })

  test('omits the rule editor for field types that cannot be targets', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'city', label: 'City' },
      { type: 'header', subtype: 'h2', label: 'Section' },
      { type: 'paragraph', subtype: 'p', label: 'Intro' },
    ] })
    for (const type of ['header', 'paragraph']) {
      const panel = open(builder, nodeOfType(container, type))
      expect(panel.querySelector('.condition-editor')).toBeNull()
      expect(panel.querySelector('.condition-enabled')).toBeNull()
    }
    expect(open(builder, field(container, 'city')).querySelector('.condition-enabled')).toBeTruthy()
  })

  test('offers the rule editor on a hidden field, which the renderer governs by its control', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'checkbox', name: 'consent', label: 'Consent', conditionId: 'c_consent' },
      { type: 'hidden', name: 'token', value: 'abc', conditionId: 'c_token' },
    ] })
    const panel = open(builder, nodeOfType(container, 'hidden'))
    const toggle = panel.querySelector('.condition-enabled')
    expect(toggle).toBeTruthy()
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    const source = panel.querySelector('.fld-showWhen-sourceId')
    source.value = 'c_consent'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    panel.querySelector('.fld-showWhen-operator').value = 'checked'
    expect(builder.actions.getData('js')[1].showWhen).toEqual({ sourceId: 'c_consent', operator: 'checked' })
    expect(builder.validate()).toEqual([])
  })

  test('keeps the typed editor and hidden ID across a subtype change', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'country', label: 'Country', conditionId: 'c_country' },
      { type: 'text', subtype: 'text', name: 'city', label: 'City', conditionId: 'c_city', showWhen: { sourceId: 'c_country', operator: 'equals', value: 'PT' } },
    ] })
    const node = field(container, 'city')
    const panel = open(builder, node)
    const subtype = panel.querySelector('.fld-subtype')
    expect(subtype).toBeTruthy()
    subtype.value = 'password'
    subtype.dispatchEvent(new Event('change', { bubbles: true }))

    expect(panel.querySelector('.condition-editor')).toBeTruthy()
    expect(panel.querySelector('.condition-enabled').checked).toBe(true)
    expect(panel.querySelector('.fld-showWhen-sourceId').tagName).toBe('SELECT')
    expect(panel.querySelector('.fld-showWhen-sourceId').value).toBe('c_country')
    expect(panel.querySelector('.fld-showWhen-value').value).toBe('PT')
    expect(node.querySelector('.conditionId-wrap').hidden).toBe(true)
    // Core's panel CSS forces `display: flex` on `.form-group`, so `hidden` alone is not enough.
    expect(node.querySelector('.conditionId-wrap').style.display).toBe('none')
    expect(node.querySelector('.fld-conditionId').readOnly).toBe(true)
    const data = builder.actions.getData('js')
    expect(data[1].subtype).toBe('password')
    expect(data[1].showWhen).toEqual({ sourceId: 'c_country', operator: 'equals', value: 'PT' })
  })

  test('lays the rule editor out like core attribute rows and injects its styles once', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'checkbox', name: 'agree', label: 'Agree', conditionId: 'c_agree' },
      { type: 'text', name: 'why', label: 'Why', conditionId: 'c_why', showWhen: { sourceId: 'c_agree', operator: 'checked' } },
    ] })
    const panel = open(builder, field(container, 'why'))
    const editor = panel.querySelector('.condition-editor')
    expect(editor.classList.contains('form-group')).toBe(false)
    const rows = [...editor.querySelectorAll('.form-group')]
    expect(rows.map(row => row.querySelector('label').textContent)).toEqual(['Conditional display', 'Source field', 'Operator'])
    for (const row of rows) {
      expect(row.children[0].tagName).toBe('LABEL')
      expect(row.children[1].classList.contains('input-wrap')).toBe(true)
      expect(row.children[1].children).toHaveLength(1)
    }
    expect(panel.querySelector('.fld-showWhen-sourceId').classList.contains('form-control')).toBe(true)
    expect(document.querySelectorAll('#formbuilder-plugin-conditions-styles')).toHaveLength(1)
    open(builder, field(container, 'agree'))
    expect(document.querySelectorAll('#formbuilder-plugin-conditions-styles')).toHaveLength(1)
  })

  test('a subtype change on a field that cannot be a target leaves no raw rule inputs', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'header', subtype: 'h2', label: 'Section' },
    ] })
    const node = nodeOfType(container, 'header')
    const panel = open(builder, node)
    const subtype = panel.querySelector('.fld-subtype')
    subtype.value = 'h3'
    subtype.dispatchEvent(new Event('change', { bubbles: true }))

    expect(panel.querySelector('.condition-editor')).toBeNull()
    expect(panel.querySelector('.showWhen-wrap')).toBeNull()
    expect(node.querySelector('.conditionId-wrap').hidden).toBe(true)
    const data = builder.actions.getData('js')
    expect(data[0].subtype).toBe('h3')
    expect(data[0].showWhen).toBeUndefined()
  })

  test('saves a number source comparison as a string and reads it back', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'number', name: 'age', label: 'Age', conditionId: 'c_age' },
      { type: 'text', name: 'guardian', label: 'Guardian', conditionId: 'c_guardian' },
    ] })
    const panel = open(builder, field(container, 'guardian'))
    const toggle = panel.querySelector('.condition-enabled')
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    const source = panel.querySelector('.fld-showWhen-sourceId')
    source.value = 'c_age'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    panel.querySelector('.fld-showWhen-operator').value = 'lessThan'
    const value = panel.querySelector('.fld-showWhen-value')
    // A `number` input would be exported as a JSON number by core's getAttrVals.
    expect(value.type).toBe('text')
    expect(value.inputMode).toBe('decimal')
    value.value = '18'

    const saved = builder.save()
    expect(saved.ok).toBe(true)
    const rule = saved.formData.find(item => item.name === 'guardian').showWhen
    expect(rule).toEqual({ sourceId: 'c_age', operator: 'lessThan', value: '18' })
    expect(typeof rule.value).toBe('string')

    builder.actions.setData(saved.formData)
    const reopened = open(builder, field(container, 'guardian'))
    expect(reopened.querySelector('.fld-showWhen-value').value).toBe('18')
    expect(builder.validate()).toEqual([])
  })

  test('reports a dangling source inline and keeps the imported rule in exported data', async () => {
    const rule = { sourceId: 'c_gone', operator: 'equals', value: 'PT' }
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city', showWhen: { ...rule } },
    ] })
    const node = field(container, 'city')
    expect(node.querySelector('.condition-error [data-code="missing-source"]')).toBeTruthy()
    const panel = open(builder, node)
    expect(panel.querySelector('.condition-error [data-code="missing-source"]')).toBeTruthy()
    expect(panel.querySelector('.fld-showWhen-sourceId').value).toBe('c_gone')
    expect(builder.actions.getData('js')[0].showWhen).toEqual(rule)
  })

  test('reports a malformed imported rule inline without dropping it', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city', showWhen: 'nonsense' },
    ] })
    const node = field(container, 'city')
    expect(node.querySelector('.condition-error [data-code="malformed-rule"]')).toBeTruthy()
    expect(builder.actions.getData('js')[0].showWhen).toBe('nonsense')
    const panel = open(builder, node)
    expect(panel.querySelector('.condition-error [data-code="malformed-rule"]')).toBeTruthy()
    const toggle = panel.querySelector('.condition-enabled')
    expect(toggle.checked).toBe(false)
    expect(builder.actions.getData('js')[0].showWhen).toBe('nonsense')
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    expect(panel.querySelector('.condition-raw-rule')).toBeNull()
    expect(typeof builder.actions.getData('js')[0].showWhen).toBe('object')
  })

  test('assigns crypto based IDs that stay unique across builder instances', async () => {
    const first = await mount({ formData: [{ type: 'text', name: 'a' }, { type: 'text', name: 'b' }] })
    const second = await mount({ formData: [{ type: 'text', name: 'c' }, { type: 'text', name: 'd' }] })
    const ids = [...first.builder.actions.getData('js'), ...second.builder.actions.getData('js')]
      .map(item => item.conditionId)
    expect(ids).toHaveLength(4)
    for (const id of ids) expect(id).toMatch(/^c_[0-9a-f-]+$/)
    expect(new Set(ids).size).toBe(4)
  })

  test('leaves core data actions unpatched', async () => {
    const { builder } = await mount()
    expect(builder.actions.setData).toBe(builder.instance.setData)
    expect(builder.actions.getData).toBe(builder.instance.getData)
  })
})

describe('explicit save', () => {
  const enable = panel => {
    const toggle = panel.querySelector('.condition-enabled')
    toggle.checked = true
    toggle.dispatchEvent(new Event('change', { bubbles: true }))
    return panel
  }

  test('blocks save on an invalid rule and saves once after repair', async () => {
    const onSave = vi.fn()
    const { builder, container } = await mount({ onSave, formData: [
      { type: 'text', name: 'country', label: 'Country', conditionId: 'c_country' },
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city', showWhen: { sourceId: 'c_gone', operator: 'equals', value: 'PT' } },
    ] })
    const saveButton = container.querySelector('.conditions-save')
    expect(saveButton).toBeTruthy()

    saveButton.click()
    const node = field(container, 'city')
    expect([...node.querySelectorAll('.condition-issue')].map(issue => issue.dataset.code)).toEqual(['missing-source'])
    expect(onSave).not.toHaveBeenCalled()
    expect(builder.save()).toMatchObject({ ok: false })
    expect(builder.save().issues).toHaveLength(1)
    expect(onSave).not.toHaveBeenCalled()

    const panel = open(builder, node)
    const source = panel.querySelector('.fld-showWhen-sourceId')
    source.value = 'c_country'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    panel.querySelector('.fld-showWhen-operator').value = 'equals'
    panel.querySelector('.fld-showWhen-value').value = 'PT'

    saveButton.click()
    expect(onSave).toHaveBeenCalledTimes(1)
    const [, formData] = onSave.mock.calls[0]
    expect(formData.find(item => item.name === 'city').showWhen).toEqual({ sourceId: 'c_country', operator: 'equals', value: 'PT' })
    expect(field(container, 'city').querySelectorAll('.condition-issue')).toHaveLength(0)
    expect(builder.validate()).toEqual([])
  })

  test('save returns the cleaned form data and reports issues without saving', async () => {
    const onSave = vi.fn()
    const { builder } = await mount({ onSave, formData: [
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city', showWhen: { sourceId: 'c_city', operator: 'equals', value: 'PT' } },
    ] })
    const blocked = builder.save()
    expect(blocked.ok).toBe(false)
    expect(blocked.issues.map(issue => issue.code)).toEqual(['self-reference'])
    expect(blocked.formData).toBeUndefined()
    expect(onSave).not.toHaveBeenCalled()
  })

  test('strips an all-empty rule from saved data and from validation', async () => {
    const onSave = vi.fn()
    const { builder, container } = await mount({ onSave, formData: [
      { type: 'text', name: 'city', label: 'City', conditionId: 'c_city' },
    ] })
    enable(open(builder, field(container, 'city')))
    const showWhen = builder.actions.getData('js')[0].showWhen
    expect(showWhen).toBeTruthy()
    expect(Object.values(showWhen).every(value => value === '')).toBe(true)
    expect(builder.validate()).toEqual([])
    const result = builder.save()
    expect(result.ok).toBe(true)
    expect(result.formData[0].showWhen).toBeUndefined()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][1][0].showWhen).toBeUndefined()
  })

  test('replaces the built-in save action and keeps caller action buttons', async () => {
    const click = vi.fn()
    const { container } = await mount({
      actionButtons: [{ type: 'button', id: 'custom', label: 'Custom', className: 'btn custom-action', events: { click } }],
      disabledActionButtons: ['clear'],
    })
    expect(container.querySelector('.save-template')).toBeNull()
    expect(container.querySelector('.clear-all')).toBeNull()
    const custom = container.querySelector('.custom-action')
    expect(custom).toBeTruthy()
    custom.click()
    expect(click).toHaveBeenCalledTimes(1)
    const buttons = [...container.querySelectorAll('.form-actions button')]
    expect(buttons.at(-1).classList.contains('conditions-save')).toBe(true)
    expect(buttons.at(-2)).toBe(custom)
  })

  test('destroy empties the container and is safe to repeat', async () => {
    const { builder, container } = await mount({ formData: [{ type: 'text', name: 'city' }] })
    builder.destroy()
    expect(container.children).toHaveLength(0)
    expect(builder.actions).toBeNull()
    expect(builder.instance).toBeNull()
    expect(builder.save()).toEqual({ ok: false, issues: [] })
    expect(() => builder.destroy()).not.toThrow()
  })

  test('exposes exactly the documented package entry points', () => {
    expect(Object.keys(plugin).sort()).toEqual(['createBuilder', 'destroy', 'render', 'validate'])
    for (const name of Object.keys(plugin)) expect(typeof plugin[name]).toBe('function')
  })
})
