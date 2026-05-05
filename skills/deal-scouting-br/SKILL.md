---
name: deal-scouting-br
description: Find and evaluate Brazilian tech affiliate deals for Amazon Brasil, Mercado Livre, and similar marketplaces. Use when Codex needs to implement or tune deal scraping, source selection, deduplication, price validation, and offer-quality heuristics for PT-BR affiliate automation.
---

# Deal Scouting BR

Use this skill to collect Brazilian tech deals without turning the system into a spam scraper.

## Workflow

1. Prefer official APIs and feeds when credentials exist.
2. Use controlled scraping only with rate limits, cache, retries, and clear source allowlists.
3. Normalize every product into the project `Offer` shape before scoring.
4. Deduplicate by store plus canonical product URL.
5. Reject products with missing price, missing stock signal, suspicious seller data, or weak discount.

## Quality Signals

- Prioritize tech categories: SSD, peripherals, monitors, networking, smart home, accessories, notebooks.
- Prefer known marketplaces, high seller reputation, rating >= 4.4, and at least 50 reviews.
- Treat discounts below 10% as weak unless the item is unusually popular or low-ticket.
- Avoid claims like "menor preco historico" unless there is stored historical price data.

## Output

Return normalized offers with current price, previous price, discount percent, store, category, rating, review count, stock, original URL, and evidence fields where available.
