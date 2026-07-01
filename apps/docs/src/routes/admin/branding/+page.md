---
title: "Branding"
---

# Branding

`/admin/branding` controls the public face of the registry:

| Field | Effect |
|-------|--------|
| Name | Document title + header logo text |
| Tagline | Hero subtitle on the default home page |
| Primary / Accent / Success | CSS variables overridden at runtime (`--brand-primary`, `--brand-accent`, `--brand-success`) |
| Logo URL | 32×32 image in the header |
| Favicon URL | Browser tab icon |
| Footer text | Optional replacement for the tagline in the footer |
| Analytics script | Raw HTML injected into `<head>` (Plausible, Umami, …) |
| Allow indexing | When off, injects `<meta name="robots" content="noindex,nofollow">` |

Branding is fetched on every app load (no SSR) and applied immediately. Cached client-side until refresh.

## Uploads

Logo and favicon can be uploaded directly — files land in `$DATA_DIR/uploads/` (disk driver, default) or in your configured S3 bucket. Switch storage drivers in `/admin/infra`.
