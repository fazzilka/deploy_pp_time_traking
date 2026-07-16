# Resend email notifications

Resend is an optional external delivery channel. PostgreSQL notifications, REST history,
and SSE remain the source of truth and continue to work when email is disabled or unavailable.

## Configuration

Set these values only in backend and Celery runtime environments:

```dotenv
EMAIL_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=notifications@example.com
RESEND_FROM_NAME=Time Tracking
RESEND_WEBHOOK_SECRET=whsec_...
EMAIL_REPLY_TO=support@example.com
EMAIL_DEFAULT_LOCALE=ru
EMAIL_BASE_URL=https://time-tracking.online
EMAIL_MAX_RETRIES=5
EMAIL_RETRY_BASE_SECONDS=30
EMAIL_REQUEST_TIMEOUT_SECONDS=10
```

Keep `EMAIL_ENABLED=false` and `EMAIL_PROVIDER=disabled` for local development unless a
verified Resend test recipient is being used. Never expose these variables to Vite or the
frontend container.

## Resend setup

1. Verify the sending domain and required DNS records in Resend.
2. Create a sending-only API key and store it in the deployment secret manager.
3. Configure a webhook for `https://<host>/api/v1/webhooks/resend`.
4. Subscribe to sent, delivered, delayed, bounced, complained, suppressed, and failed events.
5. Store the webhook signing secret as `RESEND_WEBHOOK_SECRET`.
6. Apply Alembic migration `0017_resend_email` before enabling email.
7. Enable email for a test user in Profile and verify the DB delivery lifecycle, worker logs,
   and Prometheus email metrics before broader opt-in.

User delivery is opt-in. Protected-space task notifications are always internal-only.
Bounce, complaint, and suppression events disable email for the affected user without
changing in-app notifications.

## Rollback

Set `EMAIL_ENABLED=false` first. Internal notifications need no rollback. Keep delivery and
webhook records for audit; downgrade the migration only during a coordinated application
rollback after workers and API instances are running the previous release.
