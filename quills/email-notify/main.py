import json
import smtplib
import sys
from email.mime.text import MIMEText


def main():
    data = json.loads(sys.stdin.read())
    command = data.get("command", "execute")
    settings = data.get("settings", {})
    inputs = data.get("inputs", {})

    if command == "test_connection":
        test_connection(settings)
    else:
        execute(settings, inputs)


def test_connection(settings):
    """Verify SMTP credentials by connecting and authenticating."""
    try:
        host = settings.get("smtp_host", "smtp.gmail.com")
        port = int(settings.get("smtp_port", 587))
        username = settings.get("username", "")
        password = settings.get("password", "")

        if not username or not password:
            print(json.dumps({"ok": False, "error": "Username and password are required"}))
            return

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            server.login(username, password)

        print(json.dumps({"ok": True, "output": {"message": "SMTP authentication successful"}}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))


def execute(settings, inputs):
    """Send an email using saved SMTP settings and workflow inputs."""
    try:
        host = settings.get("smtp_host", "smtp.gmail.com")
        port = int(settings.get("smtp_port", 587))
        username = settings.get("username", "")
        password = settings.get("password", "")

        msg = MIMEText(inputs.get("body", ""))
        msg["Subject"] = inputs.get("subject", "HedgeBuddy Notification")
        msg["From"] = username
        msg["To"] = inputs.get("to", "")

        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(username, password)
            server.sendmail(msg["From"], [msg["To"]], msg.as_string())

        print(json.dumps({"ok": True, "output": {"sent_to": msg["To"]}}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    main()
