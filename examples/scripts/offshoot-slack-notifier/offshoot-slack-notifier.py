#!/usr/bin/env python3
"""
OffShoot Slack Notifier - HedgeBuddy Integration Example
=========================================================

Send Slack notifications when OffShoot transfers complete.

This script is triggered by OffShoot's "File Copy Completed" event and uses
HedgeBuddy to manage Slack webhook configuration without hardcoding credentials.

PREREQUISITES:
1. Install HedgeBuddy: pip install --user hedgebuddy
2. Install requests library: pip install --user requests
3. Create a Slack Incoming Webhook: https://api.slack.com/messaging/webhooks
4. Configure these variables in HedgeBuddy desktop app:
   - HB_OS_SLACK_WEBHOOK_URL (required): Your Slack webhook URL
   - HB_OS_SLACK_CHANNEL (optional): Override default channel (e.g., "#transfers")
   - HB_OS_NOTIFY_ON_FAILED_ONLY (optional): "true" to notify only on failures (default: "false")

USAGE:
1. Add this script to OffShoot's "File Copy Completed" event
2. OffShoot will pass event data as JSON when transfer completes
3. Script sends formatted notification to your Slack channel

CROSS-PLATFORM:
Works on both Windows and macOS!

EVENT PAYLOAD EXAMPLE:
{
    "FileCopyCompleted_bytesCopied": 823549835,
    "FileCopyCompleted_destinationPath": "/Users/Hedge/Project X/CAM A/001",
    "FileCopyCompleted_duration": "6.256199",
    "FileCopyCompleted_mode": "Backup",
    "FileCopyCompleted_verification_mode": "Source & Destination",
    "FileCopyCompleted_presetName": "Project X",
    "FileCopyCompleted_sourceInfo": {
        "Source Name": "Untitled",
        "Location": "London",
        "Counter": "003"
    },
    "FileCopyCompleted_sourcePaths": "/Volumes/UNTITLED",
    "FileCopyCompleted_startedAt": 20190102114226,
    "FileCopyCompleted_state": "Success"
}
"""

import sys
import json

try:
    import hedgebuddy
except ImportError:
    print("ERROR: HedgeBuddy not installed. Run: pip install --user hedgebuddy")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: requests library not installed. Run: pip install --user requests")
    sys.exit(1)


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


def format_duration(duration_seconds):
    """Convert seconds to human-readable duration."""
    try:
        duration = float(duration_seconds)
    except (ValueError, TypeError):
        return "0s"
    
    if duration < 60:
        return f"{duration:.1f}s"
    elif duration < 3600:
        minutes = duration / 60
        return f"{minutes:.1f}m"
    else:
        hours = duration / 3600
        return f"{hours:.1f}h"


def get_status_emoji(state):
    """Get emoji for transfer state."""
    emoji_map = {
        "Success": "✅",
        "Failed": "❌",
        "Warnings": "⚠️",
        "Canceled": "🚫",
        "Stopped": "⏹️"
    }
    return emoji_map.get(state, "ℹ️")


def build_slack_message(payload):
    """Build formatted Slack message from OffShoot event payload."""
    
    state = payload.get("FileCopyCompleted_state", "Unknown")
    bytes_copied = payload.get("FileCopyCompleted_bytesCopied", 0)
    duration = payload.get("FileCopyCompleted_duration", 0)
    source_paths = payload.get("FileCopyCompleted_sourcePaths", "Unknown")
    destination_path = payload.get("FileCopyCompleted_destinationPath", "Unknown")
    preset_name = payload.get("FileCopyCompleted_presetName", "N/A")
    mode = payload.get("FileCopyCompleted_mode", "N/A")
    verification_mode = payload.get("FileCopyCompleted_verification_mode", "N/A")
    
    # Parse source info (it might be a JSON string or dict)
    source_info = payload.get("FileCopyCompleted_sourceInfo", {})
    if isinstance(source_info, str):
        try:
            source_info = json.loads(source_info)
        except json.JSONDecodeError:
            source_info = {}
    
    source_name = source_info.get("Source Name", "Unknown")
    location = source_info.get("Location", "")
    counter = source_info.get("Counter", "")
    
    # Build message
    emoji = get_status_emoji(state)
    size = format_bytes(bytes_copied)
    time = format_duration(duration)
    
    # Create title based on state
    if state == "Success":
        title = f"{emoji} Transfer Completed Successfully"
        color = "good"  # green
    elif state == "Failed":
        title = f"{emoji} Transfer Failed"
        color = "danger"  # red
    elif state == "Warnings":
        title = f"{emoji} Transfer Completed with Warnings"
        color = "warning"  # yellow
    else:
        title = f"{emoji} Transfer {state}"
        color = "#808080"  # gray
    
    # Build attachment fields
    fields = [
        {
            "title": "Source",
            "value": f"{source_name}" + (f" - {location}" if location else "") + (f" #{counter}" if counter else ""),
            "short": True
        },
        {
            "title": "Status",
            "value": state,
            "short": True
        },
        {
            "title": "Size",
            "value": size,
            "short": True
        },
        {
            "title": "Duration",
            "value": time,
            "short": True
        },
        {
            "title": "Source Path",
            "value": f"`{source_paths}`",
            "short": False
        },
        {
            "title": "Destination",
            "value": f"`{destination_path}`",
            "short": False
        }
    ]
    
    # Add optional fields
    if preset_name != "N/A":
        fields.append({
            "title": "Preset",
            "value": preset_name,
            "short": True
        })
    
    if verification_mode != "N/A":
        fields.append({
            "title": "Verification",
            "value": verification_mode,
            "short": True
        })
    
    # Build Slack message
    message = {
        "attachments": [
            {
                "fallback": f"Transfer {state}: {source_name} → {destination_path}",
                "color": color,
                "title": title,
                "fields": fields,
                "footer": "OffShoot Transfer via HedgeBuddy",
                "ts": None  # Slack will add timestamp
            }
        ]
    }
    
    return message


def main():
    # Check if event payload was provided
    if len(sys.argv) < 2:
        print("ERROR: No event payload provided")
        print("This script should be triggered by OffShoot's 'File Copy Completed' event")
        sys.exit(1)

    # Parse the event payload from OffShoot
    try:
        payload = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(f"ERROR: Failed to parse event payload: {e}")
        sys.exit(1)

    # Get transfer state
    state = payload.get("FileCopyCompleted_state", "Unknown")
    
    # Load configuration from HedgeBuddy
    try:
        webhook_url = hedgebuddy.var("HB_OS_SLACK_WEBHOOK_URL")
    except hedgebuddy.VariableNotFoundError:
        print("ERROR: HB_OS_SLACK_WEBHOOK_URL not configured in HedgeBuddy")
        print("Please add your Slack webhook URL using the HedgeBuddy desktop app")
        sys.exit(1)
    
    # Optional: only notify on failures
    notify_failed_only = hedgebuddy.var("HB_OS_NOTIFY_ON_FAILED_ONLY", "false").lower() == "true"
    if notify_failed_only and state == "Success":
        print(f"Transfer successful, but HB_OS_NOTIFY_ON_FAILED_ONLY is enabled. Skipping notification.")
        sys.exit(0)
    
    # Optional: custom channel override
    channel = hedgebuddy.var("HB_OS_SLACK_CHANNEL", None)
    
    # Build the Slack message
    message = build_slack_message(payload)
    
    # Add channel override if specified
    if channel:
        message["channel"] = channel
    
    # Send to Slack
    try:
        response = requests.post(
            webhook_url,
            json=message,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"✓ Slack notification sent successfully!")
            print(f"  Status: {state}")
            print(f"  Source: {payload.get('FileCopyCompleted_sourcePaths', 'Unknown')}")
            print(f"  Destination: {payload.get('FileCopyCompleted_destinationPath', 'Unknown')}")
        else:
            print(f"ERROR: Slack API returned status {response.status_code}")
            print(f"Response: {response.text}")
            sys.exit(1)
            
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Failed to send Slack notification: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
