import { readFileSync } from 'node:fs'
import { parseManifest, validateManifest, fetchSchema, ParseError } from '@tabularium/manifest'

export type ValidateOptions = {
  registry: string
  kind?: string
}

export async function runValidate(file: string, opts: ValidateOptions): Promise<number> {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (err) {
    process.stderr.write(`unable to read ${file}: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  let parsed: Record<string, unknown>
  try {
    parsed = parseManifest(text)
  } catch (err) {
    if (err instanceof ParseError) {
      process.stderr.write(`parse error: ${err.message}\n`)
    } else {
      process.stderr.write(`unexpected error: ${err instanceof Error ? err.message : String(err)}\n`)
    }
    return 1
  }

  let schema: Record<string, unknown>
  try {
    schema = await fetchSchema(opts.registry, opts.kind ? { kind: opts.kind } : {})
  } catch (err) {
    process.stderr.write(`schema fetch failed: ${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  const result = validateManifest(parsed, schema)
  if (result.ok) {
    process.stdout.write('ok\n')
    return 0
  }
  for (const e of result.errors) {
    process.stdout.write(`${e.path}  ${e.code}  ${e.message}\n`)
  }
  return 1
}
