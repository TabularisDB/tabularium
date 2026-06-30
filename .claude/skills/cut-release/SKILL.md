---
name: cut-release
description: Use when shipping a new Tabularium version — bumping the version, tagging on Codeberg, and publishing a Forgejo release so CI builds and pushes the container image. Triggers: "cut a release", "new version", "tag vX.Y.Z", "publish release", "ship it".
---

# Cut a Tabularium Release

## Overview

A release is a `vX.Y.Z` tag + a Forgejo release on Codeberg. The
`docker-build` workflow triggers on `tags: v*` and `release: published`,
builds the image, and pushes `codeberg.org/tabularium/tabularium:X.Y.Z`
(plus `:latest` and `:<sha>`). The **git tag string drives the image tag**
— nothing else.

Deploying that image to k3s is a **separate** step — that's the private
`deploy-tabularium-k3s` skill, not this one.

## Pre-flight (do not skip)

From repo root, on `main`, with the work merged:

```fish
git rev-parse --abbrev-ref HEAD        # must be main
cd apps/api; bunx tsc --noEmit; bun test; cd ../..   # green or do not release
```

A broken `check.yml`/`test.yml` blocks the image build anyway. Fix first.

## Steps

1. **Pick the version** — semver `vX.Y.Z`. Check the last one:
   ```fish
   fj release list -R codeberg | head -5
   git tag --sort=-v:refname | head -5
   ```

2. **(Optional) sync the Helm appVersion** so the chart default matches the
   image you're cutting — only matters if you deploy without `--set image.tag`:
   ```
   deploy/helm/tabularium/Chart.yaml → appVersion: "X.Y.Z"  (and bump version: if templates changed)
   ```
   Commit it: `git commit -am "release: vX.Y.Z"`

3. **Push main** (the release tag is created at the server's main HEAD):
   ```fish
   git push codeberg main
   ```

4. **Create the tag + release** in one shot:
   ```fish
   fj release create vX.Y.Z -R codeberg --create-tag --body "…notes…"
   ```
   `--create-tag` makes the `vX.Y.Z` tag (defaults to the release name).
   This fires both the `tags: v*` and `release: published` triggers.

5. **Watch the build** until the image is pushed:
   ```fish
   fj run list -R codeberg | head        # or open Codeberg → Actions
   ```
   Success = `codeberg.org/tabularium/tabularium:X.Y.Z` exists in the registry.

## After this

Hand off to **deploy-tabularium-k3s** with the version `X.Y.Z` (no `v`).

## Common mistakes

| Mistake | Fix |
|---|---|
| Tag without `v` prefix | Workflow filters `tags: v*` — it won't fire. Always `vX.Y.Z`. |
| Tagging before pushing main | `--create-tag` tags server-side HEAD; push commits first. |
| Releasing with red CI | The image build won't run / will fail. Pre-flight green first. |
| Expecting deploy to happen | This skill only builds the image. Deploy is a separate skill. |
