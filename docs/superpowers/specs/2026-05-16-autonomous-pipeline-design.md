# Pipeline Autônomo Multi-Agente — TDO Links
**Data:** 2026-05-16  
**Status:** Aprovado  
**Escopo:** Pipeline 100% autônomo + redesign dashboard (shadcn/ui em spec separado)

---

## Contexto

TDO Links evolui de "ferramenta com botões manuais" para sistema autônomo que busca, valida, cria conteúdo e publica sem intervenção humana. O dashboard vira painel de monitoramento/analytics. Stack já tem PostgreSQL, Redis, BullMQ, Telegram, Discord e X funcionando.

---

## Arquitetura — 4 Agentes BullMQ

```
Cron (a cada 2h)
      │
      ▼
[Discovery Agent]     Amazon scraper + RSS feeds
      │               1 job por deal candidato → validation_queue
      ▼
[Validation Agent]    Claude Haiku 4.5
      │               go/no-go + confidence 0-100
      │ valid + confidence ≥ 70
      ▼
[Creative Agent]      DALL-E 3 (imagem) + Claude Sonnet 4.6 (copy × 3 canais)
      │               em paralelo
      ▼
[Publisher Agent]     Telegram + Discord + X em paralelo
                      retry por canal independente
```

---

## Agente 1: Discovery

**Fontes:**
- Amazon scraper (existente, mantido)
- RSS Pelando.com.br (`https://www.pelando.com.br/rss`)
- RSS Zoom Ofertas (`https://www.zoom.com.br/rss/ofertas`)
- RSS Amazon Brasil Ofertas (feed nativo Amazon)

**Output por deal candidato:**
```js
{ title, currentPrice, previousPrice, discountPercent, category, imageUrl, imageUrls, originalUrl, asin, store, source }
```

**Deduplicação:** por ASIN (Amazon) ou URL canônica (RSS). Não enfileira deals já no DB.

**Arquivo:** `src/agents/discovery.js` (refatora `src/scrapers.js` + adiciona RSS parser)

---

## Agente 2: Validation

**Modelo:** `claude-haiku-4-5` — rápido, barato (~$0.001/validação)

**Prompt:**
```
Você é curador especialista em deals de tecnologia para o mercado brasileiro.

Produto: {title}
Preço atual: R$ {currentPrice} | Preço anterior: R$ {previousPrice} ({discountPercent}% off)
Avaliação: {rating}/5 ({reviewCount} reviews)
Loja: {store}

Avalie:
1. O desconto é real? (preço anterior parece legítimo, não inflado)
2. É tech/periférico? (mouse, teclado, SSD, monitor, headset, placa de vídeo, etc.)
3. O preço está competitivo para o Brasil?
4. A avaliação justifica recomendar?

Responda SOMENTE em JSON válido:
{"valid": true|false, "confidence": 0-100, "reason": "frase curta"}
```

**Threshold:** `valid: true` AND `confidence ≥ 70`

**Arquivo:** `src/agents/validation.js`

---

## Agente 3: Creative

**Executa em paralelo:**

### 3a — Imagem (DALL-E 3)
Reutiliza `src/imagegen.js` existente. Integrado ao fluxo automático — não requer clique.

### 3b — Copy (Claude Sonnet 4.6)

**Prompt:**
```
Você é copywriter do canal brasileiro de deals TDO Links.

Produto: {title}
Preço: R$ {currentPrice} (era R$ {previousPrice} — {discountPercent}% off)
Avaliação: {rating}/5
Análise do curador: "{reason}"
Categoria: {category}

Gere copy para 3 canais. JSON válido:
{
  "telegram": "emoji+título\n\nDe R$X por R$Y (-Z%)\n⭐ rating\n\n✅ benefício\n\n{LINK}\n\n#tech #deals",
  "discord": "**emoji título**\n~~R$X~~ → **R$Y** (-Z%)\n> benefício\n{LINK}",
  "x": "🔥 título curtíssimo — R$Y (-Z%)\n\nLink nos nossos canais:\n📱 t.me/[canal]\n💬 discord.gg/[invite]\n\n#tech #ofertas"
}
Regras:
- X: máximo 180 chars totais, sem link de afiliado, CTA duplo (Telegram + Discord)
- Telegram/Discord: {LINK} será substituído pelo link de afiliado real
- Emojis de categoria: 💻 tech, 🖱️ mouse, ⌨️ teclado, 🎧 audio, 📱 mobile, 💾 storage, 🖥️ monitor
```

**Arquivo:** `src/agents/creative.js`

---

## Agente 4: Publisher

**Input:**
```js
{ offerId, imagePath, copy: { telegram, discord, x }, affiliateUrl }
```

**Execução paralela por canal:**
- `Telegram` → `sendPhoto` com caption = `copy.telegram` (link substituído)
- `Discord` → webhook embed com imagem + `copy.discord` (link substituído)
- `X` → upload imagem + tweet com `copy.x` (sem link)

**Retry:** job reprocessado até 2×. Canais já publicados são detectados via `publish_log` e pulados no retry — evita duplicatas.

**Log:** registra em `publish_log` com canal, messageId, status

**Arquivo:** `src/agents/publisher.js`

---

## Queues BullMQ

| Queue | Concorrência | Retry | Arquivo |
|---|---|---|---|
| `discovery` | 1 | 2×, 60s | agents/discovery.js |
| `validation` | 3 | 2×, 30s | agents/validation.js |
| `creative` | 2 | 3×, 30s | agents/creative.js |
| `publish` | 1 | 2×, 10s | agents/publisher.js |

---

## RSS Parser

**Lib:** `rss-parser` (npm, leve, sem deps extras)

**Normalização de deal RSS → offer:**
```js
{ title, currentPrice, previousPrice, discountPercent, originalUrl, imageUrl, store: "pelando"|"zoom", source: "rss" }
```

Campos faltantes (ASIN, rating) ficam nulos — validation agent decide com base no que tem.

---

## Dashboard — Monitoramento Only

### Remove
- Todos os botões de ação: Buscar, Publicar, Aprovar, Rejeitar, Regenerar, Clonar, Gerar imagem, Salvar afiliado
- Aba de drafts com ações manuais

### Adiciona/Mantém
| Seção | Conteúdo |
|---|---|
| Status pipeline | Último job de cada agente + status (ok/erro/rodando) |
| Feed de publicações | Deals publicados, por canal, com message ID |
| Rejected log | Deals descartados pela AI + motivo (reason do Claude) |
| Métricas | Cliques/deal, taxa de aprovação AI, custo estimado |
| Configurações | Threshold confiança, canais ativos, intervalo cron |
| Botão único | "Forçar busca agora" — para debug/teste |

---

## Variáveis de ambiente adicionadas

| Var | Uso |
|---|---|
| `ANTHROPIC_API_KEY` | Validation + Creative agents via Anthropic SDK (usa `OPENAI_API_KEY` existente para DALL-E) |
| `AI_CONFIDENCE_THRESHOLD` | Threshold validation (default: 70) |
| `TELEGRAM_CHANNEL_URL` | CTA no X (ex: t.me/tdolinks) |
| `DISCORD_INVITE_URL` | CTA no X (ex: discord.gg/xxxxx) |
| `RSS_ENABLED` | Liga/desliga feeds RSS (default: true) |


---

## Dependências adicionadas

```json
"@anthropic-ai/sdk": "^0.39.0",
"rss-parser": "^3.13.0"
```

---

## O que NÃO muda

- `src/imagegen.js` — reutilizado pelo Creative Agent
- `src/publishers/telegram.js`, `discord.js`, `x.js` — reutilizados pelo Publisher Agent
- `src/pg-db.js` — sem alterações
- `src/queues/index.js` — adiciona 2 queues novas (validation, creative)
- Infra Railway (PostgreSQL, Redis, worker service)

---

## Redesign UI (spec separado)

Substituir componentes customizados por shadcn/ui. Implementar após pipeline autônomo estar estável em produção.
