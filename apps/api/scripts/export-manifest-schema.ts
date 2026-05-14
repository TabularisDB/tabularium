import { ManifestSchema } from '../src/lib/manifest'
import { resolve } from 'node:path'

const out = resolve(import.meta.dir, '../.cache/manifest.schema.json')
const payload = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://tabularium.wiki/manifest.schema.json',
  title: 'Tabularium plugin manifest',
  description: 'Plugin authors drop a .tabularium / .tabularium.yaml / .tabularium.yml / .tabularium.json at the repo root.',
  ...JSON.parse(JSON.stringify(ManifestSchema)),
}
await Bun.write(out, JSON.stringify(payload, null, 2) + '\n')
console.log(`wrote ${out}`)
