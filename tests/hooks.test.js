import $ from 'jquery'
import { afterEach, describe, expect, test } from 'vitest'
import 'formBuilder/src/js/form-builder.js'
import 'formBuilder/src/js/form-render.js'

const createBuilder = async options => {
  const container = document.createElement('div')
  document.body.append(container)
  const builder = await $(container).formBuilder({
    disableInjectedStyle: true,
    ...options,
  }).promise
  return { builder, container }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('conditional visibility plugin hook probes', () => {
  test('onAddField assigns a conditionId before editor construction', async () => {
    const seen = []
    const { builder, container } = await createBuilder({
      typeUserAttrs: { '*': { conditionId: { label: 'Condition ID', value: '' } } },
      onAddField: (_id, field) => {
        field.conditionId = `condition-${field.name}`
        seen.push(field)
      },
    })

    builder.actions.addField({ type: 'text', name: 'email', label: 'Email' })

    expect(seen).toHaveLength(1)
    expect(seen[0].conditionId).toBe('condition-email')
    expect(builder.actions.getData('js')[0].conditionId).toBe('condition-email')
    expect(container.querySelector('.fld-conditionId')).toBeTruthy()
  })

  test('wildcard typeUserAttrs round-trip conditionId and nested showWhen through reopen', async () => {
    const typeUserAttrs = {
      '*': {
        conditionId: { label: 'Condition ID', value: '' },
        showWhen: {
          label: 'Show when',
          value: { sourceId: '', operator: '', value: '' },
        },
      },
    }
    const formData = [{
      type: 'text',
      name: 'email',
      label: 'Email',
      conditionId: 'email-visible',
      showWhen: { sourceId: 'country', operator: 'equals', value: 'PT' },
    }]
    const { builder } = await createBuilder({ typeUserAttrs, formData })

    const field = builder.actions.getData('js')
    const editor = document.querySelector('.frmb > li')
    builder.actions.toggleFieldEdit(editor.id)
    expect(editor.querySelector('.fld-showWhen-sourceId').value).toBe('country')

    expect(field).toEqual(expect.arrayContaining([expect.objectContaining({
      conditionId: 'email-visible',
      showWhen: { sourceId: 'country', operator: 'equals', value: 'PT' },
    })]))

    builder.actions.setData(field)
    const reopened = builder.actions.getData('js')[0]
    expect(reopened.conditionId).toBe('email-visible')
    expect(reopened.showWhen).toEqual({ sourceId: 'country', operator: 'equals', value: 'PT' })
  })

  test('wildcard typeUserEvents.onclone fires and can update the clone ID', async () => {
    let cloned
    const { container } = await createBuilder({
      formData: [{ type: 'text', name: 'email', label: 'Email', conditionId: 'email-visible' }],
      typeUserAttrs: { '*': { conditionId: { label: 'Condition ID', value: '' } } },
      typeUserEvents: {
        '*': {
          onclone: field => {
            field.querySelector('.fld-conditionId').value = 'email-visible-copy'
            cloned = field
          },
        },
      },
    })

    container.querySelector('.copy-button').click()

    expect(cloned).toBeTruthy()
    expect(cloned.querySelector('.fld-conditionId').value).toBe('email-visible-copy')
    expect(cloned.id).not.toBe(container.querySelector('.frmb > li').id)
  })

  test('custom Save action fires while built-in save is disabled', async () => {
    let saves = 0
    const { container } = await createBuilder({
      disabledActionButtons: ['save'],
      actionButtons: [{
        id: 'conditions-save',
        label: 'Save conditions',
        type: 'button',
        events: { click: () => { saves += 1 } },
      }],
    })

    expect(container.querySelector('.save-template')).toBeNull()
    container.querySelector('[id$="-conditions-save-action"]').click()
    expect(saves).toBe(1)
  })

  test('formRender exposes a resolvable .form-group wrapper', () => {
    const container = document.createElement('div')
    document.body.append(container)
    $(container).formRender({
      formData: [{ type: 'text', name: 'email', label: 'Email' }],
    })

    const wrapper = container.querySelector('.rendered-form .form-group')
    expect(wrapper).toBeTruthy()
    expect(wrapper.querySelector('input[name="email"]')).toBeTruthy()
  })
})
