# Infrastructure

`/admin/infra` surfaces the runtime metadata Tabularium learned at boot:

- **Database** — dialect (sqlite / pg / mysql) and connection target.
- **Cache** — driver (memory / redis), Redis URL, key prefix.
- **Storage** — upload directory + total disk used.
- **Settings** — every row in the `settings` table, masked for encrypted entries.

You can edit individual settings rows here. This is the escape hatch for fields without a dedicated admin page (e.g. setting `analytics.umami_url` manually).

## Encryption

Settings whose value is sensitive are stored encrypted with `TOKEN_ENC_KEY` (AES-256-GCM, same key used for stored OAuth tokens). The list view masks them as `••••••••`; you can overwrite them but not read them back.

## Audit log

Every edit on this page lands in the audit log with action `setting.update` and the key name (the value is *not* logged).
