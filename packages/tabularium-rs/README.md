# tabularium-sdk

[![crates.io](https://img.shields.io/crates/v/tabularium-sdk.svg)](https://crates.io/crates/tabularium-sdk)
[![docs.rs](https://docs.rs/tabularium-sdk/badge.svg)](https://docs.rs/tabularium-sdk)

Async Rust client for the [Tabularium](https://tabularium.wiki) plugin registry HTTP API.

The client is generated at build time by [`progenitor`](https://docs.rs/progenitor) from the registry's published OpenAPI 3.0 spec (`openapi.json`, shipped in this crate). Re-generation happens automatically on every `cargo build`, so updating the spec snapshot and re-publishing is the entire release loop.

## Install

```toml
[dependencies]
tabularium-sdk = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

## Quickstart

```rust
use tabularium_sdk::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new("https://registry.spitzli.dev");
    let page = client.list_plugins().send().await?;
    for p in page.into_inner().plugins {
        let v = p.latest_version.as_deref().unwrap_or("—");
        println!("{:<32} {:<10} {}", p.id, v, p.name);
    }
    Ok(())
}
```

See `examples/list_plugins.rs` for a runnable smoke test:

```
cargo run --example list_plugins -- https://registry.spitzli.dev
```

## What's available

Every public route in the registry's OpenAPI surface is a method on `Client`. A non-exhaustive sample:

- `list_plugins()`, `get_plugin(slug)`, `get_plugin_latest(slug)` — catalogue + asset resolution
- `submit_o_auth(...)` — submit a plugin via OAuth-verified ownership
- `list_plugin_requests(...)`, `upvote_plugin_request(...)`, `claim_plugin_request(...)` — request board
- `list_kinds()`, `get_kind(key)` — admin-defined taxonomy
- `get_branding()`, `get_features()`, `get_app_url_schemes()` — instance-level configuration
- `get_well_known_registry_key()` — registry JWKS for verifying signed release payloads
- … plus the full `/api/admin/...` surface for admin-token sessions

Auth is straightforward: the registry uses session cookies for browser flows, but every authenticated endpoint also accepts an `Authorization: Bearer <jwt>` header. Build a custom `reqwest::Client` with a default header and hand it to `Client::new_with_client(base_url, client)`.

## Regenerating against a different registry

The shipped `openapi.json` snapshot mirrors the upstream registry's `/openapi/json` at release time. To re-pin against your own instance:

```sh
curl -sf https://your-registry.example.com/openapi/json > packages/tabularium-rs/openapi.json
cargo build -p tabularium-sdk
```

`build.rs` patches a couple of known Elysia-side quirks before handing the spec to progenitor — see the comments in that file for context.

## Release

Bump the version in `Cargo.toml`, commit, tag `tabularium-rs-v<semver>`, and push. The `crates.io publish` workflow does the rest (validates the tag matches `Cargo.toml`, runs `cargo build` + `cargo test`, then `cargo publish`).

## License

Apache-2.0.
