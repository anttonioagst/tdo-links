import { buildAffiliateUrl } from "./links.js";

export function offerMatchesPreferences(offer, prefs) {
  if (!prefs) return true; // no prefs = receives everything

  const title = (offer.title || "").toLowerCase();
  const category = (offer.category || "").toLowerCase();
  const brand = (offer.store || offer.brand || "").toLowerCase();

  // Category filter — empty means all
  if (prefs.categories?.length) {
    const match = prefs.categories.some(c =>
      title.includes(c.toLowerCase()) || category.includes(c.toLowerCase())
    );
    if (!match) return false;
  }

  // Brand filter — empty means all
  if (prefs.brands?.length) {
    const match = prefs.brands.some(b => title.includes(b.toLowerCase()));
    if (!match) return false;
  }

  // Price ceiling
  if (prefs.maxPriceBrl && offer.currentPrice > prefs.maxPriceBrl) return false;

  // Discount floor
  const minDiscount = prefs.minDiscountPct || 15;
  if ((offer.discountPercent || 0) < minDiscount) return false;

  return true;
}

export async function publishPersonalized(db, config, offer, content) {
  if (!db.getSubscribedUsers) return; // JsonDb — no-op

  let users;
  try {
    users = await db.getSubscribedUsers();
  } catch (err) {
    console.log("personalized_fetch_error", JSON.stringify({ error: err.message }));
    return;
  }

  if (!users.length) return;

  const affiliateUrl = buildAffiliateUrl(offer, config, "telegram");
  const text = content?.copy?.telegram
    ? content.copy.telegram.replace(/https?:\/\/\S+/g, affiliateUrl)
    : null;

  let sent = 0;
  for (const user of users) {
    try {
      if (!offerMatchesPreferences(offer, user.preferences)) continue;
      if (await db.wasNotified(user.telegramUserId, offer.id)) continue;

      const msgText = text || `🔥 *${offer.title}*\n\nDe ~R$${offer.previousPrice}~ por *R$${offer.currentPrice}* (${offer.discountPercent}% OFF)\n\n🛒 ${affiliateUrl}`;
      await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: user.telegramChatId, text: msgText, parse_mode: "Markdown", disable_web_page_preview: false })
      });
      await db.logNotification(user.telegramUserId, offer.id);
      sent++;
    } catch (err) {
      console.log("personalized_send_error", JSON.stringify({ user: user.telegramUserId, error: err.message }));
    }
  }

  if (sent > 0) console.log("personalized_published", JSON.stringify({ offerId: offer.id, sent, total: users.length }));
}
