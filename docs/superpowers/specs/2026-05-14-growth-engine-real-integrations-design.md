# TDO Links — Growth Engine & Real Integrations

**Data:** 2026-05-14  
**Status:** Aprovado para implementação  
**Abordagem:** Fase 1 (integrações reais) → Fase 2 (growth engine)

---

## Contexto

O TDO Links tem motor backend funcional, design system Premium Minimal e 5 views redesenhadas. Tudo em dry-run ou mock. Este spec define a evolução para um cockpit de afiliados de verdade: integrações reais (Telegram live, X live, Discord novo) + growth engine completo (revenue tracking, A/B testing, scheduling inteligente, autopilot, calendário editorial).

**Uso:** Pessoal. Sem multi-usuário, sem auth, sem landing page.  
**Canais ativos:** Telegram, X (Twitter), Discord.  
**Amazon:** Sem PA-API — melhoria do fluxo manual + feeds RSS (Pelando, Promobit).  
**Estética:** Premium Minimal já implementado — novos componentes seguem o mesmo sistema.

---

## Fase 1 — Integrações Reais

### 1.1 Telegram Real

**Objetivo:** Remover dry-run como padrão. Posts chegam de verdade no canal/grupo.

**Mudanças em `src/publishers/telegram.js`:**
- `TELEGRAM_DRY_RUN` default muda para `false` quando `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` estão definidos
- Formatação Markdown enriquecida:
  - Preço atual em **negrito**
  - Emoji de categoria (🖥️ SSD, 🎮 periférico, 💻 notebook, etc.) via mapa local em `src/publishers/telegram.js` — não importar de `client/src/ui/tokens.js` (client-side only)
  - Divulgação de afiliado sempre na última linha
  - Preview de desconto: `~~R$ 399~~ por R$ 249 (-38%)`
- Nenhuma mudança na interface com `agents.js` — retorna `{ success, messageId, error }`

**Config Control Room:** botão "Testar Telegram" já existe e funciona — sem mudança de UI.

---

### 1.2 X (Twitter) Real

**Objetivo:** Ativar publicação real via API v2 com rate limiting seguro.

**Mudanças em `src/publishers/x.js`:**
- `X_DRY_RUN` default muda para `false` quando credenciais (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`) estão definidas
- Rate limiting: máximo 3 posts por dia, mínimo 15 minutos entre posts — verificado contra `publishLog` antes de cada chamada
- Formato de post: lista top-3 deals do dia sem links diretos (links de afiliado só no Telegram/Discord)
  ```
  Top achados tech hoje 🔥
  1. SSD Kingston 1TB por R$ 249
  2. Headset HyperX Cloud por R$ 189
  3. Mouse Logitech G502 por R$ 129
  
  Links no canal 👉 t.me/[canal]
  ```
- Thread automática quando há mais de 3 deals no dia (segundo tweet com itens 4-6)
- Retorna `{ success, tweetId, error }`

**Variáveis de ambiente necessárias (documentar em `.env.example`):**
```
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
X_DRY_RUN=false
```

---

### 1.3 Discord (Novo Publisher)

**Objetivo:** Publicar deals em servidor Discord via webhook com embed rico.

**Novo arquivo `src/publishers/discord.js`:**
- Publica via `POST` para `DISCORD_WEBHOOK_URL` — sem dependências externas, fetch nativo
- Embed estruturado:
  ```json
  {
    "embeds": [{
      "title": "🏷️ {produto}",
      "description": "~~R$ {anterior}~~ → **R$ {atual}** (-{desconto}%)",
      "color": 5763719,
      "fields": [
        { "name": "⭐ Avaliação", "value": "{rating} ({reviews} avaliações)", "inline": true },
        { "name": "📦 Loja", "value": "{store}", "inline": true }
      ],
      "footer": { "text": "Link de afiliado: posso receber comissão pela compra." },
      "url": "{linkAfiliado}"
    }]
  }
  ```
- `DISCORD_DRY_RUN` default `false` quando `DISCORD_WEBHOOK_URL` definido
- Retorna `{ success, error }`

**Integração em `src/agents.js`:** `runPublishPipeline()` chama discord publisher em paralelo com telegram quando `discord.enabled === true`.

**Integração em `src/server.js`:** nova rota `POST /api/integrations/discord/test` — envia embed de teste.

**Config Control Room:** adiciona bloco Discord (webhook URL, toggle, botão testar) seguindo o padrão visual dos blocos Telegram e X existentes.

**Schema `integrations` em `db.js`:**
```js
discord: {
  webhookUrl: "",
  enabled: false,
  dryRun: false,
  lastTest: null,
  lastError: null
}
```

---

### 1.4 Amazon — Fluxo Manual Melhorado

**Objetivo:** Sem PA-API, melhorar qualidade e velocidade do fluxo manual de candidatos.

**Feed RSS de deals (novo: `src/scrapers.js`):**
- Adiciona parser para feed RSS do **Pelando** e **Promobit** — filtra por categoria tech. **Nota de implementação:** verificar URLs exatas dos feeds RSS no momento da implementação; usar `https://www.pelando.com.br/feed` como ponto de partida.
- Candidatos do RSS entram como `source: "pelando"` ou `source: "promobit"` no fluxo de descoberta existente
- Mesma normalização do `Offer` shape já existente
- Rate: máximo 1 requisição por fonte por ciclo de descoberta

**Validação de link Amazon melhorada (`src/validation.js`):**
- Verifica se URL contém domínio `amazon.com.br`
- Verifica presença de tag de afiliado (`tag=` no query string)
- Bloqueia candidato com mensagem clara: `"Link sem tag de afiliado — use o SiteStripe"`

**Histórico de preço manual (`src/db.js`):**
- Novo campo `priceHistory: {}` — mapa `offerId → [{ price, timestamp }]`
- Quando oferta é atualizada com novo preço, entrada anterior é salva automaticamente
- Exibido na view Ofertas: sparkline simples com os últimos 5 preços

---

## Fase 2 — Growth Engine

### 2.1 Revenue Tracking

**Objetivo:** Estimar receita de afiliado por produto e por mês.

**Novo arquivo `src/revenue.js`:**
```js
// Taxas de comissão Amazon por categoria (configurável)
const DEFAULT_RATES = {
  "SSD": 0.06, "notebook": 0.04, "periférico": 0.05,
  "headset": 0.05, "monitor": 0.04, "default": 0.04
};

// Estimativa: clicks × taxa de conversão (2%) × ticket médio × taxa de comissão
function estimateRevenue(offer, clicks) { ... }

// Agrega por produto, por canal, por mês
function revenueReport(offers, clicks, rates) { ... }
```

**Schema `revenue` em `db.js`:**
```js
revenue: {
  commissionRates: { ...DEFAULT_RATES },  // editável pelo usuário no Config
  history: []  // [{ offerId, month, clicks, estimatedRevenue }]
}
```

**Nova rota:** `GET /api/revenue` — retorna breakdown por produto e total do mês.

**Performance Home:** 4º metric tile muda de "publicados hoje" para "receita est. mês" com tooltip explicando que é estimativa. Novo panel abaixo dos tiles: ranking top-5 produtos por receita estimada.

---

### 2.2 A/B Testing

**Objetivo:** Testar 2 variantes de copy por draft e aprender o que converte melhor.

**Novo arquivo `src/ab-testing.js`:**
- `createVariants(offer)` — chama `copywriter.js` duas vezes com prompts diferentes:
  - Variante A: foco em **preço e desconto** ("SSD 1TB por R$ 249 — 38% off")
  - Variante B: foco em **benefício e uso** ("Upgrade de armazenamento: SSD Kingston 1TB")
- `recordClick(abTestId, variant)` — chamado em `/go/:shortCode` quando há teste ativo
- `detectWinner(abTest)` — após 48h e mínimo 20 clicks totais, declara vencedor por CTR
- `applyWinner(draftId, winner)` — atualiza o draft com o copy vencedor

**Schema `abTests` em `db.js`:**
```js
abTests: [{
  id, draftId, offerId, createdAt, resolvedAt, winner,
  variantA: { copy, shortCode, clicks, ctr },
  variantB: { copy, shortCode, clicks, ctr }
}]
```

**Integração com pipeline:** `runPublishPipeline()` verifica se draft tem teste A/B — se sim, publica variante A no Telegram e variante B no Discord (canais diferentes = audiências diferentes = resultados independentes).

**View Inteligência:** novo painel "A/B Ativos" mostra testes em andamento. "A/B Resolvidos" mostra histórico com vencedores. Ambos seguem o layout de cards existente na view.

**Nova rota:** `POST /api/ab-test/:draftId` — cria variantes para um draft existente.

---

### 2.3 Scheduling & Peak Hours

**Objetivo:** Detectar o melhor horário para postar em cada canal e criar fila de agendamento.

**Novo arquivo `src/scheduler.js`:**
- `detectPeakHours(channel)` — analisa `clicks` do `db.js` agrupados por hora do dia, retorna top-3 horas com mais clicks para o canal
- `suggestNextSlot(channel)` — retorna próximo slot disponível no horário de pico que ainda não tem post agendado e não excede `maxPostsPerDay`
- `processQueue()` — executado pelo scheduler existente a cada 15min: verifica queue, publica posts cujo `scheduledFor <= now`

**Schema `schedule` em `db.js`:**
```js
schedule: {
  queue: [{
    id, draftId, channel, scheduledFor, status,  // status: pending | published | cancelled
    createdAt
  }],
  peakHours: {
    telegram: [],   // [19, 20, 12] — aprendido dos clicks
    discord:  [],
    x:        []
  }
}
```

**Integração com `main.js`:** `processQueue()` adicionado ao intervalo do scheduler existente.

**Nova rota:** `POST /api/schedule/:draftId` — body `{ channel, scheduledFor? }`. Se `scheduledFor` omitido, usa `suggestNextSlot()`.

**View Operação:** cada draft na fila ganha botão "Agendar" além de "Aprovar". Ao agendar, mostra o horário sugerido com opção de editar.

---

### 2.4 Autopilot Rules Engine

**Objetivo:** Motor de regras configurável que opera sem intervenção manual.

**Novo arquivo `src/autopilot.js`:**
```js
async function runAutopilot(db) {
  const rules = db.state.autopilot;
  if (!rules.enabled) return;

  // Regra 1: auto-aprovar drafts com score alto
  for (const draft of pendingDrafts) {
    if (draft.score >= rules.autoApproveScore) {
      await approveDraft(draft.id);
      await scheduleDraft(draft.id, suggestNextSlot());
    }
  }

  // Regra 2: não exceder maxPostsPerDay
  // Regra 3: repost de top performers
  for (const published of publishedLast7Days) {
    const ctr = calculateCtr(published);
    const age = hoursAgo(published.publishedAt);
    if (ctr >= rules.repostCtrThreshold && age >= rules.repostDelayHours) {
      await createRepost(published);
    }
  }
}
```

**Schema `autopilot` em `db.js`:**
```js
autopilot: {
  enabled: false,
  autoApproveScore: 85,        // score mínimo para auto-aprovação
  maxPostsPerDay: 3,           // limite diário total
  repostCtrThreshold: 5,       // CTR % mínimo para repost automático
  repostDelayHours: 48,        // horas mínimas antes de repostar
  preferredChannels: ["telegram", "discord"]
}
```

**Nova rota:** `POST /api/autopilot/settings` — salva regras.

**Config Control Room:** nova seção "Autopilot" com toggles e sliders para cada regra. Toggle master on/off com indicador visual de estado (● ATIVO / ○ PAUSADO).

**Integração com `main.js`:** `runAutopilot()` executado a cada 30 minutos.

---

### 2.5 Calendário Editorial (Nova View)

**Objetivo:** Visualização semanal de posts publicados, agendados e reposts automáticos.

**Nova view no `client/src/App.jsx`:** `"calendar"` adicionada ao `commandItems` em `tokens.js`.

**Componente `CalendarGrid` em `client/src/ui/components.jsx`:**
- Grid 7 colunas (Seg → Dom), 4 semanas visíveis
- Cada dia mostra chips coloridos:
  - 🟢 Verde: post publicado (clicável → abre draft)
  - 🟣 Roxo: agendado (clicável → opção de cancelar)
  - 🟡 Âmbar: repost automático pendente
- Navegação por semana (← →)
- Sem drag-and-drop na primeira versão

**Painel lateral:** ao clicar em um dia, lista os drafts daquele dia com ações rápidas (aprovar agendamento, cancelar, ver copy).

**Rota existente reutilizada:** `/api/state` já retorna `publishLog` e `schedule.queue` — sem nova rota necessária.

---

## Estrutura de Arquivos

### Arquivos novos
```
src/publishers/discord.js
src/revenue.js
src/ab-testing.js
src/scheduler.js
src/autopilot.js
```

### Arquivos modificados
```
src/publishers/telegram.js   — remove dry-run default, Markdown enriquecido
src/publishers/x.js          — ativa API v2, rate limiting
src/scrapers.js              — parser RSS Pelando/Promobit
src/validation.js            — validação de link Amazon + tag afiliado
src/agents.js                — integra discord, ab-testing, autopilot no pipeline
src/server.js                — rotas novas (schedule, ab-test, revenue, autopilot, discord/test)
src/main.js                  — registra scheduler.processQueue e autopilot.runAutopilot
src/db.js                    — schema estendido (revenue, abTests, schedule, autopilot, priceHistory)
client/src/ui/tokens.js      — adiciona "calendar" em commandItems, emoji map de categorias
client/src/ui/components.jsx — CalendarGrid, RevenuePanel, ABPanel
client/src/App.jsx           — nova view calendar, Discord no Config, revenue no Performance
test/run-tests.js            — testes para revenue.js, ab-testing.js, scheduler.js, discord.js
.env.example                 — variáveis X e Discord documentadas
```

---

## Testes

Cada módulo novo tem testes unitários em `test/run-tests.js`:

- `revenue.js`: estimativa correta por categoria, agregação mensal, taxas customizadas
- `ab-testing.js`: criação de variantes, detecção de vencedor, empate (sem vencedor abaixo de 20 clicks)
- `scheduler.js`: detecção de peak hours, suggestNextSlot respeita maxPostsPerDay, processQueue publica no horário certo
- `discord.js`: formato do embed, dry-run não envia, retorno de erro em webhook inválido
- `autopilot.js`: auto-aprovação por score, repost por CTR, respeito ao limite diário

Comandos de validação por fase:
```bash
node test/run-tests.js   # após cada módulo
npm run build            # após cada mudança de UI
```

---

## Variáveis de Ambiente Novas

```bash
# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
DISCORD_DRY_RUN=false

# X (Twitter) — já existia, documentar melhor
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
X_DRY_RUN=false
```
