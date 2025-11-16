"""
HedgeBuddy Demo - Real-World OffShoot Automation
=================================================

This script simulates a real-world DIT workflow: automating OffShoot transfers
with Slack notifications, cloud uploads, and transfer logging.

This demonstrates how HedgeBuddy makes OffShoot automation scripts portable
across different productions - just update variables in the GUI!

Required variables (add via HedgeBuddy app):
- HB_OS_SLACK_WEBHOOK_URL: Slack webhook for transfer notifications
- HB_TRANSFER_LOG_PATH: Where to save transfer logs (e.g., D:\\Logs\\Transfers)

Optional variables:
- HB_S3_BUCKET: AWS S3 bucket for cloud backup
- HB_S3_ACCESS_KEY: S3 access key
- HB_PRODUCTION_FOLDER: Path for production department files
- HB_NOTIFY_ON_FAILED_ONLY: Set to "true" to only notify on failures (default: "false")
"""

import json
from datetime import datetime
from pathlib import Path
import hedgebuddy


def parse_offshoot_event(event_json):
    """Parse OffShoot File Copy Completed event payload."""
    payload = json.loads(event_json)
    return {
        'source': payload.get('FileCopyCompleted_sourcePaths', 'Unknown'),
        'destination': payload.get('FileCopyCompleted_destinationPath', 'Unknown'),
        'size_bytes': payload.get('FileCopyCompleted_bytesCopied', 0),
        'duration': payload.get('FileCopyCompleted_duration', '0'),
        'state': payload.get('FileCopyCompleted_state', 'Unknown'),
        'preset': payload.get('FileCopyCompleted_presetName', 'N/A'),
    }


def format_bytes(bytes_value):
    """Convert bytes to human-readable format."""
    try:
        bytes_value = int(bytes_value)
    except (ValueError, TypeError):
        return "0 B"
    
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024.0:
            return f"{bytes_value:.2f} {unit}"
        bytes_value /= 1024.0
    return f"{bytes_value:.2f} PB"


def send_slack_notification(transfer_info):
    """Send Slack notification about transfer completion."""
    webhook_url = hedgebuddy.var("HB_OS_SLACK_WEBHOOK_URL")
    
    # Check if we should only notify on failures
    notify_failed_only = hedgebuddy.var("HB_NOTIFY_ON_FAILED_ONLY", "false").lower() == "true"
    
    if notify_failed_only and transfer_info['state'] == "Success":
        print("   ℹ Transfer successful, skipping notification (failures-only mode)")
        return
    
    # Format message
    size = format_bytes(transfer_info['size_bytes'])
    status_emoji = "✅" if transfer_info['state'] == "Success" else "❌"
    
    print(f"   {status_emoji} Would send Slack notification:")
    print(f"      Webhook: {webhook_url[:50]}...")
    print(f"      Status: {transfer_info['state']}")
    print(f"      Size: {size}")
    print(f"      Duration: {transfer_info['duration']}s")
    print(f"   ℹ (Simulated - in production, use requests.post)")


def upload_to_s3(transfer_info):
    """Upload footage to S3 if configured."""
    if not hedgebuddy.exists("HB_S3_BUCKET"):
        return False
    
    bucket = hedgebuddy.var("HB_S3_BUCKET")
    access_key = hedgebuddy.var("HB_S3_ACCESS_KEY")
    
    print(f"   ✓ Would upload to S3:")
    print(f"      Bucket: {bucket}")
    print(f"      Source: {transfer_info['source']}")
    print(f"      Access Key: {access_key[:10]}...")
    print(f"   ℹ (Simulated - in production, use boto3)")
    
    return True


def log_transfer(transfer_info):
    """Log transfer details to local file."""
    log_path = Path(hedgebuddy.var("HB_TRANSFER_LOG_PATH"))
    log_path.mkdir(parents=True, exist_ok=True)
    
    # Create daily log file
    log_file = log_path / f"transfers_{datetime.now().strftime('%Y%m%d')}.txt"
    
    # Format log entry
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    size = format_bytes(transfer_info['size_bytes'])
    log_entry = (
        f"[{timestamp}] {transfer_info['state']} | "
        f"{transfer_info['source']} → {transfer_info['destination']} | "
        f"{size} in {transfer_info['duration']}s | "
        f"Preset: {transfer_info['preset']}\n"
    )
    
    # Append to log
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(log_entry)
    
    print(f"   ✓ Transfer logged to: {log_file}")


def move_production_files(transfer_info):
    """Move camera reports to production folder if configured."""
    if not hedgebuddy.exists("HB_PRODUCTION_FOLDER"):
        return False
    
    prod_folder = hedgebuddy.var("HB_PRODUCTION_FOLDER")
    
    print(f"   ✓ Would move camera reports to: {prod_folder}")
    print(f"   ℹ (Simulated - in production, use shutil.move)")
    
    return True


def main():
    print("=" * 70)
    print("HedgeBuddy Demo - OffShoot Transfer Automation")
    print("=" * 70)
    print()
    
    # Simulate OffShoot File Copy Completed event
    # (In production, this would come from OffShoot as sys.argv[1])
    event_json = '''{
        "FileCopyCompleted_sourcePaths": "/Volumes/CARD_A001",
        "FileCopyCompleted_destinationPath": "D:\\\\Production\\\\CAM_A\\\\A001",
        "FileCopyCompleted_bytesCopied": 52428800,
        "FileCopyCompleted_duration": "5.2",
        "FileCopyCompleted_state": "Success",
        "FileCopyCompleted_presetName": "Production A"
    }'''
    
    # Parse transfer info
    print("Step 1: Parsing OffShoot event...")
    transfer_info = parse_offshoot_event(event_json)
    print(f"   ✓ Transfer detected: {transfer_info['source']}")
    print(f"   ✓ State: {transfer_info['state']}")
    print()
    
    # Required: Log transfer locally
    print("Step 2: Logging transfer...")
    log_transfer(transfer_info)
    print()
    
    # Required: Send Slack notification
    print("Step 3: Sending Slack notification...")
    send_slack_notification(transfer_info)
    print()
    
    # Optional: Upload to S3
    print("Step 4: Checking for S3 cloud upload...")
    if upload_to_s3(transfer_info):
        print("   ✓ S3 upload configured")
    else:
        print("   ℹ S3 not configured, skipping cloud upload")
    print()
    
    # Optional: Move production files
    print("Step 5: Checking for production file routing...")
    if move_production_files(transfer_info):
        print("   ✓ Production folder configured")
    else:
        print("   ℹ Production folder not configured, skipping")
    print()
    
    print("=" * 70)
    print("✓ OffShoot automation complete!")
    print("=" * 70)
    print()
    print("CHANGE PRODUCTIONS?")
    print("→ Just update variables in HedgeBuddy GUI - no script editing needed!")
    print("→ New Slack webhook? Update HB_OS_SLACK_WEBHOOK_URL")
    print("→ Different S3 bucket? Update HB_S3_BUCKET")
    print("→ New log location? Update HB_TRANSFER_LOG_PATH")


if __name__ == "__main__":
    try:
        main()
    except hedgebuddy.VariableNotFoundError as e:
        print(f"\n❌ Missing required variable: {e.variable_name}")
        print("Please add it using the HedgeBuddy desktop app")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        upload_to_s3(file_path, filename)
    else:
        print("   ℹ S3_BUCKET not configured - skipping upload")
    print()

    # Step 5: Optional email delivery
    print("Step 5: Checking for email delivery...")
    if hedgebuddy.exists("REPORT_EMAIL"):
        send_email_report(file_path)
    else:
        print("   ℹ REPORT_EMAIL not configured - skipping email")
    print()

    print("=" * 70)
    print("Report workflow completed successfully!")
    print("=" * 70)
    print()
    print("💡 Tip: Use the HedgeBuddy app to add S3_BUCKET or REPORT_EMAIL")
    print("   to enable cloud upload and email delivery features.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\n💡 Make sure you've configured REPORT_PATH using the HedgeBuddy app!")
