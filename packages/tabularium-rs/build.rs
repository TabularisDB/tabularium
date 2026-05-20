use std::env;
use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

const HTTP_METHODS: &[&str] = &["get", "post", "put", "patch", "delete", "options", "head"];

/// Elysia ships some routes without a `responses` block (long-running webhooks,
/// auth redirects, file proxies). OpenAPI 3.0 requires `responses` on every
/// operation, so `openapiv3` rejects the raw spec. Patch in a default
/// "untyped response" entry where the upstream forgot one — this keeps the
/// crate building against the snapshot without forcing every Elysia route to
/// hand-author response schemas.
fn patch_missing_responses(spec: &mut Value) {
    let Some(paths) = spec.get_mut("paths").and_then(|v| v.as_object_mut()) else {
        return;
    };
    for (_, item) in paths.iter_mut() {
        let Some(ops) = item.as_object_mut() else {
            continue;
        };
        for (key, op) in ops.iter_mut() {
            if !HTTP_METHODS.contains(&key.to_ascii_lowercase().as_str()) {
                continue;
            }
            let Some(op_obj) = op.as_object_mut() else {
                continue;
            };
            if op_obj.contains_key("responses") {
                continue;
            }
            let mut default = Map::new();
            default.insert("description".into(), Value::String(String::new()));
            let mut responses = Map::new();
            responses.insert("default".into(), Value::Object(default));
            op_obj.insert("responses".into(), Value::Object(responses));
        }
    }
}

/// Elysia emits a malformed `content: { type: "null" }` for responses whose
/// body schema is `t.Null()` (typically 204 No Content). The OpenAPI 3.0
/// `content` map is keyed by MIME types — "type" is not a MIME — so the
/// `openapiv3` deserializer rejects the whole document. For each response /
/// request-body, drop any `content` object that contains no MIME-shaped
/// (slash-separated) keys: that's the upstream's way of saying "no body".
fn strip_non_mime_content(spec: &mut Value) {
    let Some(paths) = spec.get_mut("paths").and_then(|v| v.as_object_mut()) else {
        return;
    };
    for (_, item) in paths.iter_mut() {
        let Some(ops) = item.as_object_mut() else {
            continue;
        };
        for (key, op) in ops.iter_mut() {
            if !HTTP_METHODS.contains(&key.to_ascii_lowercase().as_str()) {
                continue;
            }
            let Some(op_obj) = op.as_object_mut() else {
                continue;
            };
            if let Some(rb) = op_obj.get_mut("requestBody") {
                drop_non_mime_content(rb);
            }
            if let Some(responses) = op_obj.get_mut("responses").and_then(|v| v.as_object_mut()) {
                for (_, resp) in responses.iter_mut() {
                    drop_non_mime_content(resp);
                }
            }
        }
    }
}

fn drop_non_mime_content(holder: &mut Value) {
    let Some(holder_obj) = holder.as_object_mut() else {
        return;
    };
    let drop_it = match holder_obj.get("content").and_then(|v| v.as_object()) {
        None => false,
        Some(content) => content.is_empty() || !content.keys().any(|k| k.contains('/')),
    };
    if drop_it {
        holder_obj.remove("content");
    }
}

/// Elysia emits `t.Nullable(X)` as `{ anyOf: [X, { type: "null" }] }` — that's
/// OpenAPI 3.1 idiomatic but the spec we serve advertises itself as 3.0.3.
/// progenitor's OpenAPI 3.0 schema lowering bails on `type: "null"`. Recursively
/// rewrite each such anyOf/oneOf into the OpenAPI 3.0 form: strip the null
/// branch, and if a single non-null schema remains, hoist it up to the parent
/// (preserving siblings like description / title) with `nullable: true`.
/// Elysia mirrors every request body as JSON + form-encoded + multipart so
/// browser form posts and JSON clients agree on the same handler. progenitor
/// only supports a single media type per body — when JSON is present, drop
/// the form duplicates so the generator sees one canonical content entry.
fn dedupe_request_content(spec: &mut Value) {
    let Some(paths) = spec.get_mut("paths").and_then(|v| v.as_object_mut()) else {
        return;
    };
    for (_, item) in paths.iter_mut() {
        let Some(ops) = item.as_object_mut() else {
            continue;
        };
        for (key, op) in ops.iter_mut() {
            if !HTTP_METHODS.contains(&key.to_ascii_lowercase().as_str()) {
                continue;
            }
            let Some(op_obj) = op.as_object_mut() else {
                continue;
            };
            if let Some(rb) = op_obj.get_mut("requestBody") {
                dedupe_content_to_json(rb);
            }
            if let Some(responses) = op_obj.get_mut("responses").and_then(|v| v.as_object_mut()) {
                for (_, resp) in responses.iter_mut() {
                    dedupe_content_to_json(resp);
                }
            }
        }
    }
}

fn dedupe_content_to_json(holder: &mut Value) {
    let Some(holder_obj) = holder.as_object_mut() else {
        return;
    };
    let Some(content) = holder_obj.get_mut("content").and_then(|v| v.as_object_mut()) else {
        return;
    };
    if content.contains_key("application/json") && content.len() > 1 {
        content.retain(|k, _| k == "application/json");
    }
}

fn collapse_nullable_anyof(node: &mut Value) {
    match node {
        Value::Object(map) => {
            for branch_key in ["anyOf", "oneOf"] {
                if let Some(arr) = map.get_mut(branch_key).and_then(|v| v.as_array_mut()) {
                    let mut had_null = false;
                    arr.retain(|item| {
                        let is_null_schema = item.as_object().is_some_and(|o| {
                            o.len() == 1 && o.get("type").and_then(|t| t.as_str()) == Some("null")
                        });
                        if is_null_schema {
                            had_null = true;
                            false
                        } else {
                            true
                        }
                    });
                    if had_null {
                        if arr.len() == 1 {
                            // Hoist the surviving branch into the parent, preserving siblings.
                            let lifted = arr.remove(0);
                            map.remove(branch_key);
                            if let Value::Object(lifted_obj) = lifted {
                                for (k, v) in lifted_obj {
                                    map.entry(k).or_insert(v);
                                }
                            }
                        }
                        map.insert("nullable".into(), Value::Bool(true));
                    }
                }
            }
            for (_, v) in map.iter_mut() {
                collapse_nullable_anyof(v);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                collapse_nullable_anyof(v);
            }
        }
        _ => {}
    }
}

fn main() {
    let spec_path = "openapi.json";
    println!("cargo:rerun-if-changed={}", spec_path);
    println!("cargo:rerun-if-changed=build.rs");

    let raw = fs::read_to_string(spec_path).expect("read openapi.json");
    let mut raw_value: Value = serde_json::from_str(&raw).expect("parse openapi.json as Value");
    patch_missing_responses(&mut raw_value);
    strip_non_mime_content(&mut raw_value);
    dedupe_request_content(&mut raw_value);
    collapse_nullable_anyof(&mut raw_value);

    let spec: openapiv3::OpenAPI =
        serde_json::from_value(raw_value).expect("parse patched openapi.json into OpenAPI");

    let mut settings = progenitor::GenerationSettings::default();
    settings.with_interface(progenitor::InterfaceStyle::Builder);
    let mut generator = progenitor::Generator::new(&settings);
    let tokens = generator
        .generate_tokens(&spec)
        .expect("generate client tokens");
    let ast: syn::File = syn::parse2(tokens).expect("parse generated tokens as a syn File");
    let content = prettyplease::unparse(&ast);

    let out_dir = env::var_os("OUT_DIR").expect("OUT_DIR not set");
    let out_path = Path::new(&out_dir).join("codegen.rs");
    fs::write(&out_path, content).expect("write codegen.rs");
}
