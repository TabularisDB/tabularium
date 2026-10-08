import { expect, test } from 'bun:test'
import { permissionList, permissionDisclosure } from '../../src/lib/oauth/pages'

test('read and write scopes for one admin area become one row', () => {
  const html = permissionList(['admin:users:read', 'admin:users:write', 'admin:plugins:read'])
  expect(html.match(/data-permission="admin:users"/g)).toHaveLength(1)
  expect(html).toContain('Read &amp; write')
  expect(html).toContain('Users')
  expect(html).not.toContain('Limited to your current administrator permissions.')
})
test('write-only grants do not imply read access', () => {
  const html = permissionList(['admin:users:write'])
  expect(html).toContain('Write')
  expect(html).not.toContain('Read')
})
test('connection cards collapse permission details and summarize access groups', () => {
  const html = permissionDisclosure([
    'catalog:read',
    'account:read',
    'admin:users:read',
    'admin:users:write',
    'admin:plugins:read',
  ])
  expect(html).toContain('Catalog')
  expect(html).toContain('Account')
  expect(html).toContain('Administration · 2 areas')
  expect(html).toContain('<details class="permission-disclosure">')
  expect(html).not.toContain('<details class="permission-disclosure" open')
  expect(html).toContain('View permissions')
})
test('duplicate scopes are deduplicated and unknown scopes remain visible and escaped', () => {
  const html = permissionList(['catalog:read', 'catalog:read', '<unknown>', 'constructor', 'admin:__proto__:read'])
  expect(html.match(/Browse the catalog/g)).toHaveLength(1)
  expect(html).toContain('&lt;unknown&gt;')
  expect(html).not.toContain('<unknown>')
  expect(html).toContain('<code>constructor</code>')
  expect(html).toContain('__proto__')
})
