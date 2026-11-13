/** The notify channel credentials. `rh herdr notify install` writes them to notify.env; no hc child inherits them. */
export const NOTIFY_CHANNEL_SECRET_KEYS = [
  'WEBHOOK_URL', 'WEBHOOK_KEY', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
] as const;
export type NotifyChannelSecretKey = typeof NOTIFY_CHANNEL_SECRET_KEYS[number];

/** Every key that the hc transport removes from an hc child: the channel credentials and the Cloudflare credentials. */
export const NOTIFY_SECRET_KEYS = [...NOTIFY_CHANNEL_SECRET_KEYS, 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const;
