# `@tabularium/cli`

Command-line tool for Tabularium plugin authors. Thin wrapper around `@tabularium/manifest` — kept separate so library consumers don't pull `commander` and friends.

## Install

Run on-demand with `bunx` (no install):

```sh
bunx @tabularium/cli validate ./tabularium.yaml
```

Or install globally:

```sh
bun add -g @tabularium/cli
tabularium validate ./tabularium.yaml
```

## Commands

### `validate <file>`

Validates a manifest against the registry's JSON Schema. Reads the schema from `--registry` (default the canonical Tabularium instance) so you're always checking against the operator's live extension deltas, not a stale local copy.

```sh
bunx @tabularium/cli validate ./tabularium.yaml \
  --kind theme \
  --registry https://registry.example.com
```

Flags:

- `--kind <key>` — apply per-kind extensions (e.g. fields only required for themes).
- `--registry <url>` — base URL to fetch the schema from. Defaults to the public Tabularium registry.

Output, per error, one per line:

```
/screenshots/0/url    minLength    must NOT have fewer than 8 characters
/repository/url       pattern      must match pattern "^https?://"
```

Exit code:

- `0` — manifest is valid.
- `1` — validation failed; errors printed to stderr.
- `2` — file or schema couldn't be loaded.

## Use in CI

Drop into any pipeline that has Bun (or use `npx` if you prefer the npm route — the binary works identically).

### GitHub Actions

```yaml
- uses: oven-sh/setup-bun@v2
- run: bunx @tabularium/cli validate ./tabularium.yaml --registry ${{ vars.TABULARIUM_REGISTRY }}
```

### Forgejo Actions

```yaml
- uses: actions/setup-node@v4
- run: npx -y @tabularium/cli validate ./tabularium.yaml --registry $TABULARIUM_REGISTRY
```

A reusable Action that wraps this command is tracked as a follow-up — it'll add nice error annotations on the PR. Until then, the CLI's plain output is grep-able.

## Why a separate package?

`@tabularium/manifest` stays pure (no `commander`, no `picocolors`, no node CLI machinery) so:

- Browser builds of consumer apps don't ship a CLI.
- Future `wasm-bindings` or `deno.land/x` mirrors stay small.
- The CLI can evolve UX-wise (colors, JSON output, etc.) without touching the library API.

## What's next

- Author signatures (`--sign`) — out of scope for the first release. The registry signs every published release; author-side signatures are a separate trust layer.
- `tabularium publish` / `tabularium release` — not happening. The registry is webhook-driven; releases land via your existing git platform (GitHub / Forgejo / Codeberg). The CLI stays a check-only tool.
