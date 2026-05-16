# Railway Infrastructure — TDO Links
**Data:** 2026-05-16  
**Status:** Aprovado  
**Escopo:** Fase 1 de 3 — Infraestrutura base (PostgreSQL + Redis + Worker service)

---

## Contexto

TDO Links é um agente de afiliados que coleta ofertas de tech/periféricos, gera imagens AI e publica no Telegram e Twitter. Atualmente usa `db.json` como banco e operações síncronas que travam o dashboard. Objetivo desta fase: base sólida para crescer ao nível de canais como SDM Links (265K+ inscritos).

---

## Arquitetura Railway

```
Railway Project: TDO LINKS
├── web        (Node.js — dashboard + API)
├── worker     (Node.js — jobs: scrape, imagegen, publish)
├── postgres   (Railway Plugin — PostgreSQL 16)
└── redis      (Railway Plugin — Redis 7)
```

- `web` e `worker` compartilham `DATABASE_URL` e `REDIS_URL` via Railway private networking
- `web` enfileira jobs e retorna imediatamente — nunca trava
- `worker` consome filas e processa em background
- Mesmo repositório, entry points diferentes: `node src/main.js` vs `node src/worker-main.js`

---

## Schema PostgreSQL (Drizzle ORM)

```sql
offers (
  id                   text primary key,
  store                text,
  source               text,
  asin                 text,
  title                text,
  current_price        numeric,
  previous_price       numeric,
  discount_percent     int,
  original_url         text,
  affiliate_url        text,
  affiliate_ready      boolean default false,
  image_url            text,
  image_urls           text[],
  generated_image_path text,
  generated_at         timestamptz,
  category             text,
  rating               numeric,
  review_count         int,
  in_stock             boolean default true,
  status               text,
  score                int,
  source_confidence    numeric,
  scraped_at           timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
)

drafts (
  id               text primary key,
  offer_id         text references offers(id) on delete cascade,
  channel          text,
  status           text,
  text             text,
  short_code       text unique,
  rejection_reason text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
)

clicks (
  id         text primary key,
  offer_id   text references offers(id) on delete cascade,
  short_code text,
  channel    text,
  timestamp  timestamptz default now(),
  user_agent text,
  country    text
)

publish_log (
  id         text primary key,
  draft_id   text,
  channel    text,
  result     jsonb,
  created_at timestamptz default now()
)

price_history (
  id          serial primary key,
  offer_id    text references offers(id) on delete cascade,
  price       numeric,
  recorded_at timestamptz default now()
)

settings (
  key   text primary key,
  value jsonb
)
```

---

## Filas BullMQ

### Queues
| Queue | Job payload | Concorrência | Retry |
|---|---|---|---|
| `scrape` | `{ trigger: "manual"\|"cron"\|"discovery" }` | 1 | 2x, backoff 60s |
| `imagegen` | `{ offerId }` | 2 | 3x, backoff 30s |
| `publish` | `{ draftId, channels: string[] }` | 1 | 2x, backoff 10s |

### Fluxo encadeado
```
scrapeQueue job → ofertas novas → imagegenQueue jobs
imagegenQueue job → oferta elegível → publishQueue job
publishQueue job → Telegram + Twitter em paralelo
```

### Arquivos novos
```
src/
├── queues/
│   ├── index.js      — conexão Redis, instâncias das queues
│   ├── producers.js  — enfileirar jobs (usado pelo web)
│   └── workers.js    — handlers (usado só pelo worker)
├── schema.js         — schema Drizzle
├── pg-db.js          — pool PostgreSQL, substitui db.js
└── worker-main.js    — entry point do worker service
```

---

## Migração

- Dados atuais descartados (db.json é mock/teste)
- Drizzle `migrate` roda na inicialização do `web` (`src/main.js`)
- `db.js` (JsonDb) removido após migração completa

---

## Cron

`discovery-scheduler.js` é removido. O serviço `worker` usa `node-cron` internamente:
- Schedule: `0 */2 * * *` (a cada 2 horas)
- Enfileira job na `scrapeQueue` com `trigger: "cron"`
- Roda dentro do processo do worker — sem serviço Railway extra necessário

---

## Variáveis de ambiente adicionadas

| Var | Serviço | Origem |
|---|---|---|
| `DATABASE_URL` | web + worker | Railway auto-inject (Postgres plugin) |
| `REDIS_URL` | web + worker | Railway auto-inject (Redis plugin) |

Todas as variáveis existentes (`TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, etc.) permanecem.

---

## O que NÃO muda

- Lógica de scraping (`scrapers.js`)
- Lógica de publicação (`publishers/telegram.js`, `publishers/twitter.js`)
- Lógica de imagegen (`imagegen.js`)
- Dashboard React (`client/`)
- Rotas da API (`server.js`) — apenas as chamadas ao `db` são substituídas

---

## Dependências adicionadas

```json
"drizzle-orm": "^0.41",
"drizzle-kit": "^0.30",
"pg": "^8.13",
"bullmq": "^5.x",
"ioredis": "^5.x",
"node-cron": "^3.x"
```
