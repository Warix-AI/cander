# Cross-client notifications setup

Cander uses **one notification record** and a delivery router. Producers (e.g. Gmail sync) only call `createNotification`. Delivery adapters handle Capacitor (APNs/FCM), Electron OS alerts (via Supabase Realtime), Web Push, and the in-app center.

## 1. Database

Apply migration:

```bash
# via your usual Supabase migration workflow
supabase db push
# or
npx supabase migration up
```

Migration: `supabase/migrations/20260915180000_notifications_system.sql`

Publishes `notifications` to `supabase_realtime`.

## 2. Apple Push (iOS / Capacitor)

1. Apple Developer → Keys → create an **APNs** key (`.p8`). Note Key ID + Team ID.
2. App ID `ai.warix.cander` → enable **Push Notifications**.
3. In Xcode (after `cd mobile && npx cap sync`):
   - Signing & Capabilities → Push Notifications
   - Confirm `App.entitlements` has `aps-environment` (`development` for debug builds; set to `production` for App Store / TestFlight release builds)
4. Server env:

```bash
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_BUNDLE_ID=ai.warix.cander
APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
APNS_PRODUCTION=false   # true for production APNs
```

## 3. Firebase / FCM (Android / Capacitor)

1. Create a Firebase project; add Android app with package `ai.warix.cander`.
2. Download `google-services.json` into `mobile/android/app/` ( Capacitator’s gradle plugin applies when the file exists).
3. Create a service account with Firebase Cloud Messaging access; paste JSON:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

4. `POST_NOTIFICATIONS` is already in `AndroidManifest.xml`.

## 4. Web Push (closed browser tab)

1. Generate VAPID keys (e.g. `npx web-push generate-vapid-keys`).
2. Set:

```bash
WEB_PUSH_VAPID_PUBLIC_KEY=
WEB_PUSH_VAPID_PRIVATE_KEY=
WEB_PUSH_VAPID_SUBJECT=mailto:support@cander.app
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=   # same public key
```

3. Service worker: `public/sw-push.js` (registered from Settings → Enable browser push).

## 5. Electron

No extra cloud credentials. Running Electron registers a `realtime_session` endpoint and shows `Notification` on Realtime inserts. Rebuild the desktop shell after pulling:

```bash
npm run desktop
```

## 6. Capacitor sync

```bash
cd mobile
npm install
npx cap sync
npm run ios:dev   # or android:dev
```

## 7. App test path

1. Sign in on the device / desktop / browser.
2. Settings → **Notifications** → enable Gmail + device/browser push (permission prompt is intentional here).
3. Confirm an endpoint exists: `GET /api/notifications/endpoints` with Bearer token.
4. Trigger a test (dev or platform admin):

```bash
curl -X POST "$ORIGIN/api/notifications/test" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

5. For real Gmail: wait for connector sync (cron ~1m) after the connection is **armed** (first sync post-deploy arms without notifying history).
6. Tap the notification → correct Gmail account + thread/message should open.

## 8. Security notes

- Never put OAuth tokens or full email bodies in push payloads.
- Device/endpoint APIs require Bearer auth; RLS scopes rows to `profile_id = auth.uid()`.
- `/api/notifications/test` is blocked in production unless `is_platform_admin`.

## Architecture map

| Layer | Location |
|-------|----------|
| Schema | `supabase/migrations/20260915180000_notifications_system.sql` |
| createNotification | `lib/notifications/create-notification.ts` |
| Delivery router | `lib/notifications/deliver.ts` |
| APNs / FCM / Web Push | `lib/notifications/push-providers.ts` |
| Gmail producer | `lib/notifications/gmail-new-email.ts` ← `runConnectorSync` |
| Realtime hydrate | `lib/notifications/notification-sync.ts` |
| Capacitor client | `lib/notifications/push-client.ts` |
| Shared routing | `lib/notifications/resolve-notification-route.ts` |
| Settings / center | `components/settings/NotificationSettings.tsx` |
