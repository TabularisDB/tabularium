---
path: /about
title: About
showInFooter: true
navOrder: 1
---
# About

This is a Tabularium registry — a community-driven catalog for plugins, indexed straight from their source repositories.

## How it works

- Authors host their plugin on **GitHub**, **GitLab**, **Codeberg**, or any self-hosted Gitea/Forgejo instance.
- They drop a `.tabularium` manifest (YAML or JSON) at the repo root with name, description, category, tags, icon, screenshots, etc.
- Releases are pulled automatically via webhooks — the registry never stores artifacts itself, it points to the source.

## Contributing

- Found a plugin you wish existed? Open a [request](/requests).
- Built one yourself? [Submit it](/submit) — sign in with your provider, pick the repo, done.
