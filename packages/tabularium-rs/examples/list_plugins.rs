//! Minimal smoke test against a running Tabularium registry.
//!
//! ```
//! cargo run --example list_plugins -- https://registry.spitzli.dev
//! ```
//!
//! Falls back to https://registry.spitzli.dev when no URL is passed.

use tabularium_sdk::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "https://registry.spitzli.dev".to_string());
    let client = Client::new(&base);

    let page = client.list_plugins().send().await?;
    let body = page.into_inner();
    println!("{base}: {} plugins on this page", body.plugins.len());
    for p in body.plugins {
        let version = p.latest_version.as_deref().unwrap_or("—");
        println!("  {:<32} {:<10} {}", p.id, version, p.name);
    }
    Ok(())
}
