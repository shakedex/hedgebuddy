# OffShoot Slack Notifier

Send beautifully formatted Slack notifications when OffShoot transfers complete. Get instant alerts on your phone or desktop!

---

## Overview

This script integrates with OffShoot's "File Copy Completed" event to send real-time Slack notifications about transfer status. Perfect for keeping production teams informed, alerting on failures, or tracking backup progress remotely.

**Key Features:**

- ✅ Instant Slack notifications for all transfers
- ✅ Beautiful formatted messages with status colors and emojis
- ✅ Auto-formatted file sizes and durations
- ✅ Optional "failures only" mode to reduce noise
- ✅ Configurable webhook and channel per production
- ✅ Cross-platform (Windows & macOS)

---

## Trigger Event

**OffShoot "File Copy Completed"**

Fires when OffShoot completes any transfer (success, failed, warnings, canceled, or stopped). The script checks the transfer state and sends appropriate notifications.

---

## Required HedgeBuddy Variables

- **`HB_OS_SLACK_WEBHOOK_URL`** (Type: URL)
  - Your Slack Incoming Webhook URL
  - Get from: <https://api.slack.com/messaging/webhooks>
  - Example: `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX`

---

## Optional HedgeBuddy Variables

- **`HB_OS_SLACK_CHANNEL`** (Type: String)

  - Override default Slack channel
  - Example: `#transfers`, `#dit-team`, or `#production-alerts`
  - Leave empty to use webhook's default channel

- **`HB_OS_NOTIFY_ON_FAILED_ONLY`** (Type: String)
  - Set to `"true"` to only notify on failures/warnings
  - Set to `"false"` (default) to notify on all transfers
  - Great for reducing notification noise on busy production days

---

## Setup Instructions

### 1. Install Dependencies

```bash
pip install --user hedgebuddy requests
```

### 2. Create Slack Webhook

1. Go to <https://api.slack.com/messaging/webhooks>
2. Click "Create New App" → "From scratch"
3. Give it a name (e.g., "OffShoot Notifier")
4. Choose your workspace
5. Enable "Incoming Webhooks"
6. Click "Add New Webhook to Workspace"
7. Choose the default channel
8. Copy the webhook URL

### 3. Configure Variables

**Option A - Import Template (Recommended):**

1. Open HedgeBuddy desktop app
2. Click "Import" button
3. Select `offshoot-slack-notifier-template.json`
4. Edit `HB_OS_SLACK_WEBHOOK_URL` and paste your webhook URL
5. (Optional) Set `HB_OS_SLACK_CHANNEL` to override channel
6. (Optional) Set `HB_OS_NOTIFY_ON_FAILED_ONLY` to `"true"` for failures only
7. Save

**Option B - Manual Setup:**

1. Open HedgeBuddy desktop app
2. Add required variable:
   - Name: `HB_OS_SLACK_WEBHOOK_URL`
   - Type: URL
   - Value: Your Slack webhook URL
   - Description: Slack webhook for transfer notifications
3. (Optional) Add `HB_OS_SLACK_CHANNEL`:
   - Name: `HB_OS_SLACK_CHANNEL`
   - Type: String
   - Value: Channel name (e.g., `#production-transfers`)
   - Description: Override default channel
4. (Optional) Add `HB_OS_NOTIFY_ON_FAILED_ONLY`:
   - Name: `HB_OS_NOTIFY_ON_FAILED_ONLY`
   - Type: String
   - Value: `false` or `true`
   - Description: Set to 'true' for failures/warnings only
5. Save

### 4. Add Script to OffShoot

1. Open OffShoot → Settings → Automation → Scripts
2. Add script to "File Copy Completed" event
3. Point to: `offshoot-slack-notifier.py`
4. Save

### 5. Test

1. Run a transfer in OffShoot
2. Check your Slack channel for notification
3. Verify transfer details are displayed correctly

---

## Example Configuration

```
Variable: HB_OS_SLACK_WEBHOOK_URL
Type: URL
Value: Slack webhook url
Description: Slack webhook for OffShoot transfer notifications

Variable: HB_OS_SLACK_CHANNEL
Type: String
Value: #production-transfers
Description: Send to specific channel (optional)

Variable: HB_OS_NOTIFY_ON_FAILED_ONLY
Type: String
Value: false
Description: Set to 'true' to reduce noise (only failures)
```

---

## What It Does

1. **Receives OffShoot event** with complete transfer details
2. **Checks transfer state** (Success, Failed, Warnings, etc.)
3. **Applies filtering** if `HB_OS_NOTIFY_ON_FAILED_ONLY` is enabled
4. **Formats message** with:
   - Status emoji (✅/❌/⚠️) and color
   - Source name, location, counter
   - Transfer size (auto-formatted to GB/MB/KB)
   - Duration (auto-formatted to hours/minutes/seconds)
   - Source and destination paths
   - Preset name and verification mode
5. **Sends to Slack** via configured webhook
6. **Logs success** or errors

---

## Message Format

Slack messages include:

**Title:** Transfer status with emoji

- ✅ Transfer Completed Successfully (green)
- ❌ Transfer Failed (red)
- ⚠️ Transfer Completed with Warnings (yellow)

**Fields:**

- Source: Camera name, location, counter
- Status: Success/Failed/Warnings
- Size: Formatted file size (e.g., "785.31 MB")
- Duration: Formatted time (e.g., "6.3s" or "2.5h")
- Source Path: Full source path
- Destination: Full destination path
- Preset: OffShoot preset name (if used)
- Verification: Verification mode used

**Footer:** "OffShoot Transfer via HedgeBuddy" with timestamp

---

## Use Cases

### All Transfers Notification

Track every transfer for complete visibility:

- `HB_OS_NOTIFY_ON_FAILED_ONLY`: `false`
- Get notified on every card offload, backup, or archive

### Failures Only (Quiet Mode)

Reduce notification noise, only alert on problems:

- `HB_OS_NOTIFY_ON_FAILED_ONLY`: `true`
- Great for busy production days with many transfers

### Multi-Channel Setup

Different channels for different productions:

- Production A: `HB_OS_SLACK_CHANNEL`: `#show-a-transfers`
- Production B: `HB_OS_SLACK_CHANNEL`: `#show-b-transfers`

### Remote Monitoring

Monitor transfers from anywhere:

- Enable Slack mobile notifications
- Get instant alerts when footage is safely backed up

---

## Change Productions?

**Just update variables in HedgeBuddy - no script editing needed!**

- New show? Update `HB_OS_SLACK_WEBHOOK_URL` or `HB_OS_SLACK_CHANNEL`
- Different notification preferences? Toggle `HB_OS_NOTIFY_ON_FAILED_ONLY`
- Multiple DITs? Each configures their own HedgeBuddy instance

This is the power of HedgeBuddy - portable automation across productions!

---

## Troubleshooting

**"HB_OS_SLACK_WEBHOOK_URL not configured"**

- Open HedgeBuddy app and add the webhook URL variable
- Make sure the name matches exactly: `HB_OS_SLACK_WEBHOOK_URL`

**"requests library not installed"**

- Run: `pip install --user requests`

**"Slack API returned status 404"**

- Verify webhook URL is correct and hasn't been revoked
- Check Slack app settings and regenerate webhook if needed

**No notifications appearing**

- Check OffShoot's automation log for errors
- Verify script is added to "File Copy Completed" event
- Test webhook URL with a simple curl command

**"Transfer successful, but HB_OS_NOTIFY_ON_FAILED_ONLY is enabled"**

- This is normal behavior - successful transfers are skipped in failures-only mode
- Set `HB_OS_NOTIFY_ON_FAILED_ONLY` to `false` to see all notifications

---

## Files in This Example

- `offshoot-slack-notifier.py` - Main script
- `offshoot-slack-notifier-template.json` - HedgeBuddy import template
- `README.md` - This documentation
