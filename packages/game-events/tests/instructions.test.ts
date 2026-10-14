import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { instructions } from '../src/index.js'

describe('instruction contract', () => {
  it('documents every supported instruction in AsyncAPI', () => {
    const spec = readFileSync(new URL('../../../docs/asyncapi.yaml', import.meta.url), 'utf8')
    const enumValues = spec.match(/\n    Instruction:\n      type: string\n      enum: \[([^\]]+)\]/)?.[1]
    expect(enumValues).toBeDefined()
    expect(enumValues?.split(',').map(value => value.trim()).sort())
      .toEqual(Object.keys(instructions).sort())
  })
})
