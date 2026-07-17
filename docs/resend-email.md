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

Optional notification email supports deadline events and workspace membership/role changes.
Workspace invitations use only the transactional path, so an in-app invitation cannot produce
a second optional email.

### Notification skip policy

| Code | Condition |
| --- | --- |
| `email_disabled` | Global outbound email is disabled. |
| `inactive_user` | The notification owner is inactive. |
| `missing_email` | The notification owner has no recipient address. |
| `user_opt_out` | The user explicitly disabled optional email. |
| `recipient_suppressed` | A bounce/complaint suppressed the recipient. |
| `protected_space` | The notification contains protected-space content. |
| `deadline_24h_opt_out` | The user disabled the 24-hour deadline category. |
| `deadline_1h_opt_out` | The user disabled the 1-hour deadline category. |
| `deadline_overdue_opt_out` | The user disabled the overdue category. |
| `transactional_only` | The type must use its mandatory transactional sender. |
| `unsupported_notification_type` | No optional email policy/template exists for the type. |

Transactional precondition logs additionally use `source_missing`, `verification_consumed`,
`verification_expired`, `invitation_not_pending`, `invitation_expired`, and `stale_generation`.
These conditions are checked before creating/sending a delivery and never include the code or token
in logs.

Provider, API, and network failures are never `skipped`: retryable failures remain `queued` and
permanent failures become `failed`.

## Transactional registration and invitation email

`registration_verification` and `workspace_invitation` are mandatory transactional messages.
They reuse the provider, retry policy, delivery persistence, idempotency keys, and Resend webhook
lifecycle, but do not consult optional deadline-email preferences. Global `EMAIL_ENABLED` and
provider configuration still control the channel.

Verification codes and raw invitation tokens are never persisted in PostgreSQL or included in
provider tags or webhook metadata. Only safe internal IDs and a generation number are stored. The
plaintext secret is passed in a redacted Celery task message, with the result backend disabled,
and is checked against the current database generation before delivery.

Apply `0018_invites_verify` before enabling these flows. Existing users are marked verified by
the migration; new public registrations create a `PendingRegistration` and do not create a
`User` until the one-time code is accepted.

## Read-only delivery diagnostic

Run this in a backend container. It masks the recipient and never sends an email or changes the
delivery row:

```bash
python -m src.cli.diagnose_email_notification --notification-id 123 --dry-run
```

The output separates the current `policy_decision` from the delivery action. Historical terminal
rows (`sent`, `delivered`, `failed`, or `skipped`) report `decision=no_action` and are never rewritten
or resent by the diagnostic command.

## Rollback

Set `EMAIL_ENABLED=false` first. Internal notifications need no rollback. Keep delivery and
webhook records for audit; downgrade the migration only during a coordinated application
rollback after workers and API instances are running the previous release.
