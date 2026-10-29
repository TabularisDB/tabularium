# Tabularis registry follow-ups

## Connection field presentation (Tabularis PR #629)

`connection-fields.json` is an **additive operator extension delta**, copied from the host manifest contract at Tabularis commit `d7cb7288a6c7fe6656491ca46ae70fa42924de6e`. It describes presentation metadata only, never credentials or secret values. It is not a new Tabularium core field.

Operator rollout:

1. Back up the current global manifest extensions and `driver` kind configuration.
2. Merge the delta into the existing global extensions. If `driver` has its own nonempty override, merge it there as well: kind overrides **replace**, rather than extend, the global delta. Never replace the complete configuration with this small fragment.
3. Preserve all existing required flags and unrelated driver metadata; do not modify or enable the `theme` kind.
4. Check `/manifest.schema.json?kind=driver`, then use `/api/manifest/validate` to test a complete driver manifest with `connection_fields`. Verify that manifests without the optional field still work and that unknown field names, oversized strings and invalid types are rejected.
5. Coordinate the supporting Tabularis runtime and the dependent BigQuery plugin release. Schema acceptance does not establish host/keychain compatibility. Do not publish the dependent plugin just because validation passes.
6. Roll back by restoring the original operator configurations if validation regresses.

The registry's strict authoring endpoint rejects unknown properties; lenient ingestion may strip them. Both are reasons to add the extension before depending on this metadata. Merely deploying this repository does **not** apply the operator delta.

## Download statistics (Tabularis PR #793)

The frontend follow-up shows compact locale-aware counts, exact accessible card labels, and distinct loading/empty/unavailable/populated states. It does not change counting APIs or perform tracked downloads. It can ship independently of theme-package support.

Keep the theme rollout gated: packaged platform acceptance, real runtime/tooling version assignments, old-client/profile protection, staged kind admission, and published author journeys are still separate requirements. Neither this operator delta nor the statistics UI enables themes.

## Declarative AI assistant providers

`ai-assistant-kind.json` is a complete operator kind preset for Tabularis. It
adds the manifest extension contract, a Runcrate example and an optional public
catalogue page. Packages contain data only; Tabularis owns HTTP, credentials,
proxies, templates and response parsing. ChatGPT account login remains built in.

Operator rollout:

1. Deploy the supporting Tabularium version with separate `id` and display
   `name` fields, and back up the current kind configuration.
2. Create the kind through authenticated `POST /api/admin/kinds` using the preset
   body, or copy it into the kind editor. For an existing kind, review the
   current configuration before applying `PUT /api/admin/kinds/ai-assistant`.
   Leave driver, theme and global extension settings intact.
3. Validate complete provider manifests using `/api/manifest/validate`, including
   the public Runcrate and Opper examples in the Tabularis repository. Confirm
   that missing required contract fields and executable extensions are rejected.
4. Publish each provider as a separate release with a universal ZIP and a
   standalone `.tabularium` manifest. Keep the existing IDs `openai`, `anthropic`,
   `ollama`, `openrouter`, `requesty`, `minimax`, and `custom-openai` so upgrade
   migration can retain configuration and credentials.
5. Publish all seven replacements before releasing the Tabularis change that
   removes their built-in adapters. Assign the actual first supporting runtime
   version; deploying this preset does not prove compatibility with old clients.

The preset is not applied automatically by deploying this repository. Registry
configuration and provider publication remain explicit rollout operations.
