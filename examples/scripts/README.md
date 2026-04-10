# Example Scripts

Example Repository of automation scripts. Each includes a JSON import template for quick setup in the HedgeBuddy app.

## Scripts

| Script | Trigger | Description |
|--------|---------|-------------|
| [OffShoot Slack Notifier](offshoot-slack-notifier/) | File Copy Completed | Slack notifications on transfer completion |
| [OffShoot Sheets Logger](offshoot-sheets-logger/) | File Copy Completed | Log transfer details to Google Sheets |
| [FoolCat Report Mover](foolcat-pdf-mover/) | Report Created | Move/copy PDF camera reports to a destination folder |
| [Hedge Payload Inspector](hedge-payload-inspector/) | Any event | Capture event payloads as JSON for debugging |

## Setup Pattern

1. `pip install --user hedgebuddy` (plus any extra deps noted per script)
2. Open HedgeBuddy app, click **Import**, load the template `.json`
3. Fill in your values
4. Add the `.py` script to the corresponding event in OffShoot/FoolCat

Each script's folder has its own README with details.
