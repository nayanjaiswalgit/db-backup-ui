"""
Notification service for Slack, Email, and Webhooks
"""
import logging
import aiohttp
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional
from jinja2 import Template

from app.core.config import settings
from app.models.notification import NotificationType, NotificationEvent

logger = logging.getLogger(__name__)


class NotificationService:
    """Service for sending notifications"""

    @staticmethod
    async def send_slack_notification(webhook_url: str, message: str, title: Optional[str] = None) -> bool:
        """Send Slack notification"""
        try:
            payload = {
                "text": title or "DB Backup Platform",
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": message
                        }
                    }
                ]
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(webhook_url, json=payload) as response:
                    if response.status == 200:
                        logger.info("Slack notification sent successfully")
                        return True
                    else:
                        logger.error(f"Slack notification failed: {response.status}")
                        return False

        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")
            return False

    @staticmethod
    async def send_email_notification(
        to_email: str,
        subject: str,
        message: str,
        html: bool = False
    ) -> bool:
        """Send email notification"""
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = settings.SMTP_FROM
            msg['To'] = to_email
            msg['Subject'] = subject

            if html:
                part = MIMEText(message, 'html')
            else:
                part = MIMEText(message, 'plain')

            msg.attach(part)

            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                use_tls=settings.SMTP_USE_TLS
            )

            logger.info(f"Email sent to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email: {e}")
            return False

    @staticmethod
    async def send_webhook_notification(url: str, payload: Dict[str, Any]) -> bool:
        """Send webhook notification"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if 200 <= response.status < 300:
                        logger.info(f"Webhook sent to {url}")
                        return True
                    else:
                        logger.error(f"Webhook failed: {response.status}")
                        return False

        except Exception as e:
            logger.error(f"Failed to send webhook: {e}")
            return False

    @staticmethod
    async def send_backup_notification(backup_id: int, success: bool, message: str):
        """Send backup completion notification"""
        if success:
            emoji = "✅"
            status = "Success"
        else:
            emoji = "❌"
            status = "Failed"

        slack_message = f"{emoji} *Backup {status}*\n\n{message}\n\nBackup ID: {backup_id}"

        # Send to Slack if configured
        if settings.SLACK_WEBHOOK_URL:
            await NotificationService.send_slack_notification(
                settings.SLACK_WEBHOOK_URL,
                slack_message,
                "DB Backup Notification"
            )

    @staticmethod
    async def send_restore_notification(backup_id: int, success: bool, message: str):
        """Send restore completion notification"""
        if success:
            emoji = "✅"
            status = "Success"
        else:
            emoji = "❌"
            status = "Failed"

        slack_message = f"{emoji} *Restore {status}*\n\n{message}\n\nBackup ID: {backup_id}"

        # Send to Slack if configured
        if settings.SLACK_WEBHOOK_URL:
            await NotificationService.send_slack_notification(
                settings.SLACK_WEBHOOK_URL,
                slack_message,
                "DB Restore Notification"
            )

    @staticmethod
    async def send_server_health_alert(server_name: str, status: str, message: str):
        """Send server health alert"""
        slack_message = f"⚠️ *Server Health Alert*\n\nServer: {server_name}\nStatus: {status}\n\n{message}"

        if settings.SLACK_WEBHOOK_URL:
            await NotificationService.send_slack_notification(
                settings.SLACK_WEBHOOK_URL,
                slack_message,
                "Server Health Alert"
            )
