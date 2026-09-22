import { describe, expect, it } from 'vitest'

import { canBeTarget, evaluate, operatorsFor, sourceKind, validate } from '../src/rules.js'

const field = (conditionId, type, extra = {}) => ({ conditionId, type, ...extra })

describe('sourceKind', () => {
  it.each([
    [field('a', 'checkbox'), 'checkbox'],
    [field('a', 'checkbox-group'), 'multi'],
    [field('a', 'select', { multiple: true }), 'multi'],
    [field('a', 'select'), 'choice'],
    [field('a', 'radio-group'), 'choice'],
    [field('a', 'autocomplete'), 'choice'],
    [field('a', 'number'), 'number'],
    [field('a', 'date'), 'date'],
    [field('a', 'text'), 'text'],
    [field('a', 'textarea'), 'text'],
    [field('a', 'header'), null],
  ])('classifies %j as %s', (source, expected) => {
    expect(sourceKind(source)).toBe(expected)
  })
})

describe('canBeTarget', () => {
  it.each([
    [field('a', 'text'), true],
    [field('a', 'checkbox'), true],
    [field('a', 'select'), true],
    [field('a', 'button', { name: 'go' }), true],
    [field('a', 'file', { name: 'upload' }), true],
    [field('a', 'header'), false],
    [field('a', 'paragraph'), false],
    [field('a', 'hidden', { name: 'token' }), false],
    [undefined, false],
    [{ conditionId: 'a' }, false],
  ])('decides %j as %s', (source, expected) => {
    expect(canBeTarget(source)).toBe(expected)
  })

  it('accepts a display-only field that carries a name, which formRender wraps', () => {
    expect(canBeTarget(field('a', 'header', { name: 'section-1' }))).toBe(true)
  })
})

describe('operatorsFor', () => {
  it('returns only the operators supported by each source kind', () => {
    expect(operatorsFor(field('a', 'checkbox'))).toEqual(['checked', 'unchecked'])
    expect(operatorsFor(field('a', 'checkbox-group'))).toEqual(['contains', 'notContains'])
    expect(operatorsFor(field('a', 'select'))).toEqual(['equals', 'notEquals'])
    expect(operatorsFor(field('a', 'text'))).toEqual(['equals', 'notEquals'])
    expect(operatorsFor(field('a', 'number'))).toEqual(['greaterThan', 'lessThan'])
    expect(operatorsFor(field('a', 'date'))).toEqual(['greaterThan', 'lessThan'])
    expect(operatorsFor(field('a', 'button'))).toEqual([])
  })
})

describe('evaluate', () => {
  it('evaluates checkbox and multi-value rules', () => {
    expect(evaluate({ operator: 'checked' }, field('a', 'checkbox'), true)).toBe(true)
    expect(evaluate({ operator: 'unchecked' }, field('a', 'checkbox'), false)).toBe(true)
    expect(evaluate({ operator: 'contains', value: 'red' }, field('a', 'checkbox-group'), ['red', 'blue'])).toBe(true)
    expect(evaluate({ operator: 'notContains', value: 'green' }, field('a', 'checkbox-group'), ['red', 'blue'])).toBe(true)
  })

  it('compares text and choices using the saved value', () => {
    const choice = field('a', 'select', { values: [{ label: 'Visible label', value: 'saved-value' }] })
    expect(evaluate({ operator: 'equals', value: 'saved-value' }, choice, 'saved-value')).toBe(true)
    expect(evaluate({ operator: 'equals', value: 'Visible label' }, choice, 'saved-value')).toBe(false)
    expect(evaluate({ operator: 'notEquals', value: 'other' }, field('a', 'text'), 'answer')).toBe(true)
    expect(evaluate({ operator: 'notEquals', value: { x: 1 } }, field('a', 'text'), 'answer')).toBe(false)
  })

  it('uses numeric ordering and rejects blank or non-numeric answers', () => {
    const number = field('a', 'number')
    expect(evaluate({ operator: 'greaterThan', value: '10' }, number, '10.5')).toBe(true)
    expect(evaluate({ operator: 'lessThan', value: '10' }, number, '')).toBe(false)
    expect(evaluate({ operator: 'lessThan', value: '10' }, number, '   ')).toBe(false)
    expect(evaluate({ operator: 'lessThan', value: '   ' }, number, '-1')).toBe(false)
    expect(evaluate({ operator: 'lessThan', value: '10' }, number, 'not a number')).toBe(false)
    expect(evaluate({ operator: 'greaterThan', value: '-1' }, number, [])).toBe(false)
    expect(evaluate({ operator: 'greaterThan', value: [] }, number, 1)).toBe(false)
  })

  it('orders valid HTML date values and rejects blanks and invalid dates', () => {
    const date = field('a', 'date')
    expect(evaluate({ operator: 'greaterThan', value: '2026-09-01' }, date, '2026-09-22')).toBe(true)
    expect(evaluate({ operator: 'lessThan', value: '2026-10-01' }, date, '')).toBe(false)
    expect(evaluate({ operator: 'lessThan', value: '2026-10-01' }, date, '09/22/2026')).toBe(false)
    expect(evaluate({ operator: 'lessThan', value: '2026-02-30' }, date, '2026-02-20')).toBe(false)
    expect(evaluate({ operator: 'lessThan', value: '0099-12-31' }, date, '0001-01-01')).toBe(true)
  })

  it('returns false for an operator that the source type does not support', () => {
    expect(evaluate({ operator: 'contains', value: 'x' }, field('a', 'text'), 'x')).toBe(false)
  })
})

describe('validate', () => {
  it('treats an absent or all-empty showWhen as no active rule', () => {
    expect(validate([
      field('a', 'text'),
      field('b', 'text', { showWhen: { sourceId: '', operator: '', value: '' } }),
    ])).toEqual([])
  })

  it('rejects duplicate IDs, missing sources, and self references', () => {
    const errors = validate([
      field('same', 'text'),
      field('same', 'number'),
      field('missing-target', 'text', { showWhen: { sourceId: 'absent', operator: 'equals', value: 'x' } }),
      field('self', 'text', { showWhen: { sourceId: 'self', operator: 'equals', value: 'x' } }),
    ])

    expect(errors).toEqual(expect.arrayContaining([
      { fieldId: 'same', code: 'duplicate-id' },
      { fieldId: 'missing-target', code: 'missing-source' },
      { fieldId: 'self', code: 'self-reference' },
    ]))
  })

  it('finds every field participating in a dependency cycle', () => {
    const errors = validate([
      field('a', 'text', { showWhen: { sourceId: 'c', operator: 'equals', value: 'yes' } }),
      field('b', 'text', { showWhen: { sourceId: 'a', operator: 'equals', value: 'yes' } }),
      field('c', 'text', { showWhen: { sourceId: 'b', operator: 'equals', value: 'yes' } }),
    ])

    expect(errors.filter(error => error.code === 'cycle')).toEqual([
      { fieldId: 'a', code: 'cycle' },
      { fieldId: 'b', code: 'cycle' },
      { fieldId: 'c', code: 'cycle' },
    ])
  })

  it('rejects operators that do not match their source type', () => {
    expect(validate([
      field('source', 'number'),
      field('target', 'text', { showWhen: { sourceId: 'source', operator: 'contains', value: '1' } }),
    ])).toContainEqual({ fieldId: 'target', code: 'operator-type-mismatch' })
  })

  it.each([
    ['number', 'abc'],
    ['number', []],
    ['date', '2026-02-30'],
  ])('rejects an invalid %s comparison operand: %j', (type, value) => {
    expect(validate([
      field('source', type),
      field('target', 'text', { showWhen: { sourceId: 'source', operator: 'lessThan', value } }),
    ])).toContainEqual({ fieldId: 'target', code: 'malformed-rule' })
  })

  it.each([
    ['text', { x: 1 }],
    ['select', { x: 1 }],
  ])('rejects a non-string %s comparison operand', (type, value) => {
    expect(validate([
      field('source', type, type === 'select' ? { values: [] } : {}),
      field('target', 'text', { showWhen: { sourceId: 'source', operator: 'notEquals', value } }),
    ])).toContainEqual({ fieldId: 'target', code: 'malformed-rule' })
  })

  it('rejects stale choice values and compares option values rather than labels', () => {
    const source = field('source', 'select', {
      values: [{ label: 'Published label', value: 'published' }],
    })

    expect(validate([
      source,
      field('valid', 'text', { showWhen: { sourceId: 'source', operator: 'equals', value: 'published' } }),
    ])).toEqual([])

    expect(validate([
      source,
      field('stale', 'text', { showWhen: { sourceId: 'source', operator: 'equals', value: 'Published label' } }),
    ])).toContainEqual({ fieldId: 'stale', code: 'stale-choice-value' })
  })

  it.each([
    [{ sourceId: 'source', operator: '', value: '' }],
    [{ sourceId: '', operator: 'equals', value: 'x' }],
    [{ sourceId: 'source', operator: 'equals', value: '' }],
  ])('rejects a malformed partial rule: %j', showWhen => {
    expect(validate([
      field('source', 'text'),
      field('target', 'text', { showWhen }),
    ])).toContainEqual({ fieldId: 'target', code: 'malformed-rule' })
  })

  it('allows checkbox operators without a comparison value', () => {
    expect(validate([
      field('source', 'checkbox'),
      field('target', 'text', { showWhen: { sourceId: 'source', operator: 'checked', value: '' } }),
    ])).toEqual([])
  })
})
