# TDO Links — Discord HQ & Supervisor Agent

**Data:** 2026-05-30  
**Status:** Aprovado para planejamento  
**Escopo:** Discord como vitrine publica de promocoes, area privada de operacao dos agentes e supervisor autonomo para falhas conhecidas.

## Contexto

O TDO Links ja publica ofertas no Telegram e possui pipeline com descoberta, validacao, creative, imagem e publicacao. Problemas recentes mostraram a necessidade de uma camada operacional que monitore o funil sem depender do Antonio acompanhar manualmente: duplicatas, longas janelas sem posts, falhas de imagem e recuperacao de ofertas prontas.

O Discord passa a ser parte do cockpit do negocio:

- area publica: usuarios entram para comprar promocoes;
- area privada: agentes reportam o que estao fazendo;
- supervisor: detecta e corrige falhas operacionais permitidas.

## Objetivos

- Configurar o Discord como servidor limpo de ofertas, sem chat publico na primeira fase.
- Criar canais privados para logs individuais dos agentes.
- Permitir que agentes enviem mensagens operacionais para seus canais.
- Criar um Supervisor Agent que monitora saude de publicacao e corrige problemas conhecidos sem permissao manual.
- Manter o dashboard web como painel visual, enquanto o Discord vira a sala operacional em tempo real.

## Fora de Escopo Nesta Fase

- Comunidade aberta com chat geral, pedidos de oferta ou suporte.
- Moderacao automatica de usuarios.
- Otimizacao agressiva de filtros de produto sem auditoria.
- Criacao de campanhas pagas ou agentes de trafego.
- Multi-usuario no dashboard web.

## Estrutura do Discord

### Area Publica

Usuarios comuns veem apenas a vitrine de compra:

```text
📌 INICIO
├─ boas-vindas
├─ como-funciona
└─ avisos

🔥 PROMOCOES
├─ ofertas-do-dia
├─ setup-gamer
├─ notebooks
├─ monitores
├─ tvs
├─ audio-headsets
├─ cadeiras-mesas
└─ expiradas
```

Regras:

- canais publicos sao somente leitura para usuarios comuns;
- apenas bot e administradores publicam;
- posts de oferta usam embed rico com titulo, preco anterior, preco atual, desconto, imagem e link;
- links de afiliado ficam nos posts publicos do Discord, assim como no Telegram.

### Area Privada

Somente Antonio e cargos administrativos veem a operacao:

```text
🔒 TDO OPS
├─ painel-executivo
├─ incidentes
├─ supervisor
├─ descoberta
├─ filtro
├─ copy
├─ imagem
├─ publicador
├─ growth
└─ relatorios
```

Regras:

- `@everyone` nao ve a categoria `TDO OPS`;
- agentes reportam nos seus canais especificos;
- problemas importantes tambem aparecem em `incidentes`;
- `painel-executivo` recebe resumos curtos de status e saude.

## Arquitetura

### 1. Discord Bot

Usar bot oficial do Discord, nao apenas webhook, porque a fase exige:

- criar categorias e canais;
- configurar permissoes;
- postar em multiplos canais;
- futuramente suportar comandos privados.

Novas variaveis de ambiente:

```env
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_ADMIN_ROLE_NAME=Admin TDO
DISCORD_SETUP_ENABLED=false
DISCORD_OPS_ENABLED=true
DISCORD_PUBLIC_DEALS_ENABLED=true
```

O webhook atual pode continuar existindo como fallback simples, mas o bot sera o caminho principal para operacao e publicacao segmentada.

### 2. Discord Admin Agent

Responsavel por configurar o servidor.

Funcoes:

- garantir cargo administrativo `Admin TDO`;
- criar categorias publicas e privadas;
- criar canais ausentes;
- aplicar permissoes;
- opcionalmente atualizar nomes e topicos dos canais;
- registrar um relatorio do setup em `TDO OPS / painel-executivo`.

Seguranca:

- roda somente quando `DISCORD_SETUP_ENABLED=true` ou via rota admin manual;
- nunca deleta canais automaticamente;
- nao altera canais fora da lista gerenciada;
- se um canal ja existir, reutiliza pelo nome.

### 3. Discord Ops Reporter

Modulo compartilhado para agentes enviarem eventos operacionais.

Interface proposta:

```js
await reportAgentEvent(db, config, {
  agent: "publisher",
  channel: "publicador",
  severity: "info",
  title: "Telegram publicado",
  message: "Oferta enviada com sucesso.",
  data: { offerId, messageId }
});
```

Mapeamento de agentes:

- `supervisor` -> `supervisor` e, se severo, `incidentes`;
- `discovery` -> `descoberta`;
- `validation/filter` -> `filtro`;
- `creative/copywriter` -> `copy`;
- `image` -> `imagem`;
- `publisher` -> `publicador`;
- `growth` -> `growth`.

Cada mensagem operacional deve ser curta, com dados essenciais e sem vazar tokens, chaves, secrets ou URLs internas sensiveis.

### 4. Discord Deals Publisher

Publica ofertas nos canais publicos corretos.

Roteamento por categoria:

- notebook -> `notebooks`;
- monitor -> `monitores`;
- TV -> `tvs`;
- headset, fone, caixa de som, soundbar -> `audio-headsets`;
- cadeira e mesa -> `cadeiras-mesas`;
- mouse, teclado, mousepad, setup gamer -> `setup-gamer`;
- toda oferta tambem pode ir para `ofertas-do-dia`.

Na primeira fase, publicar no canal de categoria e opcionalmente em `ofertas-do-dia` quando a oferta tiver score alto. Se isso gerar duplicidade visual, manter apenas o canal de categoria e um resumo diario em `ofertas-do-dia`.

Formato do embed:

- titulo com produto;
- imagem quadrada ou validada;
- preco anterior riscado;
- preco atual em destaque;
- desconto;
- 2 a 4 especificacoes relevantes;
- botao/link de compra;
- disclosure de afiliado.

### 5. Supervisor Agent

Roda no worker a cada 5 minutos.

Monitora:

- tempo desde o ultimo `publishLog` do Telegram com `ok:true`;
- tentativas sem confirmacao de sucesso;
- falhas recentes por canal;
- produtos `auto_ready` sem publicacao;
- duplicatas por ASIN, URL canonica e titulo normalizado;
- fila de creative/publish acumulada;
- intervalo minimo entre posts;
- discovery rodando com muitos ciclos `promotionEligible:0`;
- estado do Discord Ops Reporter.

Autocorrecoes permitidas:

- rodar recuperacao quando ha `auto_ready` parado e nenhum post recente;
- enfileirar no maximo 1 oferta por tick;
- rejeitar ou bloquear duplicatas obvias;
- liberar retry de falha de imagem depois do cooldown configurado;
- limpar jobs redundantes de publish/creative quando representarem a mesma oferta;
- pausar somente o canal problemático se houver falhas repetidas;
- registrar incidente resolvido quando o proximo `publishLog ok:true` aparecer.

Autocorrecoes proibidas:

- apagar historico de publish;
- alterar chaves, tokens ou afiliado;
- desligar Telegram/Discord/X definitivamente;
- afrouxar filtros de qualidade sem registrar incidente e sem limite;
- publicar produto sem promocao real;
- ignorar intervalo minimo entre posts.

## Fluxo de Dados

```text
Worker cron
  -> Supervisor Agent
    -> le db.state + filas BullMQ + publishLog
    -> cria/atualiza incidentes
    -> executa correcao segura quando permitido
    -> reporta no Discord privado

Pipeline de oferta
  -> discovery / validation / creative / publisher
    -> reportAgentEvent()
    -> canal privado do agente no Discord
    -> publishLog / offers / incidentes

Oferta aprovada
  -> Telegram Publisher
  -> Discord Deals Publisher
  -> publishLog confirma ok/falha por canal
```

## Persistencia

Adicionar em estado/DB uma colecao `incidents`:

```js
{
  id: "incident_...",
  type: "telegram_stale_window",
  severity: "warning",
  status: "open" | "resolved",
  title: "Janela longa sem posts",
  detail: "Sem publishLog ok:true no Telegram ha 2h.",
  action: "recovery_enqueued_one_offer",
  createdAt: "...",
  updatedAt: "...",
  resolvedAt: null,
  relatedOfferIds: [],
  metadata: {}
}
```

Manter ultimos eventos operacionais em `agentEvents` ou apenas no Discord inicialmente. A recomendacao e persistir incidentes e deixar eventos de baixo valor apenas no Discord/logs.

## Alertas

Severidades:

- `info`: operacao normal, canal privado do agente;
- `warning`: algo corrigido automaticamente, canal do agente + `painel-executivo`;
- `critical`: falha repetida ou publicacao parada sem correcao possivel, `incidentes` + `painel-executivo`.

Exemplo:

```text
Supervisor
Detectei 2h sem post OK no Telegram. Havia 3 ofertas auto_ready.
Acao: enfileirei 1 oferta para publicacao e mantive intervalo de 15min.
Status: monitorando confirmacao no publishLog.
```

## Rotas Admin

Adicionar rotas protegidas por `ADMIN_TOKEN`:

- `POST /api/discord/setup` — executa Discord Admin Agent.
- `POST /api/supervisor/run` — roda uma checagem manual.
- `GET /api/supervisor/incidents` — lista incidentes recentes.
- `POST /api/supervisor/incidents/:id/resolve` — resolve manualmente quando necessario.

O cron continua automatico no worker.

## Dashboard Web

Adicionar no dashboard:

- status do Discord bot;
- ultimo setup executado;
- incidentes abertos;
- ultimas autocorrecoes do supervisor;
- mapa simples de agentes e canais Discord.

Nao criar uma nova interface complexa nesta fase; o Discord sera o feed operacional principal.

## Testes

Testes unitarios:

- roteamento de categoria para canal Discord;
- criacao de payload de embed;
- mascaramento de dados sensiveis em eventos;
- deteccao de janela longa sem posts;
- deteccao de duplicatas;
- supervisor enfileira no maximo 1 oferta por tick;
- supervisor nao publica sem promocao real;
- incidentes abrem e resolvem corretamente.

Testes de integracao com mocks:

- Discord Admin Agent cria canais ausentes sem deletar existentes;
- Ops Reporter envia para canal correto;
- Supervisor detecta falha e reporta no canal privado;
- Deals Publisher registra resultado em `publishLog`.

Verificacao manual em producao:

- rodar setup em servidor Discord real;
- confirmar que usuario comum nao ve `TDO OPS`;
- confirmar que bot publica oferta em canal publico correto;
- confirmar que supervisor reporta incidente privado.

## Rollout

1. Implementar modelo de incidentes e supervisor sem agir, apenas detectando em teste.
2. Ativar autocorrecoes seguras: recovery, dedupe e fila.
3. Implementar Discord Ops Reporter.
4. Implementar Discord Admin Agent e executar setup manual uma vez.
5. Implementar Discord Deals Publisher por categoria.
6. Exibir status no dashboard.
7. Ativar `DISCORD_OPS_ENABLED=true` em producao.
8. Ativar `DISCORD_PUBLIC_DEALS_ENABLED=true` quando servidor estiver revisado.

## Criterios de Sucesso

- Antonio nao precisa vigiar manualmente se o bot parou.
- Duplicatas e janelas longas geram incidente e correcao automatica.
- Cada agente tem canal privado com logs claros.
- Usuarios veem apenas canais de compra, sem bastidores.
- Discord e Telegram recebem ofertas sem quebrar intervalo minimo.
- Toda correcao automatica deixa rastro auditavel.
