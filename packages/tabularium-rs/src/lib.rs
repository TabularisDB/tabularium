//! Async Rust client for the [Tabularium](https://tabularium.wiki) plugin
//! registry HTTP API.
//!
//! The client is generated at build time by
//! [`progenitor`](https://docs.rs/progenitor) from the registry's published
//! OpenAPI 3.0 spec (`openapi.json`, shipped in this crate). Re-generation
//! happens automatically on every `cargo build`, so updating the spec snapshot
//! and re-publishing is the entire release loop.
//!
//! # Quickstart
//!
//! ```no_run
//! # use tabularium_sdk::Client;
//! # #[tokio::main]
//! # async fn main() -> Result<(), Box<dyn std::error::Error>> {
//! let client = Client::new("https://registry.spitzli.dev");
//! let plugins = client.list_plugins().send().await?;
//! for p in plugins.into_inner().plugins {
//!     println!("{} — {}", p.id, p.name);
//! }
//! # Ok(())
//! # }
//! ```

// Suppress lints inside the generated bindings — we don't control its style.
// `elided_named_lifetimes` was renamed to `mismatched_lifetime_syntaxes` in
// Rust 1.83; allowing both with `renamed_and_removed_lints` silenced keeps
// the crate warning-free across the toolchain versions used in CI.
#![allow(
    renamed_and_removed_lints,
    clippy::all,
    elided_lifetimes_in_paths,
    elided_named_lifetimes,
    mismatched_lifetime_syntaxes,
    rustdoc::all
)]

include!(concat!(env!("OUT_DIR"), "/codegen.rs"));
