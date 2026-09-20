import { describe, expect, it } from 'bun:test'
import { ManifestSchema, buildSchema, validateManifest } from '../src/index'

for (const lenient of [false, true]) {
  for (const kind of [undefined, 'driver']) {
    describe(`identity (lenient=${lenient}, kind=${kind})`, () => {
      const extensions = {
        id: { type: 'integer', required: true }, // persisted pre-upgrade extension
        engine: { type: 'string', required: true },
      }
      const schema = buildSchema({
        coreSchema: ManifestSchema,
        extensions,
        kindOverrides: { driver: extensions },
        kind,
      })
      const validate = (fields: Record<string, unknown>) =>
        validateManifest({ version: '1.0.0', kind: 'driver', engine: 'sqlite', ...fields }, schema, { lenient })
      it('preserves legacy identity and version', () => {
        const result = validate({ name: 'jdbc-sqlite' })
        expect(result.ok).toBe(true)
        expect(result.normalized).toMatchObject({ name: 'jdbc-sqlite', version: '1.0.0', engine: 'sqlite' })
      })
      it('preserves explicit identity and display name', () => {
        const result = validate({ id: 'jdbc-sqlite', name: 'SQLite JDBC' })
        expect(result.ok).toBe(true)
        expect(result.normalized).toMatchObject({ id: 'jdbc-sqlite', name: 'SQLite JDBC', version: '1.0.0' })
      })
      it('rejects display-only legacy names and invalid explicit ids', () => {
        for (const fields of [
          { name: 'SQLite JDBC' },
          { name: 'a'.repeat(65) },
          { id: '', name: 'jdbc-sqlite' },
          { id: null, name: 'jdbc-sqlite' },
          { id: '../sqlite', name: 'SQLite JDBC' },
          { id: 42, name: 'jdbc-sqlite' },
          { id: 'sqlite', name: '   ' },
          { id: 'sqlite', name: 'a'.repeat(121) },
        ])
          expect(validate(fields).ok).toBe(false)
      })
      it('retains validation of other extension fields', () => {
        expect(validate({ id: 'sqlite', name: 'SQLite', engine: 42 }).ok).toBe(false)
      })
    })
  }
}
