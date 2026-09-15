/**
 * Push provider abstraction — APNs / FCM / Web Push.
 * Business logic never imports vendor SDKs directly.
 */

export type PushSendPayload = {
  title: string;
  body: string;
  data: Record<string, string>;
  /** Deep link / route hint for OS tap handlers. */
  url?: string;
};

export type PushSendResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** Token permanently invalid — disable endpoint. */
      permanent?: boolean;
    };

export type PushProvider = {
  send(opts: {
    token?: string | null;
    subscription?: Record<string, unknown> | null;
    environment?: "development" | "production";
    payload: PushSendPayload;
  }): Promise<PushSendResult>;
};

function dataPayload(payload: PushSendPayload): Record<string, string> {
  return {
    ...payload.data,
    title: payload.title,
    body: payload.body,
    ...(payload.url ? { url: payload.url } : {}),
  };
}

/** No-op when credentials are missing — soft-fail delivery. */
export const noopPushProvider: PushProvider = {
  async send() {
    return {
      ok: false,
      error: "Push provider not configured.",
    };
  },
};

export function createApnsProvider(): PushProvider {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId =
    process.env.APNS_BUNDLE_ID?.trim() || "ai.warix.cander";
  const privateKey = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !privateKey) return noopPushProvider;

  return {
    async send({ token, environment, payload }) {
      if (!token?.trim()) {
        return { ok: false, error: "Missing APNs device token.", permanent: true };
      }
      try {
        const { SignJWT, importPKCS8 } = await import("jose");
        const key = await importPKCS8(privateKey, "ES256");
        const jwt = await new SignJWT({})
          .setProtectedHeader({ alg: "ES256", kid: keyId })
          .setIssuer(teamId)
          .setIssuedAt()
          .sign(key);

        const host =
          environment === "development"
            ? "https://api.sandbox.push.apple.com"
            : process.env.APNS_PRODUCTION === "false"
              ? "https://api.sandbox.push.apple.com"
              : "https://api.push.apple.com";

        const res = await fetch(
          `${host}/3/device/${encodeURIComponent(token.trim())}`,
          {
            method: "POST",
            headers: {
              authorization: `bearer ${jwt}`,
              "apns-topic": bundleId,
              "apns-push-type": "alert",
              "apns-priority": "10",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: "default",
              },
              ...dataPayload(payload),
            }),
          },
        );

        if (res.ok) return { ok: true };
        const text = await res.text().catch(() => "");
        const permanent =
          res.status === 410 ||
          /BadDeviceToken|Unregistered|ExpiredToken/i.test(text);
        return {
          ok: false,
          error: `APNs ${res.status}: ${text.slice(0, 200)}`,
          permanent,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "APNs send failed.",
        };
      }
    },
  };
}

export function createFcmProvider(): PushProvider {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return noopPushProvider;

  return {
    async send({ token, payload }) {
      if (!token?.trim()) {
        return { ok: false, error: "Missing FCM token.", permanent: true };
      }
      try {
        const creds = JSON.parse(raw) as {
          client_email?: string;
          private_key?: string;
          project_id?: string;
        };
        if (!creds.client_email || !creds.private_key || !creds.project_id) {
          return { ok: false, error: "Invalid Firebase service account JSON." };
        }
        const { SignJWT, importPKCS8 } = await import("jose");
        const key = await importPKCS8(
          creds.private_key.replace(/\\n/g, "\n"),
          "RS256",
        );
        const accessJwt = await new SignJWT({
          scope: "https://www.googleapis.com/auth/firebase.messaging",
        })
          .setProtectedHeader({ alg: "RS256", typ: "JWT" })
          .setIssuer(creds.client_email)
          .setSubject(creds.client_email)
          .setAudience("https://oauth2.googleapis.com/token")
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(key);

        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: accessJwt,
          }),
        });
        if (!tokenRes.ok) {
          return {
            ok: false,
            error: `FCM oauth ${tokenRes.status}`,
          };
        }
        const tokenJson = (await tokenRes.json()) as { access_token?: string };
        const accessToken = tokenJson.access_token;
        if (!accessToken) {
          return { ok: false, error: "FCM oauth missing access_token." };
        }

        const sendRes = await fetch(
          `https://fcm.googleapis.com/v1/projects/${creds.project_id}/messages:send`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${accessToken}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: token.trim(),
                notification: {
                  title: payload.title,
                  body: payload.body,
                },
                data: dataPayload(payload),
              },
            }),
          },
        );
        if (sendRes.ok) return { ok: true };
        const text = await sendRes.text().catch(() => "");
        const permanent =
          /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(text);
        return {
          ok: false,
          error: `FCM ${sendRes.status}: ${text.slice(0, 200)}`,
          permanent,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "FCM send failed.",
        };
      }
    },
  };
}

export function createWebPushProvider(): PushProvider {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "mailto:support@cander.app";
  if (!publicKey || !privateKey) return noopPushProvider;

  return {
    async send({ subscription, payload }) {
      if (!subscription || typeof subscription !== "object") {
        return {
          ok: false,
          error: "Missing web push subscription.",
          permanent: true,
        };
      }
      try {
        // Dynamic import keeps optional dependency soft when unset.
        const webpush = await import("web-push").catch(() => null);
        if (!webpush) {
          return {
            ok: false,
            error: "web-push package not installed.",
          };
        }
        webpush.setVapidDetails(subject, publicKey, privateKey);
        await webpush.sendNotification(
          subscription as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            data: dataPayload(payload),
          }),
        );
        return { ok: true };
      } catch (err) {
        const statusCode =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        const permanent = statusCode === 404 || statusCode === 410;
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Web Push send failed.",
          permanent,
        };
      }
    },
  };
}

let apns: PushProvider | null = null;
let fcm: PushProvider | null = null;
let web: PushProvider | null = null;

export function getApnsProvider(): PushProvider {
  if (!apns) apns = createApnsProvider();
  return apns;
}

export function getFcmProvider(): PushProvider {
  if (!fcm) fcm = createFcmProvider();
  return fcm;
}

export function getWebPushProvider(): PushProvider {
  if (!web) web = createWebPushProvider();
  return web;
}
