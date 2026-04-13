import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyLineSignature(rawBody: string, signature: string) {
  const secret = process.env.LINE_CHANNEL_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function replyLineMessage(replyToken: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    throw new Error(`LINE reply failed with ${response.status}.`);
  }
}

export async function pushLineMessage(lineUserId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured." };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    return { ok: false, error: `LINE push failed with ${response.status}.` };
  }

  return { ok: true };
}
