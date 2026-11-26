import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { effects } from '../src/index.js'

describe('instruction contract', () => {
  it('documents every supported instruction in AsyncAPI', () => {
    const spec = readFileSync(new URL('../../../docs/communication/asyncapi.yaml', import.meta.url), 'utf8')
    const enumValues = spec.match(/\r?\n    Instruction:\r?\n      type: string\r?\n      enum: \[([^\]]+)\]/)?.[1]
    expect(enumValues).toBeDefined()
    expect(enumValues?.split(',').map(value => value.trim()).sort())
      .toEqual([...Object.keys(effects), 'AGAIN'].sort())
  })
})
