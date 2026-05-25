import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

async function deleteQueryDocs(field: string, value: string, collection: string) {
  const db = getAdminDb();
  const snapshot = await db.collection(collection).where(field, "==", value).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = getAdminDb();

    await Promise.all([
      deleteQueryDocs("memberId", user.uid, "checkIns"),
      deleteQueryDocs("memberId", user.uid, "watchLinks"),
      deleteQueryDocs("familyId", user.uid, "watchLinks"),
      user.email ? deleteQueryDocs("familyEmail", user.email, "watchLinks") : Promise.resolve(),
      deleteQueryDocs("memberId", user.uid, "notificationLogs"),
      deleteQueryDocs("senderId", user.uid, "quickShares"),
      deleteQueryDocs("recipientId", user.uid, "quickShares")
    ]);

    await Promise.all([
      db.collection("users").doc(user.uid).delete().catch(() => undefined),
      db.collection("notificationSettings").doc(user.uid).delete().catch(() => undefined)
    ]);

    await getAdminAuth().deleteUser(user.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
