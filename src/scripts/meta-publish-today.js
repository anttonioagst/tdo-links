/**
 * meta-publish-today.js — Publica o post do dia no Instagram + Facebook.
 *
 * Uso:
 *   node src/scripts/meta-publish-today.js --date 05:06:2025
 *   node src/scripts/meta-publish-today.js          (usa a data de hoje)
 *
 * O que faz:
 *   1. Publica o carrossel no Instagram (orgânico)
 *   2. Publica no Facebook Page (orgânico)
 *   3. Publica o Story no Instagram (sem stickers — adicionar manualmente)
 *   4. (Opcional) Cria campanha de ads no Gerenciador (PAUSED — revisar antes de ativar)
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import {
  publishInstagramCarousel,
  publishInstagramStory,
  publishFacebookCarousel,
  createFullCampaign,
} from "../publishers/meta.js";

// ── Config ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith("--date="))?.split("=")[1]
  || args[args.indexOf("--date") + 1];

function todayFolder() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}:${mm}:${yyyy}`;
}

const folderDate = dateArg || todayFolder();
const POSTS_BASE = resolve(__dirname, "../../..", "Instagram/Posts", folderDate);

const CAROUSEL = [
  resolve(POSTS_BASE, "Capa.png"),
  resolve(POSTS_BASE, "Carrossel 2.png"),
  resolve(POSTS_BASE, "Carrossel 3.png"),
  resolve(POSTS_BASE, "Carrossel 4.png"),
].filter(p => existsSync(p));

const STORY = resolve(POSTS_BASE, "Story1.png");

// ── Copy ──────────────────────────────────────────────────────
const CAPTION_IG = `Fino assim. Poderoso assim.

O MacBook Air M4 não é um notebook que você usa.
É um notebook que você sente vontade de comprar só de olhar.

Chip M4 nativo. Tela Liquid Retina. Zero ventilador.
A gente garimpa. Você escolhe. 🔍

→ Link com oferta na bio`;

const CAPTION_FB = `MacBook Air M4 — o ultrabook que redefiniu o padrão. ✦

Chip M4. Tela Liquid Retina. Bateria de até 18h. Esse acabamento em Sky Blue que parece que saiu de uma campanha Apple de verdade.

Separamos a melhor oferta disponível agora na Amazon Brasil.

📌 Salva esse post — o preço muda.

🛒 Link nos comentários 👇`;

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (CAROUSEL.length === 0) {
    console.error(`❌ Nenhuma imagem encontrada em: ${POSTS_BASE}`);
    console.error(`   Verifique o caminho ou use --date=DD:MM:YYYY`);
    process.exit(1);
  }

  console.log(`📸 Publicando post do dia: ${folderDate}`);
  console.log(`   Slides encontrados: ${CAROUSEL.length}`);
  console.log(`   Story: ${existsSync(STORY) ? "✅" : "❌ não encontrado"}`);
  console.log("");

  // ── Instagram Carrossel ──
  console.log("1/3 Publicando carrossel no Instagram...");
  const igPost = await publishInstagramCarousel(CAROUSEL, CAPTION_IG);
  console.log(`   ✅ ${igPost.permalink}\n`);

  // ── Facebook Carrossel ──
  console.log("2/3 Publicando no Facebook...");
  const fbPost = await publishFacebookCarousel(CAROUSEL, CAPTION_FB);
  console.log(`   ✅ ${fbPost.permalink}\n`);

  // ── Instagram Story ──
  if (existsSync(STORY)) {
    console.log("3/3 Publicando Story no Instagram...");
    const story = await publishInstagramStory(STORY);
    console.log(`   ✅ Story publicado (id: ${story.id})`);
    console.log(`   ⚠️  Adicionar stickers de link manualmente no app:\n`);
    console.log(`      MacBook Air M4 → https://www.amazon.com.br/dp/B0DZL7JQY8?tag=tdolinks-20`);
    console.log(`      Anker Power Bank → https://www.amazon.com.br/dp/B0DCBB2YTR?tag=tdolinks-20`);
    console.log(`      JBL Partybox → https://www.amazon.com.br/dp/B0FBBTBWRH?tag=tdolinks-20`);
    console.log(`      JBL Soundbar → https://www.amazon.com.br/dp/B0FPRPMGXG?tag=tdolinks-20`);
    console.log(`      Samsung Odyssey G5 → https://www.amazon.com.br/dp/B0DWQK1Q8S?tag=tdolinks-20\n`);
  }

  console.log("🎉 Publicação orgânica concluída!");
  console.log("\n💡 Para criar a campanha paga (ads) rode:");
  console.log("   node src/scripts/meta-publish-today.js --ads");
}

async function mainWithAds() {
  await main();

  console.log("\n📢 Criando campanha de ads no Meta (status: PAUSED)...");

  await createFullCampaign({
    name: "MacBook Air M4 Jun26",
    carouselImages: CAROUSEL,
    storyImage: existsSync(STORY) ? STORY : null,
    copy: {
      tof: {
        primary: "Não somos uma loja. Somos curadoria.\n\nO MacBook Air M4 apareceu com 41% de desconto na Amazon. A gente viu. Testou. Achou bom. Trouxe pra você.",
        headline: "MacBook Air M4 — melhor oferta de junho",
        cta: "LEARN_MORE",
      },
      mof: {
        primary: "Todo dia a gente passa horas procurando as melhores ofertas de tech. Você não precisa fazer isso. Só entrar no grupo. MacBook Air M4, Razer, JBL, Samsung — sempre com link direto.",
        headline: "Entra na comunidade TDO Links",
        cta: "SUBSCRIBE",
      },
      bof: {
        primary: "MacBook Air M4 com 41% OFF na Amazon. Mais 4 ofertas hoje: Anker 37%, JBL 19%, Samsung Odyssey G5 21%. Link direto — sem cadastro.",
        headline: "5 ofertas de hoje — só via TDO Links",
        cta: "SHOP_NOW",
      },
    },
    urls: {
      tof: "https://instagram.com/tdolinks",
      mof: "https://t.me/tdolinks",
      bof: `https://www.amazon.com.br/dp/B0DZL7JQY8?tag=tdolinks-20&utm_source=meta&utm_medium=paid&utm_campaign=macbook-m4-jun26&utm_content=bof_story_macbook`,
    },
    budget: {
      tofDay: 2500, // R$ 25,00 em centavos
      mofDay: 1500, // R$ 15,00
      bofDay: 1000, // R$ 10,00
    },
    targeting: {
      ageMin: 22,
      ageMax: 45,
      country: "BR",
      interests: [],
    },
  });

  console.log("\n✅ Campanha criada no Gerenciador (PAUSADA).");
  console.log("   Revise, adicione os públicos e ative: https://business.facebook.com/adsmanager");
}

// Check flag
if (args.includes("--ads")) {
  mainWithAds().catch(err => { console.error(err.message); process.exit(1); });
} else {
  main().catch(err => { console.error(err.message); process.exit(1); });
}
