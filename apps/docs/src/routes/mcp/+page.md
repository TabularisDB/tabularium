---
title: "MCP & AI assistants"
---

<!-- Keep these setup sections aligned with apps/api/MCP.md. -->

# MCP & AI assistants

Choose a tutorial:

- [Generic MCP client](#Generic-MCP-client)
- [Codex: user, author or administrator](#Connect-Codex-as-a-user-or-administrator)
- [Claude Code and Claude Web/Desktop](#Connect-Claude)

For protocol details and deployment, see the [technical MCP reference](https://github.com/TabularisDB/tabularium/blob/main/apps/api/MCP.md).

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

## Generic MCP client

### What you need

- An account on the Tabularium instance. Use an administrator account only when requesting admin scopes.
- A client supporting **remote Streamable HTTP MCP** and browser-based **OAuth with PKCE**. Tabularium supports automatic OAuth client registration (DCR).
- The instance URL. These tutorials use `https://registry.tabularis.dev`; replace it for your own registry.

A **provider** is a sign-in option such as GitHub or Codeberg. The instance administrator configures providers under `/admin/providers`. As an MCP user, you select an existing provider; you do not create an OAuth app yourself.

### Connect in the client's settings

1. Open the client's MCP servers, integrations or connectors settings and add a remote server.
2. Give it a name such as **Tabularium**. Set the transport to **Streamable HTTP** and URL to `https://registry.tabularis.dev/mcp`.
3. Select OAuth/browser sign-in and automatic client registration if the client asks. Leave fixed bearer-token headers and client-secret fields empty.
4. If the client exposes OAuth scope settings, choose a profile below. The exact setting name depends on the client; there is no universal MCP configuration-file format.
5. Connect or authenticate. In the browser, select an enabled sign-in provider, sign in to your Tabularium account, review the requested rights and allow access.
6. Return to the client and enable the server's tools for the conversation if required.

| Intended use | OAuth scopes, separated by spaces |
| --- | --- |
| Catalog only | `catalog:read` |
| User: catalog and own account | `catalog:read account:read` |
| Author: manage own plugins | `catalog:read account:read plugins:write` |
| Admin: moderate plugins | `catalog:read account:read admin:plugins:read admin:plugins:write` |

An admin login alone does not request admin tools. If the client has no scope control and asks for an unsuitable set, deny the request and use a client that lets you configure scopes. Tabularium cannot reduce the requested set in its consent screen.

### Check that it works

Start with: **“Use Tabularium to list three plugins without changing anything.”** With `account:read`, also ask which Tabularium account is connected. With `admin:plugins:read`, ask to list pending plugins. These exercise `list_plugins`, `get_me` and `admin_list_plugins` respectively.

An empty catalog is a valid result. A successful tool response has an HTTP status in its structured result; merely seeing the server in the client's settings does not prove authentication worked.

### Common setup problems

| Symptom | What to check |
| --- | --- |
| No sign-in providers shown | An instance admin must enable a provider under `/admin/providers`. |
| `access_denied` when approving | Check your Tabularium role and the requested admin scopes. |
| Missing tools or permission denied | Check the scopes actually granted; reconnect with the required set. |
| Login returns to an unreachable localhost page | For CLI clients, use a browser on the client machine or its documented remote-login/callback workflow. |
| Remote connector cannot reach a private registry | Hosted clients need network access from their servers, not just your browser. |

Revoke unwanted connections under **Settings → MCP → Manage connected applications**. Updating a client setting or signing out in the browser does not revoke an existing grant.

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

Sign in using a Tabularium account whose role is `admin` for the administrator example. Add other exact `admin:<area>:read` / `admin:<area>:write` scopes from the [permission table](#Permissions) only for the areas you want the client to access. Read and write are separate; neither implies the other.

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

## Connect Claude

### Claude Code

Use a current Claude Code release. The command syntax below was checked with Claude Code 2.1.294. Register a user-level HTTP server with explicit OAuth permissions:

```sh
claude mcp add-json --scope user tabularium '{"type":"http","url":"https://registry.tabularis.dev/mcp","oauth":{"scopes":"catalog:read account:read"}}'
claude mcp login tabularium
```

`--scope user` selects where Claude Code stores the configuration; it does **not** select Tabularium permissions. The `oauth.scopes` field controls those permissions and uses one **space-separated string**, not a JSON array. See the [official scope configuration](https://code.claude.com/docs/en/mcp#restrict-oauth-scopes).

For plugin-author access, use this value before registering:

```json
{"type":"http","url":"https://registry.tabularis.dev/mcp","oauth":{"scopes":"catalog:read account:read plugins:write"}}
```

For plugin administration, sign in as a Tabularium admin and use:

```json
{"type":"http","url":"https://registry.tabularis.dev/mcp","oauth":{"scopes":"catalog:read account:read admin:plugins:read admin:plugins:write"}}
```

Pass the chosen JSON object to `claude mcp add-json --scope user tabularium '…'` instead of the user example. To request full administrator access, put all advertised scope names from the OAuth metadata into `oauth.scopes`, separated by spaces; there is no `admin:*` wildcard.

If the server already exists, revoke its old Tabularium grant first, then remove the saved configuration before adding it with the new scope set:

```sh
claude mcp remove --scope user tabularium
```

Complete browser sign-in and consent, then check:

```sh
claude mcp get tabularium
```

Inside Claude Code, `/mcp` also provides connection/authentication controls. Ask it to list three Tabularium plugins. [Claude Code's MCP guide](https://code.claude.com/docs/en/mcp) documents the CLI and interactive flow.

### Claude Web / Desktop: remote connector

For Claude chat, use a remote connector. The steps differ from Claude Code's local configuration:

1. Open **Customize → Connectors** and add a custom connector. In an organization, an authorized owner/admin may need to add it first under organization connector settings.
2. Enter **Tabularium** and `https://registry.tabularis.dev/mcp`.
3. Choose browser sign-in. If OAuth client options are shown, select **Register automatically**: Tabularium supports DCR. Leave manual client credentials and fixed request headers empty.
4. Finish adding the connector, connect your account and review the Tabularium consent page.
5. Enable the connector in your chat and ask it to list three plugins.

[Claude's remote connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) describes the current UI and organization requirements. Hosted connections must be able to reach the registry from Anthropic's infrastructure; a URL reachable only on your laptop is insufficient.

**Web scope limitation:** Claude Code's `oauth.scopes` setting does not configure Claude Web/Desktop connectors. The hosted client chooses the OAuth request. Inspect the Tabularium consent page; if the connector UI cannot request your desired scopes, use the Claude Code tutorial for explicit control. Signing in as an admin does not by itself unlock admin tools. Disabling individual tools in a chat does not narrow the underlying OAuth grant.

The Claude instructions are based on the official guides and installed CLI help; a production Claude OAuth round-trip has not been tested for this release. The native Codex integration has been tested end to end.

