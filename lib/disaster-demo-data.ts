import type { DisasterNoteData } from "@/lib/disaster-types";

export const defaultDisasterNoteData: DisasterNoteData = {
  householdName: "わが家",
  lastReviewedAt: new Date().toISOString(),
  members: [
    {
      id: "member-1",
      name: "山田 花子",
      relation: "本人",
      phone: "",
      notes: "連絡が取れない時は家族グループと固定電話も確認する。",
      latestStatus: "safe",
      latestStatusAt: new Date().toISOString()
    },
    {
      id: "member-2",
      name: "山田 太郎",
      relation: "家族",
      phone: "",
      notes: "勤務先から帰宅困難になる可能性あり。",
      latestStatus: "unavailable"
    }
  ],
  emergencyContacts: [
    { id: "contact-1", label: "親族", name: "実家", phone: "" },
    { id: "contact-2", label: "学校・園", name: "学校", phone: "" }
  ],
  evacuationPlaces: [
    {
      id: "place-1",
      name: "第一集合場所",
      address: "近くの避難場所を登録",
      note: "家に戻れない時はここで合流する。"
    }
  ],
  disasterRules: [
    {
      id: "rule-1",
      title: "連絡手順",
      body: "電話がつながらない時は、災害用伝言板、家族チャット、親族への伝言の順で確認する。"
    },
    {
      id: "rule-2",
      title: "集合ルール",
      body: "夜間や悪天候の場合は無理に移動せず、現在地と状況を共有する。"
    }
  ],
  medicalNotes: [
    {
      id: "medical-1",
      memberName: "家族共通",
      body: "服薬、アレルギー、持病、配慮事項をここに整理する。"
    }
  ],
  supplyItems: [
    { id: "supply-1", name: "飲料水", category: "water", quantity: "6", note: "2Lボトル。1人1日3Lを目安", expiresAt: "", checked: false },
    { id: "supply-2", name: "非常食", category: "food", quantity: "9", note: "食数または袋数。3日分を目安", expiresAt: "", checked: false },
    { id: "supply-3", name: "モバイルバッテリー", category: "battery", quantity: "1", note: "充電済み", expiresAt: "", checked: false },
    { id: "supply-4", name: "常備薬", category: "medicine", quantity: "3", note: "日分。薬名は備考に記録", expiresAt: "", checked: false },
    { id: "supply-5", name: "懐中電灯", category: "battery", quantity: "1", note: "本数", expiresAt: "", checked: false },
    { id: "supply-6", name: "乾電池", category: "battery", quantity: "8", note: "単三・単四など種類を記録", expiresAt: "", checked: false },
    { id: "supply-7", name: "携帯トイレ", category: "other", quantity: "15", note: "回数分。家族人数に合わせる", expiresAt: "", checked: false },
    { id: "supply-8", name: "ウェットティッシュ", category: "other", quantity: "1", note: "袋数", expiresAt: "", checked: false },
    { id: "supply-9", name: "救急セット", category: "medicine", quantity: "1", note: "一式", expiresAt: "", checked: false }
  ],
  statusLogs: [],
  notificationSettings: {
    monthlyReview: true,
    syncEnabled: false,
    locationShareEnabled: false
  },
  templateMessages: [
    "無事です。落ち着いたら詳しく連絡します。",
    "移動中です。安全な場所に着いたら連絡します。",
    "返信が難しい状況です。可能になったら連絡します。"
  ]
};
