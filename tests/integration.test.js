import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import $ from 'jquery'
import { afterEach, describe, expect, test, vi } from 'vitest'
import '../../formBuilder/src/js/form-builder.js'
import '../../formBuilder/src/js/form-render.js'
import { createBuilder, destroy, render, validate } from '../src/index.js'

/**
 * End to end path: author a rule through the real field editor, save through the
 * plugin action, render the saved JSON, and drive the rendered form. Nothing here
 * reaches into plugin internals; it uses only the documented entry points and the
 * markup an author would click.
 */

const containers = []
const make = () => {
  const container = document.createElement('div')
  document.body.append(container)
  containers.push(container)
  return container
}

const mount = async (options = {}) => {
  const container = make()
  const builder = await createBuilder(container, { disableInjectedStyle: true, ...options })
  return { container, builder }
}

const fieldNode = (container, name) =>
  [...container.querySelectorAll('li.form-field')].find(node => node.querySelector('.fld-name')?.value === name)

const openEditor = (builder, node) => {
  if (!node.classList.contains('editing')) builder.actions.toggleFieldEdit(node.id)
  return node.querySelector('.frm-holder')
}

const change = element => element.dispatchEvent(new Event('change', { bubbles: true }))
const setSelect = (control, value) => {
  control.value = value
  change(control)
  return control
}

/** Author one rule the way the editor UI does: switch on, pick source, operator, value. */
const authorRule = (builder, container, targetName, { sourceId, operator, value }) => {
  const panel = openEditor(builder, fieldNode(container, targetName))
  const toggle = panel.querySelector('.condition-enabled')
  toggle.checked = true
  change(toggle)
  setSelect(panel.querySelector('.fld-showWhen-sourceId'), sourceId)
  setSelect(panel.querySelector('.fld-showWhen-operator'), operator)
  if (value !== undefined) {
    const valueControl = panel.querySelector('.fld-showWhen-value')
    valueControl.value = value
    valueControl.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return panel
}

const control = (container, name) =>
  [...container.querySelectorAll('input,select,textarea')].find(element => element.name === name)
const group = (container, name) => control(container, name).closest('.form-group')
const userData = container => $(container).formRender('userData')
const answerFor = (container, name) => userData(container).find(entry => entry.name === name)?.userData

afterEach(() => {
  for (const container of containers.splice(0)) destroy(container)
  document.body.replaceChildren()
})

describe('builder to renderer integration', () => {
  test('checkbox rule authored in the editor saves, renders, and toggles a required field', async () => {
    const onSave = vi.fn()
    const { builder, container } = await mount({ onSave })
    // A single checkbox with one unselected option: the checkbox example from #478.
    builder.actions.addField({ type: 'checkbox', name: 'agree', label: 'I have a nickname', values: [{ label: 'Yes', value: 'yes' }] })
    builder.actions.addField({ type: 'text', name: 'nickname', label: 'Nickname', required: true })

    const agreeId = builder.actions.getData('js').find(item => item.name === 'agree').conditionId
    expect(agreeId).toMatch(/^c_/)

    // A single checkbox source offers checked/unchecked and no value control.
    const panel = authorRule(builder, container, 'nickname', { sourceId: agreeId, operator: 'checked' })
    expect(panel.querySelector('.fld-showWhen-value')).toBeNull()
    expect(panel.querySelectorAll('.condition-issue')).toHaveLength(0)
    expect(builder.validate()).toEqual([])

    // Authoring state and saved JSON agree.
    container.querySelector('.conditions-save').click()
    expect(onSave).toHaveBeenCalledTimes(1)
    const [evt, savedFromButton] = onSave.mock.calls[0]
    expect(evt).toBeInstanceOf(Event)

    const result = builder.save()
    expect(result.ok).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onSave.mock.calls[1][0]).toBeUndefined()
    expect(result.formData).toEqual(savedFromButton)

    const saved = JSON.parse(JSON.stringify(result.formData))
    const savedTarget = saved.find(item => item.name === 'nickname')
    expect(savedTarget.showWhen).toEqual({ sourceId: agreeId, operator: 'checked' })
    expect(savedTarget.conditionId).toMatch(/^c_/)
    // The exported data passes the same validator callers use before a core export.
    expect(validate(saved)).toEqual([])

    // Render the saved JSON and drive it.
    const output = make()
    render(output, { formData: saved })
    expect(output.querySelector('.rendered-form')).toBeTruthy()
    expect(output.innerHTML).not.toContain('showWhen')
    expect(output.innerHTML).not.toContain('conditionId')

    const nickname = control(output, 'nickname')
    expect(group(output, 'nickname').hidden).toBe(true)
    expect(nickname.disabled).toBe(true)
    // A hidden required answer does not block native validation.
    expect(nickname.checkValidity()).toBe(true)
    expect(answerFor(output, 'nickname')).toEqual([])

    const agree = control(output, 'agree')
    agree.checked = true
    change(agree)
    expect(group(output, 'nickname').hidden).toBe(false)
    expect(nickname.disabled).toBe(false)
    expect(nickname.required).toBe(true)
    expect(nickname.checkValidity()).toBe(false)

    nickname.value = 'Kev'
    expect(answerFor(output, 'nickname')).toEqual(['Kev'])

    agree.checked = false
    change(agree)
    expect(group(output, 'nickname').hidden).toBe(true)
    // The answer survives hiding but stays out of userData.
    expect(nickname.value).toBe('Kev')
    expect(answerFor(output, 'nickname')).toEqual([])

    agree.checked = true
    change(agree)
    expect(answerFor(output, 'nickname')).toEqual(['Kev'])
  })

  test('date rule authored in the editor saves and drives an ordered comparison', async () => {
    const { builder, container } = await mount()
    builder.actions.addField({ type: 'date', subtype: 'date', name: 'travel', label: 'Travel date' })
    builder.actions.addField({ type: 'text', name: 'visa', label: 'Visa number' })

    const travelId = builder.actions.getData('js').find(item => item.name === 'travel').conditionId
    const panel = authorRule(builder, container, 'visa', {
      sourceId: travelId,
      operator: 'greaterThan',
      value: '2026-01-01',
    })
    expect(panel.querySelector('.fld-showWhen-value').type).toBe('date')
    expect([...panel.querySelector('.fld-showWhen-operator').options].map(option => option.value))
      .toEqual(expect.arrayContaining(['greaterThan', 'lessThan']))
    expect(builder.validate()).toEqual([])

    const result = builder.save()
    expect(result.ok).toBe(true)
    const saved = JSON.parse(JSON.stringify(result.formData))
    expect(saved.find(item => item.name === 'visa').showWhen)
      .toEqual({ sourceId: travelId, operator: 'greaterThan', value: '2026-01-01' })
    expect(validate(saved)).toEqual([])

    const output = make()
    render(output, { formData: saved })
    expect(group(output, 'visa').hidden).toBe(true)

    const travel = control(output, 'travel')
    travel.value = '2025-12-31'
    change(travel)
    expect(group(output, 'visa').hidden).toBe(true)

    travel.value = '2026-02-01'
    change(travel)
    expect(group(output, 'visa').hidden).toBe(false)
    control(output, 'visa').value = 'PT-12345'
    expect(answerFor(output, 'visa')).toEqual(['PT-12345'])

    travel.value = ''
    change(travel)
    // An empty source value never satisfies an ordered comparison.
    expect(group(output, 'visa').hidden).toBe(true)
    expect(answerFor(output, 'visa')).toEqual([])
  })

  test('an invalid rule blocks the plugin save and reports the same issue the renderer fails closed on', async () => {
    const onSave = vi.fn()
    const { builder, container } = await mount({
      onSave,
      formData: [
        { type: 'checkbox', name: 'agree', label: 'Agree', conditionId: 'c_agree', values: [{ label: 'Yes', value: 'yes' }] },
        {
          type: 'text',
          name: 'nickname',
          label: 'Nickname',
          conditionId: 'c_nickname',
          showWhen: { sourceId: 'c_missing', operator: 'checked' },
        },
      ],
    })
    container.querySelector('.conditions-save').click()
    expect(onSave).not.toHaveBeenCalled()
    const codes = [...fieldNode(container, 'nickname').querySelectorAll('.condition-issue')]
      .map(issue => issue.dataset.code)
    expect(codes).toEqual(['missing-source'])

    const blocked = builder.save()
    expect(blocked.ok).toBe(false)
    expect(blocked.issues.map(issue => issue.code)).toEqual(['missing-source'])

    // The renderer reaches the same verdict on that data and keeps the target hidden.
    const onWarning = vi.fn()
    const output = make()
    render(output, { formData: builder.actions.getData('js'), onWarning })
    expect(group(output, 'nickname').hidden).toBe(true)
    expect(onWarning).toHaveBeenCalledWith(expect.objectContaining({ code: 'missing-source' }))

    // Repairing the rule in the editor unblocks save, and the repaired JSON renders.
    const agreeId = builder.actions.getData('js').find(item => item.name === 'agree').conditionId
    authorRule(builder, container, 'nickname', { sourceId: agreeId, operator: 'checked' })
    const repaired = builder.save()
    expect(repaired.ok).toBe(true)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(validate(repaired.formData)).toEqual([])

    render(output, { formData: repaired.formData, onWarning })
    expect(group(output, 'nickname').hidden).toBe(true)
    const agree = control(output, 'agree')
    agree.checked = true
    change(agree)
    expect(group(output, 'nickname').hidden).toBe(false)
  })

  test('a plain formRender call on the same data renders every field without rules', async () => {
    const { builder, container } = await mount()
    builder.actions.addField({ type: 'checkbox', name: 'agree', label: 'Agree', values: [{ label: 'Yes', value: 'yes' }] })
    builder.actions.addField({ type: 'text', name: 'nickname', label: 'Nickname' })
    const agreeId = builder.actions.getData('js').find(item => item.name === 'agree').conditionId
    authorRule(builder, container, 'nickname', { sourceId: agreeId, operator: 'checked' })
    const saved = builder.save()
    expect(saved.ok).toBe(true)

    const output = make()
    $(output).formRender({ formData: saved.formData })
    expect(group(output, 'nickname').hidden).toBe(false)
    control(output, 'nickname').value = 'always visible'
    expect(answerFor(output, 'nickname')).toEqual(['always visible'])
  })

  test('the schema in examples/basic.html loads, saves and renders as documented', async () => {
    // Guards the shipped example against drifting from the plugin's behavior.
    const html = readFileSync(resolve(import.meta.dirname, '../examples/basic.html'), 'utf8')
    const savedFields = new Function(`return ${html.match(/const savedFields = (\[[\s\S]*?\n  \])/)[1]}`)()
    expect(validate(savedFields)).toEqual([])

    const { builder, container } = await mount({ formData: savedFields })
    expect(builder.validate()).toEqual([])
    expect(container.querySelectorAll('.condition-issue')).toHaveLength(0)
    const saved = builder.save()
    expect(saved.ok).toBe(true)
    expect(saved.formData.find(item => item.name === 'nickname').showWhen)
      .toEqual({ sourceId: 'c_2a1b6c90', operator: 'checked' })
    expect(saved.formData.find(item => item.name === 'visa_number').showWhen)
      .toEqual({ sourceId: 'c_4f8c1b22', operator: 'greaterThan', value: '2026-01-01' })

    const output = make()
    const warnings = []
    render(output, { formData: saved.formData, onWarning: issue => warnings.push(issue) })
    expect(warnings).toEqual([])
    expect(group(output, 'nickname').hidden).toBe(true)
    expect(group(output, 'visa_number').hidden).toBe(true)

    const agree = control(output, 'has_nickname')
    agree.checked = true
    change(agree)
    expect(group(output, 'nickname').hidden).toBe(false)

    const travel = control(output, 'travel_date')
    travel.value = '2026-03-04'
    change(travel)
    expect(group(output, 'visa_number').hidden).toBe(false)
    control(output, 'visa_number').value = 'PT-12345'
    expect(answerFor(output, 'visa_number')).toEqual(['PT-12345'])
  })
})
