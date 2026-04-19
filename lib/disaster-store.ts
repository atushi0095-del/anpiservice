import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseClients, hasFirebaseConfig } from "@/lib/firebase";
import type { DisasterNoteData } from "@/lib/disaster-types";

const COLLECTION = "disasterNotes";

export async function loadDisasterNoteFromCloud(uid: string): Promise<DisasterNoteData | null> {
  if (!hasFirebaseConfig()) return null;
  try {
    const { db } = getFirebaseClients();
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return null;
    return snap.data() as DisasterNoteData;
  } catch {
    return null;
  }
}

export async function saveDisasterNoteToCloud(uid: string, data: DisasterNoteData): Promise<void> {
  if (!hasFirebaseConfig()) return;
  try {
    const { db } = getFirebaseClients();
    await setDoc(doc(db, COLLECTION, uid), data);
  } catch {
    // サイレントフェイル: ローカル保存は常に先に完了している
  }
}
