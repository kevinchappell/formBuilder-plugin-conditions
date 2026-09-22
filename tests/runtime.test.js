import $ from 'jquery'
import { afterEach, describe, expect, test, vi } from 'vitest'
import '../../formBuilder/src/js/form-render.js'
import { render, destroy } from '../src/runtime.js'

const make = () => {
  const container = document.createElement('div')
  document.body.append(container)
  return container
}
const input = (container, name) => [...container.querySelectorAll('input,select,textarea')].find(element => element.name === name)
const group = (container, name) => input(container, name).closest('.form-group')
const change = element => element.dispatchEvent(new Event('change', { bubbles: true }))
const data = container => $(container).formRender('userData')

afterEach(() => {
  document.querySelectorAll('[data-test-container]').forEach(destroy)
  document.body.replaceChildren()
})

const source = { type: 'checkbox', name: 'agree', label: 'Agree', conditionId: 'agree', values: [{ label: 'Yes', value: 'yes' }] }
const target = { type: 'text', name: 'details', label: 'Details', required: true, conditionId: 'details', showWhen: { sourceId: 'agree', operator: 'checked' } }

describe('conditional render', () => {
  test('hides required target until checkbox is checked, retains value, and omits hidden userData', () => {
    const container = make()
    const fields = [source, target]
    const onRender = vi.fn(() => expect(group(container, 'details').hidden).toBe(true))
    render(container, { formData: fields, onRender })
    const details = input(container, 'details')
    expect(onRender).toHaveBeenCalledOnce()
    expect(group(container, 'details').hidden).toBe(true)
    expect(details.disabled).toBe(true)
    expect(details.checkValidity()).toBe(true)
    expect(data(container).map(field => field.name)).not.toContain('details')
    expect(fields[1].showWhen).toEqual(target.showWhen)
    expect(container.innerHTML).not.toContain('showWhen')
    expect(container.innerHTML).not.toContain('conditionId')
    input(container, 'agree').checked = true
    change(input(container, 'agree'))
    expect(group(container, 'details').hidden).toBe(false)
    expect(details.disabled).toBe(false)
    expect(details.required).toBe(true)
    expect(details.checkValidity()).toBe(false)
    details.value = 'saved answer'
    input(container, 'agree').checked = false
    change(input(container, 'agree'))
    expect(details.value).toBe('saved answer')
    expect(data(container).map(field => field.name)).not.toContain('details')
    input(container, 'agree').checked = true
    change(input(container, 'agree'))
    expect(details.value).toBe('saved answer')
    expect(data(container).find(field => field.name === 'details').userData).toEqual(['saved answer'])
  })

  test('evaluates dates and chained rules, including unchecked condition with hidden source', () => {
    const container = make()
    render(container, { formData: [
      { type: 'date', subtype: 'date', name: 'date', conditionId: 'date' },
      { type: 'checkbox', name: 'followup', conditionId: 'followup', values: [{ label: 'Yes', value: 'yes' }], showWhen: { sourceId: 'date', operator: 'greaterThan', value: '2026-01-01' } },
      { type: 'text', name: 'last', conditionId: 'last', showWhen: { sourceId: 'followup', operator: 'unchecked' } },
    ] })
    expect(group(container, 'followup').hidden).toBe(true)
    expect(group(container, 'last').hidden).toBe(true)
    input(container, 'date').value = '2026-02-01'
    change(input(container, 'date'))
    expect(group(container, 'followup').hidden).toBe(false)
    expect(group(container, 'last').hidden).toBe(false)
    input(container, 'followup').checked = true
    change(input(container, 'followup'))
    expect(group(container, 'last').hidden).toBe(true)
    input(container, 'date').value = '2025-12-31'
    change(input(container, 'date'))
    expect(group(container, 'followup').hidden).toBe(true)
    expect(group(container, 'last').hidden).toBe(true)
  })

  test('preserves authored disabled controls and handles two containers independently', () => {
    const one = make()
    const two = make()
    render(one, { formData: [source, { ...target, disabled: true }] })
    render(two, { formData: [source, target] })
    input(one, 'agree').checked = true
    change(input(one, 'agree'))
    expect(group(one, 'details').hidden).toBe(false)
    expect(input(one, 'details').disabled).toBe(true)
    expect(group(two, 'details').hidden).toBe(true)
    input(two, 'agree').checked = true
    change(input(two, 'agree'))
    expect(input(two, 'details').disabled).toBe(false)
  })

  test('rerender and destroy clean up listeners and restore only plugin changes', () => {
    const container = make()
    const warnings = vi.fn()
    render(container, { formData: [source, target], onWarning: warnings })
    const oldControl = input(container, 'details')
    render(container, { formData: [source, target], onWarning: warnings })
    input(container, 'agree').checked = true
    change(input(container, 'agree'))
    expect(group(container, 'details').hidden).toBe(false)
    expect(warnings).not.toHaveBeenCalled()
    input(container, 'agree').checked = false
    change(input(container, 'agree'))
    destroy(container)
    expect(group(container, 'details').hidden).toBe(false)
    expect(input(container, 'details').disabled).toBe(false)
    expect(oldControl.isConnected).toBe(false)
    expect(data(container).map(field => field.name)).toContain('details')
  })

  test('invalid rules fail closed and report validation warnings', () => {
    const container = make()
    const onWarning = vi.fn()
    render(container, { formData: [source, { ...target, showWhen: { sourceId: 'missing', operator: 'equals', value: 'x' } }], onWarning })
    expect(group(container, 'details').hidden).toBe(true)
    expect(onWarning).toHaveBeenCalled()
    render(container, { formData: [source, { ...source, name: 'duplicate' }, target], onWarning })
    expect(group(container, 'details').hidden).toBe(true)
    render(container, { formData: [
      { ...source, showWhen: { sourceId: 'details', operator: 'equals', value: 'x' } },
      { ...target, showWhen: { sourceId: 'agree', operator: 'checked' } },
    ], onWarning })
    expect(group(container, 'details').hidden).toBe(true)
    render(container, { formData: [
      { type: 'text', name: 'first', conditionId: 'first', showWhen: { sourceId: 'second', operator: 'equals', value: 'x' } },
      { type: 'text', name: 'second', conditionId: 'second', showWhen: { sourceId: 'first', operator: 'equals', value: 'x' } },
    ], onWarning })
    expect(group(container, 'first').hidden).toBe(true)
    expect(group(container, 'second').hidden).toBe(true)
    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ code: 'cycle' }))
  })

  test('accepts JSON formData and leaves a form without rules usable', () => {
    const container = make()
    const fields = [{ type: 'text', name: 'plain', label: 'Plain' }]
    render(container, { formData: JSON.stringify(fields) })
    input(container, 'plain').value = 'answer'
    expect(group(container, 'plain').hidden).toBe(false)
    expect(data(container).find(field => field.name === 'plain').userData).toEqual(['answer'])
    expect(fields).toEqual([{ type: 'text', name: 'plain', label: 'Plain' }])
  })

  test('custom field resolver can select a nonstandard wrapper', () => {
    const container = make()
    render(container, {
      formData: [source, target],
      resolveFieldElement: (field, root) => field.name === 'details'
        ? root.querySelector('[name="details"]').closest('.form-group')
        : undefined,
    })
    expect(group(container, 'details').hidden).toBe(true)
  })

  test('rejects unsupported data modes', () => {
    const container = make()
    expect(() => render(container, { formData: '<form-template/>', dataType: 'xml' })).toThrow(/XML|xml/)
    expect(() => render(container, { formData: [], render: false })).toThrow(/render: false/)
    expect(() => render(container, { formData: '{}' })).toThrow(/array/i)
  })
})
