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
- An OAuth access token and, where the provider issues one, a refresh token — both **encrypted at rest** with the operator's `TOKEN_ENC_KEY`. The refresh token is used server-side to renew expired access tokens silently; the access token is only used to verify repository ownership when you submit or refresh a plugin.

We never read repository contents beyond the public `.tabularium` manifest (and the README it points at) for plugins you own.

## Admin audit log

Every admin mutation (provider toggles, plugin approval, signing-key rotation, page edits, …) is recorded in an internal audit log with the actor's user ID, IP address, and the target resource. The log is visible only to operators and is retained for the lifetime of the instance.

## Cookies

A single session cookie (`auth`, HttpOnly) keeps you signed in. No tracking, no analytics by default — the operator can enable a self-hosted snippet via the admin panel if they want.

## Removal

Want your data deleted? Open an issue against this instance or contact the operator directly. Plugin ownership can also be transferred to another account from your settings page before deletion.
