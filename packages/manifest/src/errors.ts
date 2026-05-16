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
      // ajv emits a string for single-type schemas and a string[] for unions
      // (e.g. { type: ['string', 'null'] }). Reflect both possibilities.
      return (err.params as { type: string | string[] }).type
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
      // path carries the missing field — see mapAjvErrors below
      return undefined
    case 'additionalProperties':
      return false
    default:
      return undefined
  }
}

// `path` convention: always identifies the specific offending field when one
// exists. For `additionalProperties` we append `params.additionalProperty`;
// for `required` we append `params.missingProperty`. ajv puts both error kinds
// at the parent's instancePath, which is too coarse for callers that want to
// highlight the bad field. Consumers can rely on `path` being field-specific
// and don't need to branch on `code` to find which field is at fault.
export function mapAjvErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  if (!errors || errors.length === 0) return []
  return errors.map((err) => {
    let path: string
    if (err.keyword === 'additionalProperties') {
      path = `${err.instancePath}/${(err.params as { additionalProperty: string }).additionalProperty}`
    } else if (err.keyword === 'required') {
      path = `${err.instancePath}/${(err.params as { missingProperty: string }).missingProperty}`
    } else {
      path = err.instancePath === '' ? '/' : err.instancePath
    }
    return {
      path,
      code: err.keyword,
      message: err.message ?? 'validation failed',
      expected: pickExpected(err),
      actual: truncate(err.data),
    }
  })
}
