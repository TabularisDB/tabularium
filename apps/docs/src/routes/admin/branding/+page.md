---
title: "Branding"
---

# Branding

`/admin/branding` controls the public face of the registry:

| Field | Effect |
|-------|--------|
| Name | Document title + header logo text |
| Theme | Visual preset for layout, palette and typography — `default` (Tabularium) or `tabularis` (matches tabularis.dev: navy surfaces, blue/teal accents, Urbanist, 1200px column, aurora hero). Both ship a light and a dark variant. |
| Tagline | Hero subtitle on the default home page |
| Primary / Accent / Success | CSS variables overridden at runtime (`--brand-primary`, `--brand-accent`, `--brand-success`). Primary drives buttons, links and focus rings; success drives success states; in the `tabularis` theme accent drives focus rings, selection and prose links. When unset, each theme falls back to its own palette. |
| Logo URL | Header / footer logo. With layout **Icon + name** it's a square mark beside the instance name; with **Horizontal logo** (`logoStyle: wordmark`) it's a wide logo shown alone, without the text |
| Logo for light mode | Optional `logoLightUrl`, swapped in on light backgrounds (e.g. a dark-text variant of a white wordmark). Upload via `POST /api/admin/branding/logo?variant=light` |
| Favicon URL | Browser tab icon |
| Footer text | Optional replacement for the tagline in the footer |
| Analytics script | Raw HTML injected into `<head>` (Plausible, Umami, …) |
| Allow indexing | When off, injects `<meta name="robots" content="noindex,nofollow">` |

Switching theme in the admin swaps any colour still on the previous theme's palette for the new theme's, and keeps colours you customised.

Branding is fetched on every app load (no SSR) and applied immediately. Cached client-side until refresh.

## Uploads

Logo and favicon can be uploaded directly — files land in `$DATA_DIR/uploads/` (disk driver, default) or in your configured S3 bucket. Switch storage drivers in `/admin/infra`.
