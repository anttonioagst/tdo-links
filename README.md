# Affiliate Deal Agents MVP

Sistema MVP em PT-BR para curadoria, scoring, copy, aprovacao/publicacao limitada e tracking de ofertas afiliadas tech.

## Rodar localmente

```powershell
Copy-Item .env.example .env
npm start
```

Abra `http://localhost:4318`.

## Testes

```powershell
npm test
```

## Railway

O projeto ja inclui `railway.json`. No Railway, configure:

- `HOST=0.0.0.0`
- `PUBLIC_BASE_URL=https://seu-dominio.up.railway.app`
- `DATA_FILE=/data/db.json` se usar volume persistente montado em `/data`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `TELEGRAM_DRY_RUN=false` quando quiser publicar de verdade
- `X_DRY_RUN=true` no MVP

O start command e `npm start` e o healthcheck e `/api/health`.

## Fluxo

- `POST /api/run/scrape`: coleta ofertas simuladas/controladas de Amazon BR e Mercado Livre.
- `POST /api/run/publish`: publica automaticamente drafts Telegram com score alto.
- `GET /go/{shortCode}`: registra clique e redireciona para o link afiliado.
- Dashboard: aprovar, rejeitar, editar drafts, pausar automacao e ver metricas.

Publicacao Telegram real exige `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `TELEGRAM_DRY_RUN=false`.
X fica em modo aquisicao/dry-run no MVP.
