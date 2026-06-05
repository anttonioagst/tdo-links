# Playbook — Orquestração de Meta Ads (TDO Links)

Como o agente monta uma campanha de Facebook/Instagram Ads a partir dos criativos do Antonio.
Modelo de trabalho: **Antonio cria os criativos** (post produto + informativo + story) · **agente orquestra todo o resto** · objetivo sempre **trazer usuários** · entrega **automática + resumo**.

## Quando acionar
Antonio diz "campanha", "facebook ads", "meta ads", "anúncio", "impulsionar", "trazer usuários", ou entrega criativos novos pra rodar tráfego.

## Entradas necessárias
1. Criativos prontos (pastas em `~/Documents/Work/Projects/TDO LINKS/human-output/instagram/...`).
2. Produto/tema da campanha. 3. (Opcional) orçamento, praça, % desconto das ofertas.
> Se faltar orçamento/praça, assumir: Brasil, 18–44, R$50/dia, e declarar no resumo.

## Saída padrão (gerar em `~/Documents/Work/Projects/TDO LINKS/human-output/ads/<aaaa-mm-slug>/`)
- `CAMPANHA.md` — funil (TOF/MOF/BOF), objetivos, orçamento, KPIs, premissas.
- `copy-pack.md` — texto principal + título + descrição + CTA por anúncio (PT-BR).
- `publicos.md` — TOF frios (interesses), MOF retarget+LAL, BOF quente (Pixel).
- `utm-links.md` — links com UTM padronizado (preservar `tag=tdolinks-20` da Amazon).
- `import-setup.csv` — planilha de montagem (campanha/conjunto/anúncio/criativo/CTA/destino).

## Modelo de funil (default)
- **TOF 50%** — Engajamento/Tráfego · criativo = post de produto (shots) · público frio (interesses gaming/tech/ofertas) · CTA "Saiba mais" → IG/Telegram.
- **MOF 30%** — Tráfego · criativo = informativo + carrossel · retarget de engajamento 180d + LAL 1–3% · CTA "Participar do grupo" → Telegram.
- **BOF 20%** — Conversões (Pixel) · criativo = story de ofertas + cards · público quente (cliques/visitantes/membros) · CTA "Comprar" → afiliado c/ UTM.

## Regras de copy
Hook na 1ª linha · 1 ideia/anúncio · ≤2 emojis · CTA condizente com o estágio · **nunca** preço fixo no texto (expira). Tom: curadoria, "não somos loja".

## Rastreio
Meta Pixel (`META_PIXEL_ID` no config) → `PageView`, `ViewContent`, custom `JoinCommunity`, `OfferClick`. UTM: `utm_source=meta&utm_medium=paid&utm_campaign=<slug>&utm_content=<estagio_criativo>`.

## Links da marca
IG @tdolinks · Telegram t.me/tdolinks (bot @tdolinks_bot) · Discord (DISCORD_INVITE_URL) · afiliado `tag=tdolinks-20`.

## Evolução futura (quando o Antonio quiser)
- Ligar **Meta Marketing API** (App + token + ad account + página) p/ publicar direto pelo TDO.
- Puxar ofertas do dia do pipeline (Railway) p/ gerar criativos+campanha BOF automaticamente.
- Ler resultados (CTR/CPC/CPL) e auto-otimizar (pausar perdedores, escalar vencedores).
