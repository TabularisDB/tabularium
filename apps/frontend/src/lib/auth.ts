import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type AuthUser = {
  id: string
  username: string
  provider: string
  providerInstanceUrl: string | null
}

export function useAuth() {
  return useQuery<AuthUser | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      // Backend uses file-based routing, so Treaty's static type tree is empty.
      // Routes still resolve at runtime via the proxy.
      const { data, error } = await (api as any).auth.me.get()
      if (error) return null
      return data as AuthUser
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
