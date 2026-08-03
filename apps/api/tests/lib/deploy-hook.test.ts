import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { clearDb } from '../helpers'
import { initSettings, setSetting } from '../../src/lib/settings'
import { triggerDeployHook } from '../../src/lib/deploy-hook'

const HOOK_URL = 'http://deploy-hook.test/build'

describe('deploy-hook lib', () => {
  const realFetch = globalThis.fetch
  let calls: string[] = []

  beforeEach(async () => {
    await clearDb()
    await initSettings()
    calls = []
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      return Promise.resolve(new Response('ok'))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('is a no-op when docs.deploy_hook_url is unset', async () => {
    triggerDeployHook('docs.config_update', 5)
    await Bun.sleep(20)
    expect(calls).toEqual([])
  })

  it('POSTs the configured hook once for a burst of triggers', async () => {
    await setSetting('docs.deploy_hook_url', HOOK_URL)
    triggerDeployHook('docs.section_create', 10)
    triggerDeployHook('docs.section_update', 10)
    triggerDeployHook('kind.update', 10)
    await Bun.sleep(50)
    expect(calls).toEqual([`POST ${HOOK_URL}`])
  })
})
