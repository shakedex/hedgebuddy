# OffShoot Slack Notifier

Send formatted Slack notifications when OffShoot transfers complete.

**Trigger:** OffShoot "File Copy Completed"

---

## Variables

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `HB_OS_SLACK_WEBHOOK_URL` | URL | Yes | Slack Incoming Webhook URL |
| `HB_OS_SLACK_CHANNEL` | String | No | Override default channel (e.g. `#transfers`) |
| `HB_OS_NOTIFY_ON_FAILED_ONLY` | String | No | `"true"` to only alert on failures (default: `"false"`) |

## Setup

1. `pip install --user hedgebuddy requests`
2. Create a Slack webhook at <https://api.slack.com/messaging/webhooks>
3. Import `offshoot-slack-notifier-template.json` in the HedgeBuddy app (or add variables manually)
4. Paste your webhook URL into `HB_OS_SLACK_WEBHOOK_URL`
5. Add `offshoot-slack-notifier.py` to OffShoot's "File Copy Completed" event

## What It Does

1. Receives the OffShoot event payload
2. Skips successful transfers if `HB_OS_NOTIFY_ON_FAILED_ONLY` is `"true"`
3. Formats a Slack message with status, source, size, duration, destination, preset, and verification mode
4. Sends via the configured webhook

## Troubleshooting

- **"HB_OS_SLACK_WEBHOOK_URL not configured"** — Add the variable in the HedgeBuddy app.
- **"requests library not installed"** — Run `pip install --user requests`.
- **404 from Slack** — Webhook URL may be revoked. Regenerate it in Slack app settings.
- **No notifications** — Check OffShoot's automation log and verify the script is on the right event.

## Files

- `offshoot-slack-notifier.py` — Main script
- `offshoot-slack-notifier-template.json` — HedgeBuddy import template
