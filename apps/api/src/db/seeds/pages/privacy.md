---
path: /privacy
title: Privacy
showInFooter: true
navOrder: 3
---
# Privacy

## What we store

When you sign in via an OAuth provider, the registry stores:

- Your public username on that provider.
- Your provider account ID (so we can match you on re-login).
- An access token, **encrypted at rest**, used only to verify repository ownership when you submit a plugin.

We never read repository contents beyond the public manifest you point us at.

## Cookies

A single session cookie (`auth`, HttpOnly) keeps you signed in. No tracking, no analytics by default — the operator can enable a self-hosted snippet via the admin panel if they want.

## Removal

Want your data deleted? Open an issue against this instance or contact the operator directly.
