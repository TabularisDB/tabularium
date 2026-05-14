import { createClient } from '@tabularium/client'

const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5180'

export const eden = createClient(baseUrl)
