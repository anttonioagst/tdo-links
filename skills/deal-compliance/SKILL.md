---
name: deal-compliance
description: Validate affiliate automation for disclosure, anti-spam behavior, and channel-specific constraints. Use when Codex needs to block risky affiliate posts, enforce Telegram/X publishing rules, or add compliance checks before automated posting.
---

# Deal Compliance

Use this skill before publishing or automating affiliate content.

## Required Checks

- Posts with affiliate links must include clear disclosure.
- Reject posts missing price, link, or product identity.
- Reject unsupported claims such as guaranteed profit, best historical price without data, fake urgency, or fake scarcity.
- Keep X MVP posts link-free unless the publishing policy changes.
- Rate-limit repeated products and repeated copy.

## Automation Policy

- `score >= 85`: eligible for automatic Telegram publishing if compliance passes.
- `70 <= score < 85`: requires human review.
- `score < 70`: archive.
- A global paused mode must block all publishing.

## Failure Handling

Log failed provider calls with channel, draft id, provider detail, and timestamp. Do not retry indefinitely.
