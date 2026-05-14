export function resolveAbsolute(base: string, maybeRelative: string): string {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative
  try {
    return new URL(maybeRelative, base.endsWith('/') ? base : `${base}/`).toString()
  } catch {
    return maybeRelative
  }
}
