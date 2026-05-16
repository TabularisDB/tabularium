import type { ErrorObject } from 'ajv'

export type ValidationError = {
  path: string
  code: string
  message: string
  expected?: unknown
  actual?: unknown
}

const ACTUAL_TRUNCATE = 200

function truncate(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > ACTUAL_TRUNCATE ? value.slice(0, ACTUAL_TRUNCATE) : value
}

function pickExpected(err: ErrorObject): unknown {
  switch (err.keyword) {
    case 'type':
      return (err.params as { type: string }).type
    case 'pattern':
      return (err.params as { pattern: string }).pattern
    case 'enum':
      return (err.params as { allowedValues: unknown[] }).allowedValues
    case 'maxLength':
    case 'minLength':
    case 'maxItems':
    case 'minItems':
      return (err.params as Record<string, unknown>).limit
    case 'required':
      return (err.params as { missingProperty: string }).missingProperty
    case 'additionalProperties':
      return false
    default:
      return undefined
  }
}

export function mapAjvErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors || errors.length === 0) return []
  return errors.map((err) => {
    const path = err.instancePath === ''
      ? (err.keyword === 'additionalProperties'
          ? `/${(err.params as { additionalProperty: string }).additionalProperty}`
          : '/')
      : err.keyword === 'additionalProperties'
        ? `${err.instancePath}/${(err.params as { additionalProperty: string }).additionalProperty}`
        : err.instancePath
    return {
      path,
      code: err.keyword,
      message: err.message ?? 'validation failed',
      expected: pickExpected(err),
      actual: truncate(err.data),
    }
  })
}
