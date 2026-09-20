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
