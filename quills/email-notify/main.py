import json
import smtplib
import sys
from email.mime.text import MIMEText


def main():
    data = json.loads(sys.stdin.read())
    inputs = data.get("inputs", {})

    msg = MIMEText(inputs.get("body", ""))
    msg["Subject"] = inputs.get("subject", "HedgeBuddy Notification")
    msg["From"] = inputs.get("username", "")
    msg["To"] = inputs.get("to", "")

    try:
        with smtplib.SMTP(inputs["smtp_host"], int(inputs.get("smtp_port", 587))) as server:
            server.starttls()
            server.login(inputs["username"], inputs["password"])
            server.sendmail(msg["From"], [msg["To"]], msg.as_string())
        print(json.dumps({"ok": True, "output": {"sent_to": msg["To"]}}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    main()
