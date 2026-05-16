import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { mapAjvErrors, type ValidationError } from './errors'

function makeAjv(options: { removeAdditional?: 'all' } = {}) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    verbose: true, // so err.data lands in our ValidationError.actual via mapAjvErrors
    removeAdditional: options.removeAdditional,
  })
  addFormats(ajv)
  return ajv
}

export type ValidateResult =
  | { ok: true; normalized: Record<string, unknown>; errors: [] }
  | { ok: false; normalized: null; errors: ValidationError[] }

export type ValidateOptions = { lenient?: boolean }

export function validateManifest(
  parsed: unknown,
  schema: Record<string, unknown>,
  options: ValidateOptions = {},
): ValidateResult {
  const { lenient = false } = options
  // In lenient mode: removeAdditional strips unknown fields from the clone.
  // In strict mode: additionalProperties violations surface as errors.
  const ajv = makeAjv(lenient ? { removeAdditional: 'all' } : {})
  const validate = ajv.compile(schema)
  // Clone so ajv's data mutations (removeAdditional) don't leak to the caller.
  const dataCopy = structuredClone(parsed)
  const ok = validate(dataCopy)
  if (lenient) {
    // Lenient mode: unknown fields were already stripped from dataCopy by ajv.
    // Only hard errors (type mismatches, pattern failures, etc.) cause ok:false.
    if (ok) {
      return { ok: true, normalized: dataCopy as Record<string, unknown>, errors: [] }
    }
    // Filter out additionalProperties errors — those were handled by removeAdditional.
    const errors = mapAjvErrors(validate.errors).filter(
      (e) => e.code !== 'additionalProperties',
    )
    if (errors.length === 0) {
      return { ok: true, normalized: dataCopy as Record<string, unknown>, errors: [] }
    }
    return { ok: false, normalized: null, errors }
  }
  if (ok) {
    return {
      ok: true,
      normalized: dataCopy as Record<string, unknown>,
      errors: [],
    }
  }
  return {
    ok: false,
    normalized: null,
    errors: mapAjvErrors(validate.errors),
  }
}
