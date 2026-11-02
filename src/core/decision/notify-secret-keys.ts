/** The notify credentials. Only the notify install writes them, into the Herdr plugin config; no hc child inherits them. */
export const NOTIFY_SECRET_KEYS = [
  'WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
  'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN',
] as const;
