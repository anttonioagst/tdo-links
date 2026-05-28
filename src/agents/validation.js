import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

function buildValidationPrompt(offer) {
  const hasDiscount = offer.previousPrice && offer.previousPrice > offer.currentPrice;
  const discountLine = hasDiscount
    ? `Preço atual: R$ ${offer.currentPrice} | Era: R$ ${offer.previousPrice} (${offer.discountPercent}% off)`
    : `Preço atual: R$ ${offer.currentPrice ?? "N/A"} | Sem histórico de preço anterior`;

  return `Você é curador especialista em deals de tecnologia para o mercado brasileiro.

Produto: ${offer.title || "Desconhecido"}
${discountLine}
Avaliação: ${offer.rating ?? "N/A"}/5 (${offer.reviewCount ?? "N/A"} reviews)
Loja: ${offer.store || "Desconhecida"}

Avalie SE vale divulgar para seguidores de tecnologia:
1. É produto tech relevante? (SSD, mouse, teclado, monitor, headset, placa de vídeo, hub, cabo, etc.)
2. ${hasDiscount ? "O desconto é real? (preço anterior parece legítimo, não inflado)" : "O preço está competitivo para o Brasil? (compare com o mercado atual)"}
3. A avaliação/qualidade justifica recomendar? (4.0+ preferível)
4. É produto de marca reconhecida ou com reviews suficientes?

Critério: aprove se for tech genuíno com preço competitivo OU desconto real. Rejeite apenas se preço claramente acima do mercado, produto não-tech, ou marca/qualidade duvidosa.

Responda SOMENTE em JSON válido:
{"valid": true|false, "confidence": 0-100, "reason": "frase curta"}`;
}

function safeParseJson(text) {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function validateDeal(offer, config) {
  if (!config.anthropicApiKey) {
    console.log("agent_event", JSON.stringify({ agent: "validation", event: "skip_no_api_key" }));
    return { valid: true, confidence: 100, reason: "legacy_mode_no_api_key" };
  }

  console.log("agent_event", JSON.stringify({ agent: "validation", event: "start", title: offer.title }));

  try {
    const client = new Anthropic({ apiKey: config.anthropicApiKey });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 150,
      messages: [
        { role: "user", content: buildValidationPrompt(offer) }
      ]
    });

    const rawText = message.content?.[0]?.text || "";
    const parsed = safeParseJson(rawText);

    if (!parsed || typeof parsed.valid !== "boolean" || typeof parsed.confidence !== "number") {
      console.log("agent_event", JSON.stringify({ agent: "validation", event: "parse_error", raw: rawText.slice(0, 100) }));
      return { valid: false, confidence: 0, reason: "response_parse_error" };
    }

    const threshold = config.aiConfidenceThreshold ?? 70;
    const passes = parsed.valid === true && parsed.confidence > threshold;

    console.log("agent_event", JSON.stringify({
      agent: "validation",
      event: "done",
      title: offer.title,
      valid: parsed.valid,
      confidence: parsed.confidence,
      passes,
      reason: parsed.reason
    }));

    return {
      valid: parsed.valid,
      confidence: parsed.confidence,
      reason: parsed.reason || ""
    };
  } catch (err) {
    console.log("agent_event", JSON.stringify({ agent: "validation", event: "error", error: err.message }));
    return { valid: false, confidence: 0, reason: `validation_error: ${err.message}` };
  }
}
