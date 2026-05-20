---
path: /about
title: About
showInFooter: true
navOrder: 50
---
# About Tabularium

Tabularium is a self-hosted plugin registry for the TabularisDB ecosystem. It runs anywhere Bun runs, points at SQLite, Postgres, or MySQL, and lets plugin authors submit through whichever git host they already use — GitHub, GitLab, Gitea, Forgejo.

## What it does

- **Bring your own git host.** OAuth submission against any provider instance the operator configured.
- **Release-driven.** One webhook per plugin; every new tag refreshes the version table automatically.
- **Signed releases.** Every ingested release is hashed and signed with the registry's Ed25519 key; consumers can verify end-to-end against the published JWKS.
- **Typed API.** OpenAPI spec + Eden Treaty client. Build whatever surface you want on top.

## For plugin authors

Connect your account, pick a repo, drop a `.tabularium` manifest in the root. Tabularium previews the manifest on repo select, installs the release webhook for you, and ingests every new tag. Owners can re-pull the manifest or re-hash assets on demand from the plugin detail page, transfer plugin ownership to another account from settings, and ship per-locale READMEs via the `readmes:` field.

[Submit a plugin →](/submit) · [Request a plugin →](/requests)

## For end users

Browse the full catalogue or jump straight into per-kind subpages (themes, snippets, …) when the operator enables them. Request plugins that don't exist yet, upvote others' requests, and — when a desktop client is registered — install with one click via the "Open in App" handoff on the plugin detail page.

## For operators

Self-host on any Bun runtime. Multi-dialect database, built-in CMS for the static pages, branding (name + colours + logo + analytics), feature toggles, audit log, plus an admin Providers console and Security tab for signing-key rotation and integrity backfill.

[Open the admin panel →](/admin)
