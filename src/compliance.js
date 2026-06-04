const blockedPatterns = [
  /\bgarantido\b/i,
  /\bmenor pre[c\u00e7]o da hist[o\u00f3]ria\b/i,
  /\bcompre agora ou perde\b/i,
  /\bultimas unidades\b/i,
  /\b\u00faltimas unidades\b/i,
  /\b100%\s*gr[a\u00e1]tis\b/i
];

export function validatePost(text, disclosure, offer = null) {
  const errors = [];
  const warnings = [];
  // Disclosure is surfaced at the channel level (Telegram bio / Discord topic),
  // so a missing inline disclosure is a warning, not a hard block.
  if (disclosure && !text.includes(disclosure)) warnings.push("missing_disclosure");
  if (!/R\$\s?\d/.test(text)) errors.push("missing_price");
  if (!/https?:\/\//.test(text)) errors.push("missing_link");
  for (const pattern of blockedPatterns) {
    if (pattern.test(text)) errors.push("blocked_claim");
  }
  if (offer?.store === "amazon" && /R\$\s?\d|%|\bOFF\b/i.test(text)) {
    warnings.push("amazon_dynamic_price_review");
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function validateXAcquisitionPost(text) {
  const errors = [];
  if (!/R\$\s?\d/.test(text)) errors.push("missing_price");
  if (!/https?:\/\//.test(text)) errors.push("missing_link");
  if (text.length > 280) errors.push("too_long_for_x");
  return { ok: errors.length === 0, errors };
}
