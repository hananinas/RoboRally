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
  const integer = Integer(value)
  if (integer < 0) {
    throw new RangeError(`Expected an unsigned integer, got ${value}`)
  }
  return integer as UnsignedInteger
}

export function PositiveInteger(value: number): PositiveInteger {
  const unsigned = UnsignedInteger(value)
  if (unsigned <= 0) {
    throw new RangeError(`Expected a positive integer, got ${value}`)
  }
  return unsigned as PositiveInteger
}
