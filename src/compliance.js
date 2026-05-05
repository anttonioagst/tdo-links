const blockedPatterns = [
  /\bgarantido\b/i,
  /\bmenor pre[cç]o da hist[oó]ria\b/i,
  /\bcompre agora ou perde\b/i,
  /\b100%\s*gr[aá]tis\b/i
];

export function validatePost(text, disclosure) {
  const errors = [];
  if (!text.includes(disclosure)) errors.push("missing_disclosure");
  if (!/R\$\s?\d/.test(text)) errors.push("missing_price");
  if (!/https?:\/\//.test(text)) errors.push("missing_link");
  for (const pattern of blockedPatterns) {
    if (pattern.test(text)) errors.push("blocked_claim");
  }
  return { ok: errors.length === 0, errors };
}

export function validateXAcquisitionPost(text) {
  const errors = [];
  if (!/R\$\s?\d/.test(text)) errors.push("missing_price");
  if (!/https?:\/\//.test(text)) errors.push("missing_link");
  if (text.length > 280) errors.push("too_long_for_x");
  return { ok: errors.length === 0, errors };
}
