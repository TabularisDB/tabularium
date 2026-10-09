// Open state of the header search modal, shared by its trigger and the ⌘K shortcut.
function createSearchStore() {
  let open = $state(false)

  return {
    get open() {
      return open
    },
    show() {
      open = true
    },
    hide() {
      open = false
    },
  }
}

export const search = createSearchStore()
