// JSON-encode an array, returning null when empty or absent. Use the ternary
// `body.tags === undefined ? undefined : jsonArrayOrNull(body.tags)` at patch
// callsites that need to distinguish "untouched" from "cleared".
export function jsonArrayOrNull<T>(v: T[] | undefined | null): string | null {
  if (!v || v.length === 0) return null
  return JSON.stringify(v)
}

// "my-plugin-name" / "my_plugin_name" → "My Plugin Name". Used as a fallback
// display title when no manifest name is available.
export function humanize(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
