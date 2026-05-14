# API

Tabularium exposes a typed JSON API via Elysia + TypeBox. The full OpenAPI spec is at:

- HTML: `GET /openapi`
- JSON: `GET /openapi/json`

## Surfaces

| Surface | Auth | Purpose |
|---------|------|---------|
| `/api/plugins/*` | none | Browse plugins, releases, manifest |
| `/api/requests/*` | optional | List plugin wishlist, upvote, create |
| `/api/pages/*` | none | Render CMS pages |
| `/api/branding` | none | Public branding payload |
| `/api/i18n` | none | Default locale + enabled languages |
| `/api/features` | none | Public feature flag state |
| `/api/submit/oauth` | cookie | Submit a plugin via linked identity |
| `/api/init/*` | bootstrap | Install wizard only |
| `/api/admin/*` | admin | Operator console |
| `/auth/[instance]/*` | OAuth | Provider sign-in callbacks |

## Auth

- Cookies are HTTP-only JWTs signed with the configured key.
- API consumers can pass `Authorization: Bearer <token>` instead.
- Bootstrap admin auth uses an in-memory token; only the install wizard accepts it.

## Typed client

If you're consuming the API from TypeScript, use the Eden Treaty client:

```ts
import { createClient } from '@tabularium/client'
const eden = createClient('https://registry.example.com')
const { data, error } = await eden.api.plugins.get()
```

The client re-exports the backend's `App` type, so every endpoint, query, body, and response is type-checked end-to-end.
