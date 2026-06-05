/**
 * meta-test.js — Verifica se as credenciais Meta estão corretas.
 * Uso: node src/scripts/meta-test.js
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { verifyCredentials } from "../publishers/meta.js";

console.log("🔍 Verificando credenciais Meta...\n");

const required = {
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  META_PAGE_ID: process.env.META_PAGE_ID,
  META_IG_USER_ID: process.env.META_IG_USER_ID,
  META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
};

let allOk = true;
for (const [key, val] of Object.entries(required)) {
  if (!val) {
    console.log(`❌ ${key} — NÃO CONFIGURADO`);
    allOk = false;
  } else {
    console.log(`✅ ${key} — ${val.slice(0, 12)}...`);
  }
}

if (!allOk) {
  console.log("\n⚠️  Preencha as variáveis faltando no .env e rode novamente.");
  console.log("   Guia: docs/marketing/meta-setup.md");
  process.exit(1);
}

console.log("\n🌐 Consultando a API Meta...\n");

try {
  const info = await verifyCredentials();
  console.log(`✅ Página Facebook:   ${info.page.name} (${info.page.id})`);
  console.log(`✅ Instagram:         @${info.instagram.username} (${info.instagram.id})`);
  console.log(`✅ Conta de anúncios: ${info.adAccount.name} — status ${info.adAccount.account_status === 1 ? "ATIVA" : info.adAccount.account_status} — ${info.adAccount.currency}`);
  console.log("\n🎉 Tudo certo! Pode rodar meta-publish-today.js");
} catch (err) {
  console.log(`\n❌ Erro: ${err.message}`);
  console.log("\nVerifique:");
  console.log("  - Se o token não expirou (use o Page Token permanente)");
  console.log("  - Se os IDs estão corretos");
  console.log("  - Se o app tem as permissões necessárias");
  process.exit(1);
}
