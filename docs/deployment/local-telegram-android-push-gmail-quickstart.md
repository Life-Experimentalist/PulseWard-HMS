# Local Quickstart: Telegram + Android Push APK + Gmail SMTP

Use this guide for localhost Docker setup now, with tenant-safe configuration that can later move to web deployment.

## 1. What you get

1. Telegram test notifications using BotFather bot.
2. Android app with Expo push notifications and APK build path.
3. Gmail SMTP configuration for email notifications.
4. Tenant-safe setup with strict tenant mode.
5. JWT secret replacement guidance.

## 2. Required local baseline

1. Docker running.
2. Postgres and Mongo running.
3. Notification service running on `http://localhost:5102`.
4. Strict tenant enabled in `.env`:
   `PLATFORM_DEFAULT_TENANT_KEY=citycare-hospital`
   `PULSEWARD_STRICT_TENANT_KEY=citycare-hospital`

## 3. Telegram setup (BotFather)

Yes, use BotFather.

1. Open Telegram and chat with `@BotFather`.
2. Run `/newbot` and finish bot creation.
3. Copy bot token.
4. Get your chat id:
   Send a message to your bot, then open:
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
5. Find `message.chat.id` from response.
   Do not use `https://web.telegram.org/a/#...` as the source of truth for bot delivery.
   That URL is a Telegram Web route, not the API contract used by the bot adapter.
6. Put credentials in `.env`:

```dotenv
INTEGRATION_TELEGRAM_CREDENTIALS={"botToken":"<YOUR_BOT_TOKEN>","chatId":"<YOUR_CHAT_ID>"}
```

7. Check status:

```powershell
Invoke-RestMethod "http://localhost:5102/api/v1/integrations/messaging/telegram/config-status?tenantKey=citycare-hospital"
```

8. Register user once, then login and get JWT for tenant-scoped testing:

```powershell
$registerBody = @{
   tenantKey = "citycare-hospital"
   email = "patient@citycare.example.com"
   password = "demo-password"
   role = "patient"
} | ConvertTo-Json
try {
   Invoke-RestMethod -Method Post -Uri "http://localhost:5101/api/v1/auth/register" -ContentType "application/json" -Body $registerBody | Out-Null
} catch {
   # Ignore duplicate registration on repeat runs
}

$loginBody = @{
   tenantKey = "citycare-hospital"
   email = "patient@citycare.example.com"
   password = "demo-password"
   role = "patient"
} | ConvertTo-Json
$authToken = (Invoke-RestMethod -Method Post -Uri "http://localhost:5101/api/v1/auth/login" -ContentType "application/json" -Body $loginBody).token
```

9. Send Telegram test message through notification service:

```powershell
$payload = @{
  tenantKey = "citycare-hospital"
  providerKey = "telegram-bot"
  message = "PulseWard Telegram test from localhost"
  dryRun = $false
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://localhost:5102/api/v1/integrations/messaging/test" -Headers @{ Authorization = "Bearer $authToken" } -ContentType "application/json" -Body $payload
```

10. Security note:
Only the bot token holder can call Telegram bot APIs (`getUpdates`, `sendMessage`).
If token leaks, rotate from BotFather immediately.

## 4. Android push notification setup (SDK 53)

Important: remote push is not supported in Expo Go on Android for SDK 53+. Use a development build or APK.

### 4.1 Prepare mobile app

1. Install EAS CLI:

```powershell
npm install -g eas-cli
```

2. Login:

```powershell
eas login
```

3. Configure project (inside mobile app directory):

```powershell
Set-Location apps/mobile-notifications
eas init
```

4. If prompted, link/create Expo project and keep generated project id.

### 4.2 Configure Android push credentials

1. Create Firebase project.
2. Add Android app with package name:
   `com.lifeexperimentalist.pulsewardmobilenotifications`
3. Create FCM HTTP v1 service account key JSON.
4. Upload credentials with:

```powershell
eas credentials -p android
```

### 4.3 Build APK and install on phone

```powershell
pnpm --dir apps/mobile-notifications build:android:apk
```

Install generated APK on your Android phone.

### 4.4 Run app and test push

1. Start mobile app dev server (LAN mode):

```powershell
pnpm --dir apps/mobile-notifications start:lan
```

2. Open app on phone.
3. Login inside app first (same tenant/email/role).
4. Tap `Enable push and get token` (this now registers token against logged-in user).
5. Tap `Send test push` (backend sends only to that authenticated user's registered device).
5. Or send from terminal:

```powershell
pnpm run push:expo:test -- --token "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" --title "PulseWard" --body "Push from localhost"
```

## 5. Gmail SMTP setup (beginner)

If you have Gmail, this is the easiest starting option.

1. Enable 2-Step Verification on Google account.
2. Open Google Account -> Security -> App passwords.
3. Create a new app password (Mail).
4. Put values in `.env`:

```dotenv
EMAIL_USER=yourgmail@gmail.com
EMAIL_PASSWORD=<16_char_app_password>
INTEGRATION_EMAIL_SMTP_CREDENTIALS={"host":"smtp.gmail.com","port":587,"secure":false,"user":"yourgmail@gmail.com","pass":"<16_char_app_password>","from":"yourgmail@gmail.com"}
```

5. Validate SMTP config status:

```powershell
Invoke-RestMethod "http://localhost:5102/api/v1/integrations/messaging/email/config-status?tenantKey=citycare-hospital"
```

## 6. Tenant isolation guidance (local now, web later)

1. Keep one tenant key per hospital.
2. Keep strict tenant mode enabled per environment.
3. Always pass `tenantKey` in integration test requests.
4. Keep separate integration config files per tenant under `config/integrations`.
5. In web deployment, keep domain and origin allowlists tenant-scoped.

## 7. JWT generated token vs .env placeholder

1. `change_me_jwt_local_only` is only a placeholder.
2. Replace `JWT_SECRET` in `.env` with generated value.
3. Generated token format can look different and that is expected.
4. Rotating JWT secret invalidates existing sessions/tokens.

## 8. Bare minimum input checklist

For a proper local run with Telegram + Android push + optional Gmail:

1. `JWT_SECRET`
2. `PLATFORM_DEFAULT_TENANT_KEY`
3. `PULSEWARD_STRICT_TENANT_KEY`
4. `INTEGRATION_TELEGRAM_CREDENTIALS`
5. Auth login identity for demo (`email`, `password`, `role`) scoped to same tenant
6. Android Expo push token from phone app (registered after in-app login)
7. Optional: `EMAIL_USER`, `EMAIL_PASSWORD`, `INTEGRATION_EMAIL_SMTP_CREDENTIALS`
