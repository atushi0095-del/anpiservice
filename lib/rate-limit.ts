import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase-admin";

type RateLimitOptions = {
  scope: string;
  subject: string;
  maxRequests: number;
  windowMs: number;
};

function makeKey(scope: string, subject: string, windowStart: number) {
  const hashedSubject = createHash("sha256").update(subject).digest("hex").slice(0, 24);
  return `${scope}_${windowStart}_${hashedSubject}`;
}

export async function enforceRateLimit(options: RateLimitOptions) {
  const { scope, subject, maxRequests, windowMs } = options;
  const db = getAdminDb();
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const docId = makeKey(scope, subject, windowStart);
  const ref = db.collection("rateLimits").doc(docId);

  const allowed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const currentCount = snapshot.exists ? Number(snapshot.data()?.count || 0) : 0;
    if (currentCount >= maxRequests) {
      return false;
    }

    transaction.set(
      ref,
      {
        scope,
        subjectHash: docId,
        count: currentCount + 1,
        windowStart: new Date(windowStart).toISOString(),
        expiresAt: new Date(windowStart + windowMs).toISOString(),
        updatedAt: new Date(now).toISOString()
      },
      { merge: true }
    );
    return true;
  });

  if (!allowed) {
    throw new Error("操作が短時間に集中しています。少し時間をおいてから、もう一度お試しください。");
  }
}
