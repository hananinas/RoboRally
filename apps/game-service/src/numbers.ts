export type Integer = number & { readonly __brand: 'Integer' }
export type UnsignedInteger = Integer & { readonly __unsigned: true }
export type PositiveInteger = UnsignedInteger & { readonly __positive: true }

export function Integer(value: number): Integer {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Expected an integer, got ${value}`)
  }
  return value as Integer
}

export function UnsignedInteger(value: number): UnsignedInteger {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Expected an unsigned integer, got ${value}`)
  }
  return value as UnsignedInteger
}

export function PositiveInteger(value: number): PositiveInteger {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Expected a positive integer, got ${value}`)
  }
  return value as PositiveInteger
}
