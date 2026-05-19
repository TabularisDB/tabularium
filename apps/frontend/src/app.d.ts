// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

// Shims so svelte-check stops complaining when it traverses backend source for
// the Eden treaty App type. Backend uses tsconfig path aliases that frontend
// doesn't know about; these declarations make them resolve to unknown.
declare module '$lib' {
  const _: unknown
  export default _
}
declare module '$lib/*' {
  const _: unknown
  export default _
}
declare module '$db' {
  const _: unknown
  export default _
}
declare module '$db/*' {
  const _: unknown
  export default _
}
declare module '$middleware' {
  const _: unknown
  export default _
}
declare module '$middleware/*' {
  const _: unknown
  export default _
}
declare module '$routes' {
  const _: unknown
  export default _
}
declare module '$routes/*' {
  const _: unknown
  export default _
}

export {}
