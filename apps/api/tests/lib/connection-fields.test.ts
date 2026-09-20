import { beforeEach, describe, expect, it } from 'bun:test'
import { clearDb } from '../helpers'
import { setExtensionsDelta, buildMergedSchema } from '../../src/lib/manifest-schema'
import { createKind } from '../../src/lib/kinds'
import { parseManifestText } from '../../src/lib/manifest'
import { validateManifest } from '@tabularium/manifest'
import delta from '../../../../deploy/tabularis/connection-fields.json'

beforeEach(clearDb)

describe('Tabularis connection_fields operator extension', () => {
  for (const scoped of [false, true]) {
    it(`preserves the PR #629 contract (kind override=${scoped})`, async () => {
      const extensions = { engine: { type: 'string' }, ...delta }
      await setExtensionsDelta(extensions)
      if (scoped) await createKind({ key: 'driver', label: 'Drivers', description: null, extensionsSchema: extensions })
      const base = { id: 'bigquery', name: 'BigQuery', version: '1.0.0', kind: 'driver', engine: 'bigquery' }
      const fields = { host: { hidden: true }, username: { label: 'Project ID', placeholder: 'my-project' } }
      expect(parseManifestText(JSON.stringify({ ...base, connection_fields: fields }))).toMatchObject({
        ...base,
        connection_fields: fields,
      })
      expect(parseManifestText(JSON.stringify(base))).toMatchObject(base)
      const schema = buildMergedSchema({ kind: 'driver' })
      for (const invalid of [
        { arbitrary: { hidden: true } },
        { host: { hidden: 'yes' } },
        { host: { label: 'x'.repeat(81) } },
        { host: { placeholder: 'x'.repeat(201) } },
        { password: { secretValue: 'must-not-be-in-manifest' } },
      ])
        expect(validateManifest({ ...base, connection_fields: invalid }, schema).ok).toBe(false)
    })
  }
})
