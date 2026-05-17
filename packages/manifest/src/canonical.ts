/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 *
 * Produces a deterministic, byte-stable string for a JSON-compatible value:
 *   - Object keys sorted in UTF-16 code-unit order (the order JavaScript
 *     strings compare in natively).
 *   - No insignificant whitespace.
 *   - Numbers serialised via ECMAScript 262 §7.1.12.1 (Number::toString).
 *     `JSON.stringify` of finite numbers already matches this — including the
 *     `1e+21` cutoff and lowercase exponent letter.
 *   - Strings escaped per JSON / RFC 8785: control chars below U+0020 use the
 *     short forms (`\b \t \n \f \r`) where defined, otherwise `\u00XX`;
 *     `"` and `\` are escaped; everything else is emitted verbatim (UTF-8).
 *   - NaN, Infinity, -Infinity, undefined, functions, symbols, and bigints
 *     are not representable in JSON and throw.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";

  if (t === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new TypeError(
        `canonicalize: ${n} is not a finite number and cannot be serialised`,
      );
    }
    // ECMAScript Number::toString — matches RFC 8785 for finite doubles.
    // Normalise -0 to "0" (JSON.stringify already does this; be explicit).
    if (Object.is(n, -0)) return "0";
    return JSON.stringify(n);
  }

  if (t === "string") return serializeString(value as string);

  if (t === "bigint") {
    throw new TypeError("canonicalize: bigint is not representable in JSON");
  }

  if (t === "undefined") {
    throw new TypeError("canonicalize: undefined is not representable in JSON");
  }

  if (t === "function" || t === "symbol") {
    throw new TypeError(`canonicalize: ${t} is not representable in JSON`);
  }

  if (Array.isArray(value)) {
    const parts: string[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const elt = value[i];
      // JSON arrays serialise undefined/functions/symbols as null in JSON.stringify,
      // but JCS does not permit those values. Be strict.
      parts[i] = serialize(elt);
    }
    return `[${parts.join(",")}]`;
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>;
    // Sort own enumerable string keys in UTF-16 code-unit order.
    // Default String comparison in JS is UTF-16 code-unit order.
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) {
        // JSON.stringify drops `undefined` properties; JCS is stricter — but
        // mirroring `JSON.stringify` here is the most predictable behaviour.
        continue;
      }
      parts.push(`${serializeString(k)}:${serialize(v)}`);
    }
    return `{${parts.join(",")}}`;
  }

  throw new TypeError(`canonicalize: unsupported value of type ${t}`);
}

function serializeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x22: // "
        out += '\\"';
        break;
      case 0x5c: // \
        out += "\\\\";
        break;
      case 0x08: // \b
        out += "\\b";
        break;
      case 0x09: // \t
        out += "\\t";
        break;
      case 0x0a: // \n
        out += "\\n";
        break;
      case 0x0c: // \f
        out += "\\f";
        break;
      case 0x0d: // \r
        out += "\\r";
        break;
      default:
        if (c < 0x20) {
          out += "\\u" + c.toString(16).padStart(4, "0");
        } else {
          out += s[i];
        }
    }
  }
  out += '"';
  return out;
}
