import { beforeEach, expect, test } from 'bun:test'
import { Registry } from '../../../src/lib/plugin-host/registry'

let r: Registry

beforeEach(() => {
  r = new Registry()
})

test('definePoint → register → resolve round-trips (single-active)', () => {
  r.definePoint({ id: 'email-provider', arity: 'single-active' })
  r.register('email-provider', 'smtp', { kind: 'smtp' })
  expect(r.resolve<{ kind: string }>('email-provider')).toEqual({ kind: 'smtp' })
})

test('single-active: first registration auto-elects as active', () => {
  r.definePoint({ id: 'email-provider', arity: 'single-active' })
  r.register('email-provider', 'smtp', { kind: 'smtp' })
  r.register('email-provider', 'turbo', { kind: 'turbo' })
  expect(r.getActive('email-provider')).toBe('smtp')
  expect(r.resolve<{ kind: string }>('email-provider')).toEqual({ kind: 'smtp' })
})

test('single-active: setActive switches the resolved impl', () => {
  r.definePoint({ id: 'email-provider', arity: 'single-active' })
  r.register('email-provider', 'smtp', { kind: 'smtp' })
  r.register('email-provider', 'turbo', { kind: 'turbo' })
  r.setActive('email-provider', 'turbo')
  expect(r.getActive('email-provider')).toBe('turbo')
  expect(r.resolve<{ kind: string }>('email-provider')).toEqual({ kind: 'turbo' })
})

test('multi: resolveAll returns ordered contributions', () => {
  r.definePoint({ id: 'cron-job', arity: 'multi' })
  r.register('cron-job', 'a', { tick: 1 })
  r.register('cron-job', 'b', { tick: 2 })
  r.register('cron-job', 'c', { tick: 3 })
  const all = r.resolveAll<{ tick: number }>('cron-job')
  expect(all.map((x) => x.name)).toEqual(['a', 'b', 'c'])
  expect(all.map((x) => x.impl.tick)).toEqual([1, 2, 3])
})

test('register without definePoint throws', () => {
  expect(() => r.register('nope', 'x', {})).toThrow(/unknown extension point: nope/)
})

test('duplicate contribution name throws', () => {
  r.definePoint({ id: 'p', arity: 'multi' })
  r.register('p', 'x', { a: 1 })
  expect(() => r.register('p', 'x', { a: 2 })).toThrow(/duplicate contribution p\/x/)
})

test('setActive on multi point throws', () => {
  r.definePoint({ id: 'cron-job', arity: 'multi' })
  r.register('cron-job', 'a', {})
  expect(() => r.setActive('cron-job', 'a')).toThrow(/setActive is only valid for single-active/)
})

test('definePoint twice on same id throws', () => {
  r.definePoint({ id: 'p', arity: 'single-active' })
  expect(() => r.definePoint({ id: 'p', arity: 'single-active' })).toThrow(/already defined: p/)
})

test('setActive on unknown name throws', () => {
  r.definePoint({ id: 'p', arity: 'single-active' })
  r.register('p', 'a', {})
  expect(() => r.setActive('p', 'b')).toThrow(/unknown contribution p\/b/)
})

test('resolve returns null on unknown point', () => {
  expect(r.resolve('mystery')).toBeNull()
})

test('resolveAll on unknown point returns []', () => {
  expect(r.resolveAll('mystery')).toEqual([])
})
