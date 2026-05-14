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
- **Typed API.** OpenAPI spec + Eden Treaty client. Build whatever surface you want on top.

## For plugin authors

Connect your account, pick a repo, drop a `.tabularium` manifest in the root. Tabularium installs the release webhook for you and ingests every new tag.

[Submit a plugin →](/submit)

## For operators

Self-host on any Bun runtime. Multi-dialect database, built-in CMS for the static pages, branding (name + colours + logo + analytics), feature toggles, audit log.

[Open the admin panel →](/admin)
