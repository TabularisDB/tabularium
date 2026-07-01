# Users

Lists every user, their role (`user` or `admin`), linked identities, and plugin count.

## Role changes

Promote a user to admin from the user row. Demoting yourself is blocked — there must always be at least one admin.

## Linked identities

The detail panel shows every OAuth identity attached to the user (one per provider instance). Admins can unlink an identity (the user re-authorises on next login) but cannot view the encrypted token.

## Root credentials

Users with email/password fallback (the install-wizard admin, or accounts created via recovery sign-in) have a row in `root_credentials`. The admin UI can reset that password — the user receives a new temporary password printed in the audit log.
