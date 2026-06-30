#!/usr/bin/env bun
/**
 * Plugin i18n discovery — runs before paraglide compile.
 *
 * Plugins ship translations as `messages/{locale}.json` inside their package
 * (same shape as apps/frontend's own messages). This script discovers all such
 * files from both monorepo workspaces and node_modules, merges each locale
 * into `apps/frontend/messages/_plugins.{locale}.json`, and trusts inlang's
 * pathPattern array to pick it up alongside core messages.
 *
 * Discovery sources (in priority order — later wins):
 *   1. monorepo workspaces: `../../packages/plugin-* /messages/{locale}.json`
 *   2. installed third-party plugins: `node_modules/@* /plugin-* /messages/{locale}.json`
 *   3. bundled-plugins drop: `../api/bundled-plugins/* /messages/{locale}.json`
 *
 * Generated files live alongside core messages but are gitignored — never
 * hand-edit them, the next sync will overwrite. To add or change a translated
 * string, edit the plugin's own messages folder and re-run this script.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'

const ROOT = resolve(import.meta.dir, '..', '..', '..')
const FRONTEND_MESSAGES = resolve(import.meta.dir, '..', 'messages')
const LOCALES = ['en', 'de', 'es', 'fr', 'it', 'zh-CN']

type LocaleBag = Record<string, string>
const merged = new Map<string, LocaleBag>(LOCALES.map((l) => [l, {}]))

function isDir(p: string): boolean {
	try {
		return statSync(p).isDirectory()
	} catch {
		return false
	}
}

function pluginCandidatesAt(parent: string, prefix: string): string[] {
	if (!isDir(parent)) return []
	return readdirSync(parent)
		.filter((d) => d.startsWith(prefix))
		.map((d) => join(parent, d))
}

function scopedCandidates(nodeModules: string): string[] {
	if (!isDir(nodeModules)) return []
	const out: string[] = []
	for (const entry of readdirSync(nodeModules)) {
		if (!entry.startsWith('@')) continue
		out.push(...pluginCandidatesAt(join(nodeModules, entry), 'plugin-'))
	}
	return out
}

function discoverPluginDirs(): string[] {
	const dirs = new Set<string>()
	// 1. workspace packages
	for (const dir of pluginCandidatesAt(join(ROOT, 'packages'), 'plugin-')) {
		if (isDir(join(dir, 'messages'))) dirs.add(dir)
	}
	// 2. third-party via node_modules (top-level + frontend-local)
	for (const nm of [join(ROOT, 'node_modules'), join(ROOT, 'apps', 'frontend', 'node_modules')]) {
		for (const dir of scopedCandidates(nm)) {
			if (isDir(join(dir, 'messages'))) dirs.add(dir)
		}
	}
	// 3. bundled-plugins ship-with-image drop (apps/api/bundled-plugins/<id>/messages/)
	for (const dir of pluginCandidatesAt(join(ROOT, 'apps', 'api', 'bundled-plugins'), '')) {
		if (isDir(join(dir, 'messages'))) dirs.add(dir)
	}
	return [...dirs]
}

function ingestPluginDir(pluginDir: string): void {
	for (const loc of LOCALES) {
		const file = join(pluginDir, 'messages', `${loc}.json`)
		if (!existsSync(file)) continue
		let parsed: unknown
		try {
			parsed = JSON.parse(readFileSync(file, 'utf-8'))
		} catch (err) {
			console.warn(`[sync-plugin-messages] skipping ${file}: ${(err as Error).message}`)
			continue
		}
		if (!parsed || typeof parsed !== 'object') continue
		const bag = merged.get(loc)
		if (!bag) continue
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			if (k === '$schema') continue
			if (typeof v !== 'string') continue
			// Later writers win — workspace packages run first, so installed
			// versions override workspace dev copies when both are present.
			bag[k] = v
		}
	}
}

function writeMergedLocale(loc: string, bag: LocaleBag): string {
	const out: Record<string, unknown> = { $schema: 'https://inlang.com/schema/inlang-message-format' }
	for (const k of Object.keys(bag).sort()) out[k] = bag[k]
	const path = join(FRONTEND_MESSAGES, `_plugins.${loc}.json`)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, JSON.stringify(out, null, '\t') + '\n')
	return path
}

const plugins = discoverPluginDirs()
for (const dir of plugins) ingestPluginDir(dir)

const summary: Array<{ locale: string; keys: number; path: string }> = []
for (const [loc, bag] of merged) {
	const path = writeMergedLocale(loc, bag)
	summary.push({ locale: loc, keys: Object.keys(bag).length, path })
}

console.log(`[sync-plugin-messages] discovered ${plugins.length} plugin(s):`)
for (const p of plugins) console.log(`  - ${p}`)
console.log(`[sync-plugin-messages] wrote merged messages:`)
for (const s of summary) console.log(`  ${s.locale}: ${s.keys} keys → ${s.path.replace(ROOT + '/', '')}`)
