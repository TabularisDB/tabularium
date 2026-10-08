# Connect to Tabularium with MCP

Remote MCP is served at **`<BASE_URL>/mcp`** by the existing API process. Use an MCP client supporting Streamable HTTP and OAuth authorization-code flow with S256 PKCE. Add that URL, sign in with your Tabularium account, and approve the requested permissions. Sign-in uses only the enabled provider instances from your Tabularium settings, including their configured display names. The MCP dialog does not offer password or administrator recovery login. The consent screen identifies the client, callback and permissions. OAuth pages inherit the instance name, logo, favicon, brand colors and footer; provider logo overrides and the registry theme preference are respected.

Connection cards summarize access groups and keep the full permission list under “View permissions”. Read and write grants are combined into one row per administrative area without implying extra access.

Connections are managed from **Settings → MCP → Manage connected applications**, or directly at `<BASE_URL>/oauth/connections`. Revocation immediately invalidates that connection's access and refresh tokens. Browser logout ends the browser session; it does not revoke independently approved application connections.

## Permissions

Effective access is the intersection of granted scopes, the user's current role and existing resource ownership rules. Tool discovery filters unavailable tools, and every call rechecks access. Read and write scopes are independent: request both if both are needed.

| Scope | Access |
| --- | --- |
| `catalog:read` | Plugin search/detail/stats/integrity, docs, pages, kinds, public instance metadata, community requests, manifest validation |
| `account:read` | Own profile, linked repositories and transfers |
| `plugins:write` | Submit/preview, publish, delete own plugins, transfers, manifest refresh, rehash and yank |
| `requests:write` | Create requests, vote and claim |
| `admin:<area>:read` | Read an administrative area as a current admin |
| `admin:<area>:write` | Change an administrative area as a current admin |

Admin areas: `plugins`, `users`, `manifest`, `docs`, `pages`, `settings`, `provider-instances`, `features`, `kinds`, `branding`, `home-copy`, `i18n`, `instance`, `infra`, `audit`, `diagnostics`, `requests`. Unknown scopes are rejected. A non-admin cannot grant admin scopes. Role demotion removes access on the next request even if the token has not expired.

Examples: a catalog assistant requests `catalog:read`; a publishing assistant requests `catalog:read account:read plugins:write`; a moderation assistant requests `catalog:read admin:plugins:read admin:plugins:write`. The default when scope is omitted is only `catalog:read`.

Existing `tbm_` admin API tokens now enforce these exact area scopes too. Legacy `scopes: null` retains full-admin access; unknown legacy scope strings grant no matching action. Scoped credentials cannot create tokens or alter recovery authentication. Browser session JWTs and publisher/admin API tokens are not accepted as MCP access tokens.

## Who decides which permissions are requested?

The **MCP client chooses the requested scopes**. Tabularium checks and grants them after you approve the request:

1. Tabularium advertises the available scope names as `scopes_supported` in its OAuth metadata. This is a capability list, not a grant of access.
2. Your MCP client chooses a set of scopes and sends them in the OAuth authorization request's `scope` parameter. Depending on the client, the choice comes from its settings, a login command or its discovery defaults.
3. Tabularium shows those requested permissions in the consent page. **Currently you can allow the entire requested set or deny it; you cannot deselect individual permissions in that page.** To request less access, deny the request, change the client's scopes and start authorization again.
4. Every tool call must satisfy the granted scopes, your current Tabularium role and the existing ownership checks. A login provider such as GitHub or Codeberg identifies you; it does not decide your Tabularium administrator privileges.

Being an admin does not automatically give a client admin access. For example, an admin who approves only `catalog:read` has a read-only catalog connection. Conversely, a normal user cannot approve `admin:plugins:write`; Tabularium rejects that grant instead of promoting the user.

The server's `catalog:read` default applies **only if the client omits `scope`**. Some clients automatically request all advertised scopes. Always check what the consent page actually requests, especially when connecting as a normal user.

## Connect Codex as a user or administrator

The following examples use `https://registry.tabularis.dev/mcp`. Replace that URL with your own instance's MCP URL if needed. The sign-in providers are already configured by the instance administrator under `/admin/providers`; connecting an MCP client does not require creating another GitHub/Codeberg OAuth app.

### 1. Configure the server

Add or update this section in `~/.codex/config.toml`. If `[mcp_servers.tabularium]` already exists, edit it rather than adding a second section:

```toml
[mcp_servers.tabularium]
url = "https://registry.tabularis.dev/mcp"
scopes = ["catalog:read", "account:read"]
startup_timeout_sec = 30
tool_timeout_sec = 180
enabled = true
```

`scopes` records the intended permissions for this connection. Codex versions can differ in how they select discovery defaults, so the login examples below also pass the requested set explicitly with `--scopes`. Tabularium publishes its resource URL through discovery; a separate `oauth_resource` override is not needed for this setup.

### 2. Choose the access you need and sign in

**Normal user: browse the catalog and read your own account**

```sh
codex mcp login tabularium --scopes catalog:read,account:read
```

**Plugin author: browse, read your account and manage your own plugins**

Set `scopes` in the configuration to `["catalog:read", "account:read", "plugins:write"]`, then run:

```sh
codex mcp login tabularium --scopes catalog:read,account:read,plugins:write
```

**Administrator: review and moderate plugins**

Set `scopes` to `["catalog:read", "account:read", "admin:plugins:read", "admin:plugins:write"]`, then run:

```sh
codex mcp login tabularium --scopes catalog:read,account:read,admin:plugins:read,admin:plugins:write
```

Sign in using a Tabularium account whose role is `admin` for the administrator example. Add other exact `admin:<area>:read` / `admin:<area>:write` scopes from the [permission table](#permissions) only for the areas you want the client to access. Read and write are separate; neither implies the other.

The login command opens an authorization URL. You may also copy that URL into your own browser on the same machine. Choose one of the instance's enabled sign-in providers, review the client name and requested permissions, and select **Allow access**. Codex completes the callback and stores its OAuth credentials. Do not copy a browser session cookie or an admin API token into the MCP configuration.

For **full administrator access**, request all scopes currently advertised by the instance. This requires an administrator account and includes write permissions for settings, users, infrastructure and other administrative areas. With `curl` and `jq` installed:

```sh
TABULARIUM_SCOPES="$(curl -fsS https://registry.tabularis.dev/.well-known/oauth-authorization-server | jq -r '.scopes_supported | join(",")')"
codex mcp login tabularium --scopes "$TABULARIUM_SCOPES"
```

Keep the `scopes` array in your configuration aligned with the access you intend to request on future logins. The explicit login flag selects the requested set for that authorization attempt; the issued grant is what authorizes subsequent tool calls.

### 3. Verify the connection

```sh
codex mcp list
codex mcp get tabularium
```

If your running client has not loaded the new server, reload its MCP connections or start a new session. Ask it to list a few plugins. With `account:read`, it can also call `get_me`. Administrative tools are available only when both the current account role and granted scopes permit them.

The [official Codex MCP documentation](https://developers.openai.com/codex/mcp) covers client setup and OAuth login options.

### Change or revoke access

Editing `config.toml` alone does **not** change an existing OAuth grant. To replace a connection's permissions:

1. Revoke the old connection under **Settings → MCP → Manage connected applications** (`/oauth/connections`). This immediately disables its access and refresh tokens.
2. Update the client's requested scopes.
3. Run `codex mcp login tabularium --scopes ...` with the new explicit set, sign in and approve it.

Revoking the old grant also prevents an earlier, broader connection from remaining active after you authorize a narrower one. Browser logout does not revoke MCP connections.

## Tools

Tools are explicitly allowlisted in `apps/api/src/lib/mcp/catalog.ts`; names derive from API operation IDs. Schemas derive from the existing route definitions, with arguments grouped into `params`, `query` and `body`. For example:

```json
{"name":"list_plugins","arguments":{"query":{"search":"postgres","limit":"10"}}}
```

```json
{"name":"update_plugin","arguments":{"params":{"id":"my-plugin"},"body":{"status":"approved"}}}
```

Use `tools/list` for the exact supported fields. Calls use existing handlers in-process with a trusted request-local user context. There is no arbitrary HTTP tool, forwarded browser cookie, forwarded MCP token, or synthesized full-privilege JWT. Publishing reuses the existing publisher ownership policy. Tool results contain `{status, data}` and failures use `isError`. Output is limited to 256 KiB; a truncated response explicitly states that the operation already ran, so do not repeat a write merely to retrieve its response.

Setup, login/account deletion, identity unlinking, token issuance/recovery, inbound webhooks, binary uploads and download redirects are not exposed as tools. Submission responses omit the webhook secret. Existing download and upload interfaces remain available outside MCP. Encrypted settings are redacted based on their stored encryption flag, including registry signing keys.

## OAuth endpoints and lifecycle

- `/.well-known/oauth-protected-resource/mcp` (also root protected-resource metadata)
- `/.well-known/oauth-authorization-server`
- `POST /oauth/register`: public dynamic client registration (`client_name`, `redirect_uris`, `token_endpoint_auth_method: "none"`)
- `GET/POST /oauth/authorize`: login and explicit consent
- `POST /oauth/token`: form-encoded `authorization_code` or `refresh_token` grants
- `POST /oauth/revoke`: revoke a token's connection using `token` and `client_id`

Clients must send `resource=<BASE_URL>/mcp` during authorization, code exchange and refresh. Exact registered redirect matching is required; HTTPS callbacks and HTTP loopback callbacks are supported. Authorization codes expire after five minutes. Access tokens last at most 15 minutes; refresh tokens rotate, and a connection has an absolute 30-day lifetime. Reusing a spent code or refresh token revokes the whole connection. Scope changes require fresh consent. Client registrations last one year.

OAuth state is stored in `oauth_records` with hashed codes/access/refresh tokens. Atomic compare-and-set consumption supports multiple processes. Credentials from upstream Git providers are never returned. Audit events record user, OAuth client, grant and tool operation without request payloads or tokens. Expired records are pruned during registration after a 30-day replay-detection retention window.

The transport is stateless request/response; it does not allocate MCP sessions or hold SSE streams open. Authenticated GET/DELETE return 405. POST supports the SDK's protocol negotiation. OAuth registration/token endpoints use the existing configurable `ratelimit.oauth` bucket; MCP uses `ratelimit.mcp`. Existing limiter storage/proxy settings still apply; use shared Redis and an edge rate limit for multi-replica public installations.

## Deployment and local development

Normal API startup applies the `20261008170000_oauth` migration automatically, alongside the existing migrations. To run migrations separately before a rollout, use these commands from `apps/api`:

```sh
# SQLite
bun run migrate
# PostgreSQL
bunx drizzle-kit migrate --config drizzle.pg.config.ts
# MySQL
bunx drizzle-kit migrate --config drizzle.mysql.config.ts
```

Set `BASE_URL` to the externally reachable canonical origin, with HTTPS in production. Proxy `/mcp`, `/oauth/*`, `/.well-known/oauth-*` and existing `/auth/*` to the API, preserving Authorization and MCP headers. When frontend and API origins differ, provider login returns OAuth flows to `BASE_URL`. Development proxy entries are included. Browser-hosted clients must have their origin in `ALLOWED_ORIGINS`; desktop clients without Origin headers work directly. Before installation completes, OAuth/MCP endpoints return 503.

## Verification

From `apps/api`, run `bun test` and `bun run check`. The OAuth/MCP tests exercise the official SDK against the real route stack, consent/CSRF, PKCE/bindings, code and refresh replay/races, ownership, dynamic role changes, encrypted-setting redaction and revocation. Verification on 2026-10-08: 522 API tests passed; API and frontend typechecks passed. Browser login, consent, cross-origin callback, token exchange, MCP call and revocation were exercised. Full migrations plus registration, PKCE, access verification, refresh rotation and replay revocation also passed against isolated PostgreSQL 16 and MySQL 8.4 containers.
