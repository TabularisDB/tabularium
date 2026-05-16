import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { mapAjvErrors, type ValidationError } from './errors'

function makeAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    verbose: true, // so err.data lands in our ValidationError.actual via mapAjvErrors
  })
  addFormats(ajv)
  return ajv
}

export type ValidateResult =
  | { ok: true; normalized: Record<string, unknown>; errors: [] }
  | { ok: false; normalized: null; errors: ValidationError[] }

export function validateManifest(
  parsed: unknown,
  schema: Record<string, unknown>,
): ValidateResult {
  const ajv = makeAjv()
  const validate = ajv.compile(schema)
  // Clone so ajv's data mutations (when removeAdditional is set) don't leak.
  // We deliberately do NOT pass removeAdditional because we want
  // additionalProperties to surface as an error (matches existing server behaviour).
  const dataCopy = structuredClone(parsed)
  const ok = validate(dataCopy)
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
