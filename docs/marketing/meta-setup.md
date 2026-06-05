# Setup Meta API — TDO Links

Guia para pegar as 5 credenciais necessárias. Faça na ordem.

---

## 1. META_PAGE_ID — ID da sua Página do Facebook

1. Abrir facebook.com → acessar a Página TDO Links
2. Clicar em **Sobre** → rolar até o fim
3. O número grande embaixo de "ID da Página" é o `META_PAGE_ID`

> Alternativa: URL da página → facebook.com/tdolinks → entrar em Configurações → ID da Página

---

## 2. META_IG_USER_ID — ID da conta Instagram Business

1. Abrir **Meta Business Suite** → business.facebook.com
2. Menu lateral → **Configurações** → **Contas** → **Contas do Instagram**
3. Clicar na conta @tdolinks → o ID aparece em "ID da conta do Instagram"

> Alternativa rápida: depois de ter o token (passo 4), rodar:
> `curl "https://graph.facebook.com/v19.0/me/accounts?access_token=SEU_TOKEN"`
> → pegar o `id` da página, depois:
> `curl "https://graph.facebook.com/v19.0/{page-id}?fields=instagram_business_account&access_token=SEU_TOKEN"`

---

## 3. META_AD_ACCOUNT_ID — ID da conta de anúncios

1. Abrir **Gerenciador de Anúncios** → business.facebook.com/adsmanager
2. URL da página vai conter o ID: `act_XXXXXXXXXX`
3. Ou: Configurações do Business → **Contas de Anúncios** → ID ao lado do nome

Formato: `act_123456789` (com o prefixo `act_`)

---

## 4. META_APP_ID e META_APP_SECRET — Criar o App Meta

1. Ir para **developers.facebook.com/apps**
2. Clicar em **Criar App**
3. Tipo: **Outros** → **Empresa**
4. Nome do app: `TDO Links Marketing` (pode ser qualquer nome)
5. Após criar: **Painel** → copiar **ID do App** (`META_APP_ID`) e **Segredo do App** (`META_APP_SECRET`)
6. Em **Produtos** → clicar em **+ Adicionar produto** → adicionar **Marketing API** e **Instagram Graph API**

---

## 5. META_ACCESS_TOKEN — Token de acesso longo

### Opção A (mais fácil — via Graph API Explorer)
1. Ir para **developers.facebook.com/tools/explorer**
2. Selecionar o app `TDO Links Marketing` criado acima
3. Clicar em **Gerar Token de Acesso**
4. Marcar TODAS estas permissões:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `pages_show_list`
   - `instagram_basic`
   - `instagram_content_publish`
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `publish_to_groups` (opcional)
5. Clicar em **Gerar Token** → autorizar
6. Copiar o token gerado (começa com `EAA...`)

### Trocar por token longo (dura 60 dias)
O token do Explorer dura apenas 1h. Para trocar por um longo:
```
curl "https://graph.facebook.com/v19.0/oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=SEU_META_APP_ID
  &client_secret=SEU_META_APP_SECRET
  &fb_exchange_token=TOKEN_CURTO_DO_EXPLORER"
```
→ Vai retornar um `access_token` que dura 60 dias.

### Trocar por Page Token (nunca expira)
```
curl "https://graph.facebook.com/v19.0/me/accounts?access_token=TOKEN_LONGO"
```
→ Vai listar suas páginas com um `access_token` por página. O token de página **nunca expira** — usar esse como `META_ACCESS_TOKEN`.

---

## Preencher no .env

```env
META_APP_ID=123456789
META_APP_SECRET=abcdef1234567890abcdef1234567890
META_ACCESS_TOKEN=EAAxxxxx...  (page token — nunca expira)
META_PAGE_ID=123456789012345
META_IG_USER_ID=17841400000000000
META_AD_ACCOUNT_ID=act_123456789
```

---

## Testar se está tudo certo

Após preencher o .env, rodar:
```bash
node src/scripts/meta-test.js
```

Vai verificar cada credencial e mostrar o que está funcionando.
