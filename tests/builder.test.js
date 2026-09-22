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

function open(builder, node) {
  if (!node.classList.contains('editing')) builder.actions.toggleFieldEdit(node.id)
  return node.querySelector('.frm-holder')
}

afterEach(() => document.body.replaceChildren())

describe('condition builder', () => {
  test('assigns unique stable IDs and rehydrates them on reload', async () => {
    const { builder, container } = await mount({ formData: [
      { type: 'text', name: 'first', conditionId: 'c_saved' },
      { type: 'text', name: 'second', conditionId: 'c_saved' },
    ] })
    const ids = builder.actions.getData('js').map(item => item.conditionId)
    expect(ids[0]).toBe('c_saved')
    expect(ids[1]).toMatch(/^c_/)
    expect(new Set(ids).size).toBe(2)
    builder.actions.setData(builder.actions.getData('js'))
    expect(builder.actions.getData('js').map(item => item.conditionId)).toEqual(ids)
    expect(container.querySelectorAll('li.form-field')).toHaveLength(2)
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
})
