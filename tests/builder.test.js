import $ from 'jquery'
import { afterEach, describe, expect, test, vi } from 'vitest'
import '../../formBuilder/src/js/form-builder.js'
import { createBuilder } from '../src/builder.js'

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
    expect(builder.actions.setData).toBe(builder.setData)
    expect(builder.actions.getData).toBe(builder.getData)
  })
})
