"""
HedgeBuddy Demo - Real-World Scenario
======================================

This script simulates a real-world use case: generating a report and
optionally uploading it to S3 or sending it via email.

Required variables (add via HedgeBuddy app):
- REPORT_PATH: Where to save reports locally (e.g., C:\\Reports)

Optional variables:
- S3_BUCKET: AWS S3 bucket name (if you want S3 upload)
- REPORT_EMAIL: Email address to send reports (if you want email delivery)
- API_URL: Custom API endpoint (has sensible default)
"""

from datetime import datetime
from pathlib import Path
import hedgebuddy


def generate_report():
    """Simulate report generation."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_content = f"""
    Sales Report - {timestamp}
    {'=' * 40}
    
    Total Sales: $125,450.00
    New Customers: 42
    Revenue Growth: +15.3%
    
    Generated using HedgeBuddy variables!
    """
    return report_content, f"sales_report_{timestamp}.txt"


def save_report_locally(report_content, filename):
    """Save report to local filesystem."""
    # Get report path from HedgeBuddy (required variable)
    report_path = Path(hedgebuddy.var("REPORT_PATH"))
    
    # Create directory if it doesn't exist
    report_path.mkdir(parents=True, exist_ok=True)
    
    # Save the report
    file_path = report_path / filename
    file_path.write_text(report_content, encoding="utf-8")
    
    print(f"   ✓ Report saved to: {file_path}")
    return file_path


def upload_to_s3(file_path, filename):
    """Simulate S3 upload (would use boto3 in real scenario)."""
    bucket = hedgebuddy.var("S3_BUCKET")
    print(f"   ✓ Would upload to: s3://{bucket}/{filename}")
    print(f"   ℹ (Simulated - in production, use boto3.upload_file)")


def send_email_report(file_path):
    """Simulate email sending (would use SMTP in real scenario)."""
    email = hedgebuddy.var("REPORT_EMAIL")
    print(f"   ✓ Would email report to: {email}")
    print(f"   ℹ (Simulated - in production, use smtplib or email service)")


def fetch_data_from_api():
    """Simulate API call with configurable endpoint."""
    # Use custom API URL or fall back to default
    api_url = hedgebuddy.var("API_URL", "https://api.hedge.co/v1")
    print(f"   ✓ Fetching data from: {api_url}/sales")
    print(f"   ℹ (Simulated - in production, use requests library)")


def main():
    print("=" * 70)
    print("HedgeBuddy Demo - Real-World Report Generation")
    print("=" * 70)
    print()

    # Step 1: Fetch data from API
    print("Step 1: Fetching sales data from API...")
    fetch_data_from_api()
    print()

    # Step 2: Generate report
    print("Step 2: Generating report...")
    report_content, filename = generate_report()
    print(f"   ✓ Report generated: {filename}")
    print()

    # Step 3: Save locally (always required)
    print("Step 3: Saving report locally...")
    file_path = save_report_locally(report_content, filename)
    print()

    # Step 4: Optional S3 upload
    print("Step 4: Checking for S3 upload...")
    if hedgebuddy.exists("S3_BUCKET"):
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
