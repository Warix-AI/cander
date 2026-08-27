const RESEND_API = "https://api.resend.com/emails";

export async function sendOrgInviteEmail(opts: {
  to: string;
  orgName: string;
  inviteUrl: string;
  inviterName?: string;
  plan: "pro" | "max";
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Cander <onboarding@cander.app>";

  const subject = `Join ${opts.orgName} on Cander`;
  const html = `
    <p>${opts.inviterName ? `${opts.inviterName} invited you` : "You've been invited"} to join <strong>${opts.orgName}</strong> on Cander with a ${opts.plan === "max" ? "Max" : "Pro"} seat.</p>
    <p><a href="${opts.inviteUrl}">Accept invite and create your account</a></p>
    <p>This link expires in 14 days.</p>
  `;

  if (!key) {
    return { sent: false, inviteUrl: opts.inviteUrl };
  }

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Could not send invite email.");
  }

  return { sent: true, inviteUrl: opts.inviteUrl };
}
