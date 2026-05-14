import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { initStorage, storage, resetStorageForTests } from '../../src/lib/storage'

const UPLOADS = resolve('./data/uploads')

describe('disk storage', () => {
  beforeEach(async () => {
    resetStorageForTests()
    initStorage()
    await mkdir(UPLOADS, { recursive: true })
  })

  afterAll(async () => {
    await rm(resolve(UPLOADS, 'provider-logos/storage-test.png'), { force: true })
  })

  it('writes a file and returns the public URL', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10])
    const result = await storage().put('provider-logos/storage-test.png', bytes, 'image/png')
    expect(result.url).toBe('/uploads/provider-logos/storage-test.png')
    const written = await Bun.file(resolve(UPLOADS, 'provider-logos/storage-test.png')).arrayBuffer()
    expect(new Uint8Array(written)).toEqual(bytes)
  })

  it('del removes a previously-written file', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    await storage().put('provider-logos/del-test.png', bytes, 'image/png')
    await storage().del('provider-logos/del-test.png')
    expect(await Bun.file(resolve(UPLOADS, 'provider-logos/del-test.png')).exists()).toBe(false)
  })

  it('del on missing key is a no-op', async () => {
    await expect(storage().del('provider-logos/never-existed.png')).resolves.toBeUndefined()
  })
})
