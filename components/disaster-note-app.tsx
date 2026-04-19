"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TouchEvent, UIEvent } from "react";
import { defaultDisasterNoteData } from "@/lib/disaster-demo-data";
import type {
  DisasterNoteData,
  DisasterRule,
  EmergencyContact,
  EmergencyStatus,
  HouseholdMember,
  MedicalNote,
  SafetyStatusLog,
  SupplyCategory,
  SupplyItem
} from "@/lib/disaster-types";
import { hasFirebaseConfig, getFirebaseClients } from "@/lib/firebase";
import { loadDisasterNoteFromCloud, saveDisasterNoteToCloud } from "@/lib/disaster-store";
import { addFamilyContactViaApi, loadFamilyDashboardViaApi, loadMemberDashboardViaApi, saveCheckInViaApi } from "@/lib/api-store";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import type { User } from "firebase/auth";
import type { FamilyWatchTarget, WatchLink } from "@/lib/types";

type AppScreen = "home" | "family" | "emergency" | "note" | "supplies" | "settings";
type StatusDialog = EmergencyStatus | "unconfirmed";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type StatusSummaryItem = {
  id: StatusDialog;
  label: string;
  count: number;
  helper: string;
};
type ConsentDoc = {
  id: "terms" | "privacy" | "disclaimer";
  title: string;
  lead: string;
  sections: Array<{ heading: string; body: string }>;
};

const storageKey = "kazoku-bosai-note-v1";

const screens: Array<{ id: AppScreen; label: string }> = [
  { id: "home", label: "確認" },
  { id: "family", label: "つながる" },
  { id: "emergency", label: "災害時" },
  { id: "note", label: "避難連絡" },
  { id: "supplies", label: "備蓄" },
  { id: "settings", label: "設定" }
];

const statusLabels: Record<EmergencyStatus, string> = {
  safe: "無事",
  need_help: "要支援",
  unavailable: "返信困難"
};

const statusMessages: Record<EmergencyStatus, string> = {
  safe: "無事です。落ち着いたら詳しく連絡します。",
  need_help: "支援が必要です。安全な範囲で連絡をください。こちらの状況確認をお願いします。",
  unavailable: "返信が難しい状況です。可能になったら連絡します。"
};

const dailyCheckInMessage = "今日も無事です。いつも通り過ごしています。";
const consentStorageKey = "anpi-note-privacy-consent-v1";

const consentDocs: ConsentDoc[] = [
  {
    id: "terms",
    title: "利用規約",
    lead:
      "安否確認ノートは、日常の見守りと家族の防災情報を整理し、いざという時の状況共有を助けるサービスです。災害の予測、救助、医療判断、生命または身体の安全を保証するものではありません。",
    sections: [
      {
        heading: "利用目的",
        body:
          "利用者は、家族メンバー、緊急連絡先、避難場所、備蓄、医療や配慮事項などを自身の責任で登録し、家族内の話し合いと準備の補助として利用します。"
      },
      {
        heading: "緊急モード",
        body:
          "SOS、無事、要支援、返信困難などの記録や共有文は、家族間の連絡を補助するものです。通信環境や端末状態により共有できない場合があります。必要に応じて電話、災害用伝言板、公的機関、近隣や親族への連絡を併用してください。"
      },
      {
        heading: "位置情報の扱い",
        body:
          "本サービスは常時位置追跡を行いません。位置情報の共有は、緊急時または本人が明示的に操作した場合に限ります。利用者は、共有先と共有内容を確認した上で利用してください。"
      },
      {
        heading: "未成年の利用",
        body:
          "未成年が利用する場合は、保護者の同意と管理のもとで利用してください。未成年の単独利用を前提としたサービスではありません。保護者は、連絡先、共有先、位置情報共有の利用有無を確認してください。"
      },
      {
        heading: "禁止事項",
        body:
          "本人や家族の同意なく個人情報を登録する行為、虚偽情報の登録、第三者への不適切な共有、サービス運営を妨げる行為を禁止します。"
      }
    ]
  },
  {
    id: "privacy",
    title: "プライバシーポリシー",
    lead:
      "安否確認ノートは、日常の見守りと家族の備えを整理し、必要な時に情報を確認しやすくするために、利用者が入力した情報を取り扱います。Phase 1では端末保存を基本とし、クラウド同期は任意機能として後続フェーズで提供します。",
    sections: [
      {
        heading: "取得する情報",
        body:
          "家族メンバーの名前、続柄、連絡先、緊急連絡先、避難場所、集合ルール、服薬、アレルギー、注意事項、備蓄品、期限、安否ステータス、緊急時の状態記録、本人が明示的に入力または共有した位置情報を扱います。"
      },
      {
        heading: "利用目的",
        body:
          "家族の情報整理、備蓄点検、緊急時の共有文作成、家族への安否共有、オフライン閲覧、利用者からの問い合わせ対応、不正利用防止のために利用します。"
      },
      {
        heading: "位置情報",
        body:
          "位置情報は初期状態では利用しません。取得または共有する場合は、緊急時のSOS発動時、または本人が明示的に共有操作した時に限ります。常時バックグラウンド位置追跡、移動履歴の蓄積、行動分析、広告利用は行いません。"
      },
      {
        heading: "保存有無と保存期間",
        body:
          "Phase 1では位置情報を運営サーバーに保存しません。位置情報は本人の端末上で取得し、本人が送信・コピー・外部共有を行う時だけ共有文に含まれます。端末内に保存した情報は、設定画面から削除できます。"
      },
      {
        heading: "第三者提供と外部送信",
        body:
          "法令に基づく場合を除き、本人の操作または同意なく第三者へ個人情報を提供しません。通知、認証、配信、解析などのSDKや外部サービスを利用する場合は、利用目的、送信先、送信される情報を画面または本ポリシーで案内します。"
      },
      {
        heading: "保存先と削除",
        body:
          "Phase 1では主に利用端末内に保存します。設定画面から端末内データを削除できます。クラウド同期を有効にする場合は、同期先、共有範囲、削除方法を画面上で案内します。"
      },
      {
        heading: "家族共有",
        body:
          "家族に共有する情報は、利用者が入力または送信操作した範囲に限ります。医療や配慮事項などの情報は、共有先を確認した上で登録してください。"
      },
      {
        heading: "未成年の利用",
        body:
          "未成年が利用する場合は、保護者の同意と管理を前提とします。家族共有や位置情報共有を使う場合も、保護者が共有範囲を確認してください。"
      }
    ]
  },
  {
    id: "disclaimer",
    title: "免責事項",
    lead:
      "安否確認ノートは、日常の見守りと家族の備えを整理し、いざという時の情報共有を助けるためのツールです。命を守る保証、救助の保証、医療判断、災害予測、公的機関への通報代行を提供するものではありません。",
    sections: [
      {
        heading: "通信と通知",
        body:
          "災害時や通信混雑時には、記録、共有、通知、同期が遅延または失敗する場合があります。家族で複数の連絡手段を事前に決めておき、電話、災害用伝言板、自治体や公的機関の情報も併用してください。"
      },
      {
        heading: "登録情報",
        body:
          "登録した避難場所、備蓄、医療や配慮事項、連絡先は、利用者自身が定期的に確認してください。古い情報や誤った情報により不利益が生じる可能性があります。"
      },
      {
        heading: "位置情報",
        body:
          "位置情報は、緊急時または利用者が明示的に共有した場合のみ扱います。Phase 1では運営サーバーへ保存せず、本人の端末上で共有文に含めるだけです。常時位置追跡、移動履歴の蓄積、行動分析は行いません。位置の正確性、到達可能性、共有先が必ず確認できることを保証するものではありません。"
      },
      {
        heading: "紙の控え",
        body:
          "印刷した控えには個人情報が含まれます。紛失、盗難、不要になった紙の廃棄に注意してください。紙の控えは、通信障害や端末故障時の補助として利用するものです。"
      }
    ]
  }
];

const supplyLabels: Record<SupplyCategory, string> = {
  water: "水",
  food: "食料",
  battery: "電源",
  medicine: "薬",
  baby: "子ども",
  pet: "ペット",
  other: "その他"
};

const supplyTemplates: Array<{ name: string; category: SupplyCategory; quantity: string; note: string }> = [
  { name: "飲料水", category: "water", quantity: "6", note: "2Lボトル。1人1日3Lを目安" },
  { name: "非常食", category: "food", quantity: "9", note: "食数または袋数。3日分を目安" },
  { name: "モバイルバッテリー", category: "battery", quantity: "1", note: "充電済み" },
  { name: "常備薬", category: "medicine", quantity: "3", note: "日分。薬名は備考に記録" },
  { name: "懐中電灯", category: "battery", quantity: "1", note: "本数" },
  { name: "乾電池", category: "battery", quantity: "8", note: "単三・単四など種類を記録" },
  { name: "携帯トイレ", category: "other", quantity: "15", note: "回数分。家族人数に合わせる" },
  { name: "ウェットティッシュ", category: "other", quantity: "1", note: "袋数" },
  { name: "救急セット", category: "medicine", quantity: "1", note: "一式" },
  { name: "現金・小銭", category: "other", quantity: "1", note: "必要分を備考に記録" },
  { name: "身分証コピー", category: "other", quantity: "1", note: "家族分" },
  { name: "おむつ・ミルク", category: "baby", quantity: "1", note: "必要量を備考に記録" },
  { name: "ペット用品", category: "pet", quantity: "1", note: "必要量を備考に記録" }
];

const officialInfoLinks = [
  {
    title: "避難所・ハザードマップ",
    source: "国土交通省 ハザードマップポータル",
    href: "https://disaportal.gsi.go.jp/",
    note: "自宅や学校、職場周辺の洪水・土砂災害・津波などのリスク確認に使えます。"
  },
  {
    title: "天気・警報注意報",
    source: "気象庁 天気",
    href: "https://www.jma.go.jp/bosai/forecast/",
    note: "最新の天気予報や警報・注意報を確認できます。"
  },
  {
    title: "地震・津波情報",
    source: "気象庁 地震情報",
    href: "https://www.jma.go.jp/bosai/map.html#contents=earthquake_map",
    note: "震度、震源、津波に関する公式情報を確認できます。"
  },
  {
    title: "国の防災情報",
    source: "内閣府 防災情報",
    href: "https://www.bousai.go.jp/",
    note: "災害情報、防災資料、家庭や地域の備えに関する情報を確認できます。"
  },
  {
    title: "防災ブック",
    source: "東京都 東京防災・東京くらし防災",
    href: "https://www.bousai.metro.tokyo.lg.jp/1028036/1028197/index.html",
    note: "家庭で話し合う内容や備蓄、発災時の行動を見直す参考になります。"
  }
];

function formatDate(value: string) {
  if (!value) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function daysUntil(value: string) {
  if (!value) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeSupplyItem(item: SupplyItem): SupplyItem {
  if (/^\d+$/.test(item.quantity)) {
    return { ...item, note: item.note || "" };
  }

  const match = item.quantity.match(/^(\d+)(.*)$/);
  if (match && Number(match[1]) > 0) {
    const oldNote = match[2].trim();
    return {
      ...item,
      quantity: match[1],
      note: item.note || oldNote || item.quantity
    };
  }

  return {
    ...item,
    quantity: "1",
    note: item.note || item.quantity
  };
}

function loadLocalData(): DisasterNoteData {
  if (typeof window === "undefined") {
    return defaultDisasterNoteData;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultDisasterNoteData;
    }

    const saved = { ...defaultDisasterNoteData, ...JSON.parse(raw) } as DisasterNoteData;
    const savedSupplyNames = new Set(saved.supplyItems.map((item) => item.name));
    return {
      ...saved,
      supplyItems: [
        ...saved.supplyItems,
        ...defaultDisasterNoteData.supplyItems.filter((item) => !savedSupplyNames.has(item.name))
      ].map(normalizeSupplyItem)
    };
  } catch {
    return defaultDisasterNoteData;
  }
}

export function DisasterNoteApp() {
  const [activeScreen, setActiveScreen] = useState<AppScreen>("home");
  const [data, setData] = useState<DisasterNoteData>(defaultDisasterNoteData);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("端末に保存して、オフラインでも家族の備えを確認できます。");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberRelation, setNewMemberRelation] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [newContactLabel, setNewContactLabel] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newSupplyName, setNewSupplyName] = useState("");
  const [newSupplyCategory, setNewSupplyCategory] = useState<SupplyCategory>("food");
  const [newSupplyQuantity, setNewSupplyQuantity] = useState("");
  const [newSupplyOwnerName, setNewSupplyOwnerName] = useState("");
  const [newSupplyNote, setNewSupplyNote] = useState("");
  const [newSupplyExpiresAt, setNewSupplyExpiresAt] = useState("");
  const [selectedSupplyTemplate, setSelectedSupplyTemplate] = useState("");
  const [editingSupplyId, setEditingSupplyId] = useState<string | null>(null);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [emergencyMessage, setEmergencyMessage] = useState(defaultDisasterNoteData.templateMessages[0]);
  const [newTemplateMessage, setNewTemplateMessage] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [locationMapUrl, setLocationMapUrl] = useState("");
  const [emergencyLocationEnabled, setEmergencyLocationEnabled] = useState(false);
  const [useCustomEmergencyMessage, setUseCustomEmergencyMessage] = useState(false);
  const [selectedEmergencyStatus, setSelectedEmergencyStatus] = useState<EmergencyStatus>("safe");
  const [lastEmergencyStatus, setLastEmergencyStatus] = useState<EmergencyStatus | null>(null);
  const [reviewJustMarked, setReviewJustMarked] = useState(false);
  const [dailyJustChecked, setDailyJustChecked] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const consentDocumentRef = useRef<HTMLElement | null>(null);
  const [consentStep, setConsentStep] = useState(0);
  const [consentRead, setConsentRead] = useState<Record<ConsentDoc["id"], boolean>>({
    terms: false,
    privacy: false,
    disclaimer: false
  });
  const [consentScrolledToEnd, setConsentScrolledToEnd] = useState(false);
  const [statusDialog, setStatusDialog] = useState<StatusDialog | null>(null);
  const [familyOverviewOpen, setFamilyOverviewOpen] = useState(false);
  const [supplyOverviewOpen, setSupplyOverviewOpen] = useState(false);
  const [expiryOverviewOpen, setExpiryOverviewOpen] = useState(false);
  const [reviewOverviewOpen, setReviewOverviewOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [supplyDeleteMode, setSupplyDeleteMode] = useState(false);
  const [supplyEditMode, setSupplyEditMode] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installGuideOpen, setInstallGuideOpen] = useState(false);
  const [installingApp, setInstallingApp] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [watchName, setWatchName] = useState("");
  const [watchEmail, setWatchEmail] = useState("");
  const [watchLinks, setWatchLinks] = useState<WatchLink[]>([]);
  const [watchTargets, setWatchTargets] = useState<FamilyWatchTarget[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchAdding, setWatchAdding] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const local = loadLocalData();
    setData(local);
    setPrivacyConsent(window.localStorage.getItem(consentStorageKey) === "true");
    setReady(true);

    if (!hasFirebaseConfig()) return;
    const { auth } = getFirebaseClients();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCloudUser(user);
      if (!user) {
        setWatchLinks([]);
        setWatchTargets([]);
        return;
      }
      refreshWatchConnections(user);
      if (user && local.notificationSettings.syncEnabled) {
        const cloud = await loadDisasterNoteFromCloud(user.uid);
        if (cloud) {
          const localTime = new Date(local.lastReviewedAt || 0).getTime();
          const cloudTime = new Date(cloud.lastReviewedAt || 0).getTime();
          if (cloudTime > localTime) {
            setData(cloud);
            window.localStorage.setItem(storageKey, JSON.stringify(cloud));
          }
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean(standaloneNavigator.standalone));

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setIsStandalone(true);
      setInstallGuideOpen(false);
      setDeferredInstallPrompt(null);
      setMessage("ホーム画面に追加しました。");
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    setConsentScrolledToEnd(false);
    if (consentDocumentRef.current) {
      consentDocumentRef.current.scrollTop = 0;
    }
  }, [consentStep]);

  const expiringSupplies = useMemo(
    () =>
      data.supplyItems.filter((item) => {
        const remaining = daysUntil(item.expiresAt);
        return remaining !== null && remaining <= 30;
      }),
    [data.supplyItems]
  );
  const checkedCount = data.supplyItems.filter((item) => item.checked).length;
  const monthlyTaskDone = new Date(data.lastReviewedAt).getMonth() === new Date().getMonth();
  const latestLog = data.statusLogs[0];
  const selectedSupplyCount = data.supplyItems.filter((item) => item.checked).length;
  const supplyByOwner = useMemo(() => {
    const groups = new Map<string, SupplyItem[]>();
    data.supplyItems.forEach((item) => {
      const owner = item.ownerName?.trim() || "共通";
      groups.set(owner, [...(groups.get(owner) || []), item]);
    });
    return Array.from(groups.entries()).map(([owner, items]) => ({ owner, items }));
  }, [data.supplyItems]);
  const familyStatusCounts = useMemo(
    () => ({
      safe: data.members.filter((member) => member.latestStatus === "safe").length,
      need_help: data.members.filter((member) => member.latestStatus === "need_help").length,
      unavailable: data.members.filter((member) => member.latestStatus === "unavailable" && member.latestStatusAt).length,
      unconfirmed: data.members.filter((member) => member.latestStatus === "unavailable" && !member.latestStatusAt).length
    }),
    [data.members]
  );
  const familyStatusSummary =
    data.members.length === 0 ? "家族未登録" : `${data.members.length}人の状況を見る`;
  const statusSummaryItems: StatusSummaryItem[] = [
    {
      id: "safe",
      label: "無事",
      count: familyStatusCounts.safe,
      helper: "安否確認または有事の送信で無事と記録された家族"
    },
    {
      id: "need_help",
      label: "要支援",
      count: familyStatusCounts.need_help,
      helper: "支援が必要として送信された家族"
    },
    {
      id: "unavailable",
      label: "返信困難",
      count: familyStatusCounts.unavailable,
      helper: "本人が返信困難として送信した家族"
    },
    {
      id: "unconfirmed",
      label: "未確認",
      count: familyStatusCounts.unconfirmed,
      helper: "まだ安否ボタンや有事送信が押されていない家族"
    }
  ];
  const visibleStatusSummaryItems = statusSummaryItems.filter((item) => item.count > 0);
  const contactGroups = useMemo(() => {
    const groups = new Map<string, EmergencyContact[]>();
    data.emergencyContacts.forEach((contact) => {
      const label = contact.label.trim() || "連絡先";
      groups.set(label, [...(groups.get(label) || []), contact]);
    });
    return Array.from(groups.entries()).map(([label, contacts]) => ({ label, contacts }));
  }, [data.emergencyContacts]);
  const statusDialogMembers =
    statusDialog === "unconfirmed"
      ? data.members.filter((member) => member.latestStatus === "unavailable" && !member.latestStatusAt)
      : statusDialog
        ? data.members.filter((member) => member.latestStatus === statusDialog && (statusDialog !== "unavailable" || member.latestStatusAt))
        : [];
  const getMembersForStatus = (status: StatusDialog) =>
    status === "unconfirmed"
      ? data.members.filter((member) => member.latestStatus === "unavailable" && !member.latestStatusAt)
      : data.members.filter((member) => member.latestStatus === status && (status !== "unavailable" || member.latestStatusAt));
  const statusDialogTitle =
    statusDialog === "safe"
      ? "無事の家族"
      : statusDialog === "need_help"
        ? "要支援の家族"
        : statusDialog === "unavailable"
          ? "返信困難の家族"
          : "未確認の家族";

  function getMemberStatusLabel(member: HouseholdMember) {
    if (member.latestStatus === "unavailable" && !member.latestStatusAt) {
      return "未確認";
    }

    return statusLabels[member.latestStatus];
  }

  function updateData(next: DisasterNoteData, nextMessage = "保存しました。") {
    setData(next);
    setMessage(nextMessage);
    if (cloudUser && next.notificationSettings.syncEnabled) {
      setCloudSyncing(true);
      saveDisasterNoteToCloud(cloudUser.uid, next).then(() => {
        setCloudSyncedAt(new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
        setCloudSyncing(false);
      }).catch(() => setCloudSyncing(false));
    }
  }

  function createWatchInviteUrl(link: WatchLink) {
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
    const origin = configuredOrigin || (typeof window !== "undefined" ? window.location.origin : "https://anpinote.vercel.app");
    return `${origin}/invite/${encodeURIComponent(link.lineLinkCode)}`;
  }

  async function refreshWatchConnections(user = cloudUser) {
    if (!user) {
      return;
    }

    setWatchLoading(true);
    try {
      const [memberDashboard, targets] = await Promise.all([
        loadMemberDashboardViaApi(user),
        loadFamilyDashboardViaApi(user)
      ]);
      setWatchLinks(memberDashboard.watchLinks);
      setWatchTargets(targets);
    } catch {
      setMessage("相互見守りの情報を読み込めませんでした。通信状態を確認してください。");
    } finally {
      setWatchLoading(false);
    }
  }

  async function shareWatchInvite(link: WatchLink) {
    const inviteUrl = createWatchInviteUrl(link);
    const text = `${link.familyName}さんへ\nあんぴノートでつながる招待です。リンクを開いて承認してください。\n${inviteUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "あんぴノートでつながる", text, url: inviteUrl });
        setMessage("招待を共有しました。相手が承認すると見守りに追加されます。");
        return;
      } catch {
        setMessage("共有を中止しました。必要なら招待リンクをコピーして送れます。");
      }
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("招待リンクをコピーしました。LINEやメールで送ってください。");
    } catch {
      setMessage("招待リンクをコピーできませんでした。");
    }
  }

  async function addWatchInvite() {
    if (!cloudUser) {
      setMessage("先に設定画面でログインしてください。ログイン後に招待できます。");
      setActiveScreen("settings");
      return;
    }

    if (!watchName.trim() || !isValidEmailAddress(watchEmail)) {
      setMessage("つながる相手の名前とメールアドレスを入力してください。");
      return;
    }

    setWatchAdding(true);
    try {
      const link = await addFamilyContactViaApi(cloudUser, watchName.trim(), watchEmail.trim());
      setWatchLinks((current) => [link, ...current]);
      setWatchName("");
      setWatchEmail("");
      setMessage("招待を作成しました。リンクを送って相手に承認してもらってください。");
      await shareWatchInvite(link);
    } catch {
      setMessage("招待の作成に失敗しました。ログイン状態と通信環境を確認してください。");
    } finally {
      setWatchAdding(false);
    }
  }

  function addMember() {
    if (!newMemberName.trim()) {
      setMessage("家族の名前を入力してください。");
      return;
    }

    const member: HouseholdMember = {
      id: createId("member"),
      name: newMemberName.trim(),
      relation: newMemberRelation.trim() || "家族",
      phone: newMemberPhone.trim(),
      notes: "",
      latestStatus: "unavailable"
    };
    updateData({ ...data, members: [member, ...data.members] }, "家族を追加しました。");
    setNewMemberName("");
    setNewMemberRelation("");
    setNewMemberPhone("");
  }

  function updateMember(member: HouseholdMember, patch: Partial<HouseholdMember>) {
    updateData({
      ...data,
      members: data.members.map((item) => (item.id === member.id ? { ...item, ...patch } : item))
    });
  }

  function addEmergencyContact() {
    if (!newContactName.trim()) {
      setMessage("緊急連絡先の名前を入力してください。");
      return;
    }

    const contact: EmergencyContact = {
      id: createId("contact"),
      label: newContactLabel.trim() || "連絡先",
      name: newContactName.trim(),
      phone: newContactPhone.trim()
    };

    updateData({ ...data, emergencyContacts: [contact, ...data.emergencyContacts] }, "緊急連絡先を追加しました。");
    setNewContactLabel("");
    setNewContactName("");
    setNewContactPhone("");
  }

  function updateEmergencyContact(contact: EmergencyContact, patch: Partial<EmergencyContact>) {
    updateData({
      ...data,
      emergencyContacts: data.emergencyContacts.map((item) => (item.id === contact.id ? { ...item, ...patch } : item))
    });
  }

  function addSupply() {
    if (!newSupplyName.trim()) {
      setMessage("備蓄品名を入力してください。");
      return;
    }

    const supply: SupplyItem = {
      id: createId("supply"),
      name: newSupplyName.trim(),
      category: newSupplyCategory,
      quantity: newSupplyQuantity.trim().replace(/\D/g, "") || "1",
      ownerName: newSupplyOwnerName.trim(),
      note: newSupplyNote.trim(),
      expiresAt: newSupplyExpiresAt,
      checked: false
    };
    updateData({ ...data, supplyItems: [supply, ...data.supplyItems] }, "備蓄品を追加しました。");
    setNewSupplyName("");
    setNewSupplyQuantity("");
    setNewSupplyOwnerName("");
    setNewSupplyNote("");
    setNewSupplyExpiresAt("");
    setSelectedSupplyTemplate("");
  }

  function applySupplyTemplate(templateName: string) {
    setSelectedSupplyTemplate(templateName);
    const template = supplyTemplates.find((item) => item.name === templateName);
    if (!template) {
      return;
    }

    setNewSupplyName(template.name);
    setNewSupplyCategory(template.category);
    setNewSupplyQuantity(template.quantity);
    setNewSupplyOwnerName("");
    setNewSupplyNote(template.note);
  }

  function deleteCheckedSupplies() {
    if (!supplyDeleteMode) {
      setSupplyDeleteMode(true);
      setMessage("削除する備蓄品を選んでください。もう一度削除ボタンを押すと削除します。");
      return;
    }

    if (selectedSupplyCount === 0) {
      setMessage("削除する備蓄品にチェックを入れてください。");
      return;
    }

    updateData(
      {
        ...data,
        supplyItems: data.supplyItems.filter((item) => !item.checked)
      },
      `チェックした備蓄品を${selectedSupplyCount}件削除しました。`
    );
    setSupplyDeleteMode(false);
  }

  function updateSupply(supply: SupplyItem, patch: Partial<SupplyItem>) {
    updateData({
      ...data,
      supplyItems: data.supplyItems.map((item) => (item.id === supply.id ? { ...item, ...patch } : item))
    });
  }

  function adjustSupplyQuantity(supply: SupplyItem, delta: number) {
    const current = Number(supply.quantity) || 0;
    const next = Math.max(0, current + delta);
    updateSupply(supply, { quantity: String(next) });
  }

  function switchScreen(nextScreen: AppScreen) {
    if (nextScreen !== activeScreen) {
      setActiveScreen(nextScreen);
    }
  }

  function moveScreen(delta: number) {
    const index = screens.findIndex((screen) => screen.id === activeScreen);
    const next = screens[index + delta];
    if (next) {
      switchScreen(next.id);
    }
  }

  function handleScreenTouchStart(event: TouchEvent<HTMLElement>) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleScreenTouchEnd(event: TouchEvent<HTMLElement>) {
    if (touchStartX.current === null) {
      return;
    }

    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const diff = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(diff) < 70) {
      return;
    }

    moveScreen(diff < 0 ? 1 : -1);
  }

  function resetLocalData() {
    window.localStorage.removeItem(storageKey);
    setData(defaultDisasterNoteData);
    setSupplyDeleteMode(false);
    setSupplyEditMode(false);
    setEditingSupplyId(null);
    setResetConfirmOpen(false);
    setMessage("端末内のデータを初期化しました。");
  }

  function addPlace() {
    if (!newPlaceName.trim()) {
      setMessage("避難場所の名前を入力してください。");
      return;
    }

    updateData(
      {
        ...data,
        evacuationPlaces: [
          {
            id: createId("place"),
            name: newPlaceName.trim(),
            address: newPlaceAddress.trim(),
            note: ""
          },
          ...data.evacuationPlaces
        ]
      },
      "避難場所を追加しました。"
    );
    setNewPlaceName("");
    setNewPlaceAddress("");
  }

  function updateRule(rule: DisasterRule, body: string) {
    updateData({
      ...data,
      disasterRules: data.disasterRules.map((item) => (item.id === rule.id ? { ...item, body } : item))
    });
  }

  function updateMedical(note: MedicalNote, body: string) {
    updateData({
      ...data,
      medicalNotes: data.medicalNotes.map((item) => (item.id === note.id ? { ...item, body } : item))
    });
  }

  function chooseEmergencyStatus(status: EmergencyStatus) {
    setSelectedEmergencyStatus(status);
    if (!useCustomEmergencyMessage) {
      setEmergencyMessage(statusMessages[status]);
    }
  }

  function addTemplateMessage() {
    const text = newTemplateMessage.trim();
    if (!text) {
      setMessage("追加する文面を入力してください。");
      return;
    }

    if (data.templateMessages.includes(text) || Object.values(statusMessages).includes(text)) {
      setEmergencyMessage(text);
      setNewTemplateMessage("");
      setMessage("すでに登録済みの文面を選択しました。");
      return;
    }

    updateData({ ...data, templateMessages: [text, ...data.templateMessages] }, "送る文面のテンプレートを追加しました。");
    setEmergencyMessage(text);
    setNewTemplateMessage("");
  }

  function getEmergencyMessage(status: EmergencyStatus) {
    return useCustomEmergencyMessage ? emergencyMessage.trim() || statusMessages[status] : statusMessages[status];
  }

  function buildEmergencyShareText(status: EmergencyStatus, messageText: string) {
    const locationLine =
      emergencyLocationEnabled && manualLocation.trim()
        ? `現在地: ${manualLocation.trim()}${locationMapUrl ? `\n地図: ${locationMapUrl}` : ""}`
        : "現在地: 共有していません";

    return `【${statusLabels[status]}】\n${messageText}\n${locationLine}`;
  }

  function recordEmergencyStatus(status: EmergencyStatus, messageOverride?: string) {
    const now = new Date().toISOString();
    const member = data.members[0] || defaultDisasterNoteData.members[0];
    const messageText = messageOverride || getEmergencyMessage(status);
    setSelectedEmergencyStatus(status);
    setLastEmergencyStatus(status);
    const log: SafetyStatusLog = {
      id: createId("status"),
      memberId: member.id,
      memberName: member.name,
      status,
      message: messageText,
      locationText:
        emergencyLocationEnabled && manualLocation.trim()
          ? `${manualLocation.trim()}${locationMapUrl ? ` ${locationMapUrl}` : ""}`
          : undefined,
      createdAt: now
    };
    updateData(
      {
        ...data,
        members: data.members.map((item) =>
          item.id === member.id ? { ...item, latestStatus: status, latestStatusAt: now } : item
        ),
        statusLogs: [log, ...data.statusLogs].slice(0, 30)
      },
      `${statusLabels[status]}を記録しました。家族へ送る文面として使えます。`
    );
  }

  async function recordDailyCheckIn() {
    const now = new Date().toISOString();
    const member = data.members[0] || defaultDisasterNoteData.members[0];
    const log: SafetyStatusLog = {
      id: createId("status"),
      memberId: member.id,
      memberName: member.name,
      status: "safe",
      message: dailyCheckInMessage,
      createdAt: now
    };

    setDailyJustChecked(true);
    updateData(
      {
        ...data,
        members: data.members.map((item) =>
          item.id === member.id ? { ...item, latestStatus: "safe", latestStatusAt: now } : item
        ),
        statusLogs: [log, ...data.statusLogs].slice(0, 30)
      },
      "今日の安否確認を記録しました。"
    );

    if (cloudUser) {
      try {
        await saveCheckInViaApi(cloudUser, {
          id: `checkin-${Date.now()}`,
          memberId: cloudUser.uid,
          checkedAt: now,
          nextDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: "safe"
        });
        refreshWatchConnections(cloudUser);
      } catch {
        setMessage("端末には記録しましたが、相互見守りへの反映に失敗しました。通信状態を確認してください。");
      }
    }
  }

  function copyEmergencyText() {
    const text = buildEmergencyShareText(selectedEmergencyStatus, getEmergencyMessage(selectedEmergencyStatus));
    navigator.clipboard
      ?.writeText(text)
      .then(() => setMessage("共有文をコピーしました。LINEやメールに貼り付けて送れます。"))
      .catch(() => setMessage("共有文をコピーできませんでした。画面の文面を手動で送ってください。"));
  }

  function shareEmergencyText(status: EmergencyStatus) {
    const messageText = getEmergencyMessage(status);
    recordEmergencyStatus(status, messageText);
    const text = buildEmergencyShareText(status, messageText);

    if (navigator.share) {
      navigator
        .share({ title: "安否確認ノート", text })
        .then(() => setMessage(`${statusLabels[status]}を記録し、共有画面を開きました。`))
        .catch(() => setMessage(`${statusLabels[status]}を記録しました。共有を中止した場合は、共有文をコピーして送れます。`));
      return;
    }

    navigator.clipboard
      ?.writeText(text)
      .then(() => setMessage(`${statusLabels[status]}を記録し、共有文をコピーしました。LINEやメールに貼り付けて送れます。`))
      .catch(() => setMessage(`${statusLabels[status]}を記録しました。画面の文面を手動で送ってください。`));
  }

  function sendEmergencyUpdate() {
    const messageText = getEmergencyMessage(selectedEmergencyStatus);
    recordEmergencyStatus(selectedEmergencyStatus, messageText);
    setMessage(
      `${statusLabels[selectedEmergencyStatus]}をアプリ内に送信しました。家族状況と最新の共有に反映しました。クラウド同期前は、この端末内の記録として保存されます。`
    );
  }

  function shareFamilyInvite(member?: HouseholdMember) {
    const targetName = member?.name ? `${member.name}さん` : "家族";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://anpinote.vercel.app";
    const text = `${targetName}へ\n安否確認ノートで家族の連絡先、避難場所、備蓄、緊急時の安否共有を一緒に確認しましょう。\n${origin}\n\n※現時点では端末内保存が中心です。自動同期は今後のクラウド同期機能で対応予定です。`;

    if (navigator.share) {
      navigator
        .share({ title: "安否確認ノートへの招待", text, url: origin })
        .then(() => setMessage("招待の共有画面を開きました。LINEやメールを選んで送れます。"))
        .catch(() => setMessage("共有を中止しました。必要なら招待文をコピーできます。"));
      return;
    }

    navigator.clipboard
      ?.writeText(text)
      .then(() => setMessage("招待文をコピーしました。LINEやメールに貼り付けて送れます。"))
      .catch(() => setMessage("招待文をコピーできませんでした。アプリURLを家族へ送ってください。"));
  }

  function fillCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("この端末またはブラウザでは現在地取得を利用できません。手動で場所を入力してください。");
      return;
    }

    setMessage("現在地の取得許可を確認しています。許可した場合のみ、今回の共有文に使います。");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const locationText = `緯度 ${latitude.toFixed(5)}, 経度 ${longitude.toFixed(5)}`;
        const mapUrl = `https://www.google.com/maps?q=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
        setManualLocation(locationText);
        setLocationMapUrl(mapUrl);
        setMessage("現在地を入力しました。共有文にGoogleマップで開ける地図リンクを含めます。常時追跡や履歴保存は行いません。");
      },
      () => setMessage("現在地を取得できませんでした。許可設定を確認するか、場所を手動で入力してください。"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  }

  function toggleLocationShare() {
    if (emergencyLocationEnabled) {
      setEmergencyLocationEnabled(false);
      setManualLocation("");
      setLocationMapUrl("");
      setMessage("今回の位置共有をOFFにしました。");
      return;
    }

    setEmergencyLocationEnabled(true);
    setMessage("今回だけ位置共有をONにしました。現在地の取得許可を確認します。取得後も、送信するまで家族には共有されません。");
    fillCurrentLocation();
  }

  function markReviewed() {
    setReviewJustMarked(true);
    updateData({ ...data, lastReviewedAt: new Date().toISOString() }, "今月の確認を記録しました。");
  }

  function updatePrivacyConsent(checked: boolean) {
    setPrivacyConsent(checked);
    window.localStorage.setItem(consentStorageKey, checked ? "true" : "false");
    setMessage(checked ? "位置情報と家族共有の方針への同意を記録しました。" : "同意を解除しました。位置共有は必要な時だけ手動でONにしてください。");
  }

  function handleConsentScroll(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const reachedEnd = target.scrollTop + target.clientHeight >= target.scrollHeight - 12;
    if (reachedEnd) {
      setConsentScrolledToEnd(true);
    }
  }

  function acceptCurrentConsentDoc() {
    const doc = consentDocs[consentStep];
    setConsentScrolledToEnd(false);
    setConsentRead((current) => ({ ...current, [doc.id]: true }));

    if (consentStep < consentDocs.length - 1) {
      if (consentDocumentRef.current) {
        consentDocumentRef.current.scrollTop = 0;
      }
      setConsentStep((current) => current + 1);
      return;
    }

    updatePrivacyConsent(true);
  }

  function printSafetyNote() {
    setMessage("印刷画面を開きます。紙に残して、スマホが使えない時の控えにできます。");
    window.print();
  }

  async function handleCloudSignIn() {
    if (!hasFirebaseConfig()) return;
    setAuthError("");
    try {
      const { auth } = getFirebaseClients();
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setAuthEmail("");
      setAuthPassword("");
      setMessage("クラウドアカウントにログインしました。同期を有効にするとデータが自動でバックアップされます。");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "エラーが発生しました";
      setAuthError(msg.includes("wrong-password") || msg.includes("invalid-credential") ? "メールアドレスまたはパスワードが違います。" : msg.includes("email-already-in-use") ? "このメールアドレスはすでに登録済みです。" : "ログインに失敗しました。入力内容を確認してください。");
    }
  }

  async function handleCloudSignOut() {
    if (!hasFirebaseConfig()) return;
    try {
      const { auth } = getFirebaseClients();
      await signOut(auth);
      setCloudSyncedAt(null);
      setMessage("ログアウトしました。端末内のデータはそのまま残ります。");
    } catch {
      setMessage("ログアウトに失敗しました。");
    }
  }

  async function handleInstallApp() {
    if (isStandalone) {
      setMessage("すでにホーム画面から起動しています。");
      return;
    }

    setInstallingApp(true);
    try {
      if (deferredInstallPrompt) {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        setDeferredInstallPrompt(null);
        setMessage(choice.outcome === "accepted" ? "ホーム画面に追加しました。" : "ホーム画面追加をキャンセルしました。");
        if (choice.outcome === "dismissed") {
          setInstallGuideOpen(true);
        }
        return;
      }

      setInstallGuideOpen(true);
      setMessage("このブラウザでは追加画面を自動表示できません。手順を表示しました。");
    } catch {
      setInstallGuideOpen(true);
      setMessage("追加画面を開けませんでした。手順を表示しました。");
    } finally {
      setInstallingApp(false);
    }
  }

  if (!ready) {
    return (
      <main className="phone-app disaster-app">
        <p className="app-message">読み込み中です。</p>
      </main>
    );
  }

  if (!privacyConsent) {
    const currentConsentDoc = consentDocs[consentStep];
    const allConsentRead = consentDocs.every((doc) => consentRead[doc.id]);
    const isLastConsentDoc = consentStep === consentDocs.length - 1;

    return (
      <main className="phone-app disaster-app consent-gate">
        <header className="app-header">
          <div className="brand-row">
            <img src="/icon.svg" alt="安否確認ノート" className="app-icon" />
            <div>
              <p className="eyebrow">はじめに確認してください</p>
              <h1>安否確認ノート</h1>
            </div>
          </div>
        </header>
        <section className="panel consent-panel">
          <p className="panel-label">プライバシーと利用条件</p>
          <h2>すべて確認すると利用を開始できます</h2>
          <p className="small-copy">
            各文書を最後までスクロールすると同意ボタンが表示されます。3つすべて確認するとアプリを開始できます。
          </p>
          <div className="consent-progress" aria-label="同意確認の進捗">
            {consentDocs.map((doc, index) => (
              <span
                key={doc.id}
                className={`${index === consentStep ? "is-current" : ""} ${consentRead[doc.id] ? "is-done" : ""}`}
              >
                {consentRead[doc.id] ? "確認済み" : `${index + 1}. ${doc.title}`}
              </span>
            ))}
          </div>
          <article key={currentConsentDoc.id} className="consent-document" ref={consentDocumentRef} onScroll={handleConsentScroll}>
            <p className="panel-label">{consentStep + 1} / {consentDocs.length}</p>
            <h3>{currentConsentDoc.title}</h3>
            <p>{currentConsentDoc.lead}</p>
            {currentConsentDoc.sections.map((section) => (
              <section key={section.heading}>
                <h4>{section.heading}</h4>
                <p>{section.body}</p>
              </section>
            ))}
            <div className="consent-end-marker">
              {currentConsentDoc.title}の最後まで表示しました。
            </div>
          </article>
          {consentScrolledToEnd ? (
            <button type="button" className="wide-action" onClick={acceptCurrentConsentDoc}>
              {isLastConsentDoc ? "すべて同意して開始する" : `${currentConsentDoc.title}に同意して次へ`}
            </button>
          ) : (
            <p className="consent-scroll-hint">下までスクロールすると同意ボタンが表示されます。</p>
          )}
          <p className="small-copy">
            {allConsentRead
              ? "すべての確認が完了しています。"
              : "同意後も、設定画面からプライバシー方針とデータ削除方法を確認できます。"}
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="phone-app disaster-app">
      <header className="app-header">
        <div className="brand-row">
          <img src="/icon.svg" alt="安否確認ノート" className="app-icon" />
          <div>
            <p className="eyebrow">日常の見守りと家族の備え</p>
            <h1>安否確認ノート</h1>
          </div>
        </div>
        <button type="button" className={installingApp ? "install-button is-busy" : "install-button"} onClick={handleInstallApp} disabled={installingApp || isStandalone}>
          {isStandalone ? "追加済み" : installingApp ? "処理中" : "アプリ追加"}
        </button>
      </header>

      <p className="app-message">{message}</p>

      <section className="app-screen" aria-label="安否確認ノート" onTouchStart={handleScreenTouchStart} onTouchEnd={handleScreenTouchEnd}>
        <div className="screens-track" style={{ transform: `translateX(${-screens.findIndex((s) => s.id === activeScreen) * 100}%)` }}>
        <div className="screen-page" aria-hidden={activeScreen !== "home"}>
          <section className={dailyJustChecked ? "status-panel daily-check-panel checkin-complete" : "status-panel daily-check-panel"}>
            <p className="panel-label">日常の安否確認</p>
            <h2>{dailyJustChecked ? "今日の安否確認が完了しました" : "無事を家族に残す"}</h2>
            <button
              type="button"
              className={dailyJustChecked ? "checkin-button is-complete" : "checkin-button"}
              onClick={recordDailyCheckIn}
            >
              無事です
            </button>
            <p className="checkin-feedback">
              {dailyJustChecked ? `最終安否確認: ${formatDate(data.members[0]?.latestStatusAt || data.statusLogs[0]?.createdAt || "")}` : "日常でも、急いで無事だけ伝えたい時でも使えます。下の人数表示にも反映されます。"}
            </p>
          </section>

          <section className="status-panel disaster-home">
            <p className="panel-label">今日の安否ステータス</p>
            <h2>{monthlyTaskDone ? "今月の備え確認は完了しています" : "今月の備え確認をしましょう"}</h2>
            <div className="metric-grid">
              <button type="button" className="family-status-metric" onClick={() => setFamilyOverviewOpen(true)}>
                <span>家族の状況</span>
                <ul className="status-mini-list">
                  {visibleStatusSummaryItems.length > 0 ? (
                    visibleStatusSummaryItems.map((item) => (
                      <li key={item.id}>{item.label} {item.count}人</li>
                    ))
                  ) : (
                    <li>まだ状況記録がありません</li>
                  )}
                </ul>
              </button>
              <button type="button" onClick={() => setReviewOverviewOpen(true)}>
                <span>備えの確認日</span>
                <strong>{formatDate(data.lastReviewedAt)}</strong>
              </button>
              <button type="button" onClick={() => setSupplyOverviewOpen(true)}>
                <span>備蓄</span>
                <strong>{data.supplyItems.length}件</strong>
              </button>
              <button type="button" onClick={() => setExpiryOverviewOpen(true)}>
                <span>期限注意</span>
                <strong>{expiringSupplies.length}件</strong>
              </button>
            </div>
            <button type="button" className="checkin-button emergency-launch" onClick={() => setActiveScreen("emergency")}>
              有事の安否共有
            </button>
          </section>

          <section className="panel compact-panel review-memo-panel" hidden>
            <p className="panel-label">家族確認メモ</p>
            <h2>{monthlyTaskDone ? "今月の備え確認が完了しています" : "今月、家族で確認すること"}</h2>
            <ul className="compact-list">
              <li>集合場所と連絡手順を確認</li>
              <li>備蓄の期限と数量を確認</li>
              <li>服薬、アレルギー、注意事項を更新</li>
            </ul>
            <p className={reviewJustMarked ? "review-feedback is-complete" : "review-feedback"}>
              家族で確認した日: {formatDate(data.lastReviewedAt)}
            </p>
            <button type="button" className={reviewJustMarked ? "wide-action is-complete" : "wide-action"} onClick={markReviewed}>
              {reviewJustMarked ? "備え確認を完了しました" : "備え確認を完了にする"}
            </button>
          </section>

          <section className="panel compact-panel latest-share-panel" hidden>
            <p className="panel-label">最新の共有</p>
            <h2>{latestLog ? `${latestLog.memberName}さん: ${statusLabels[latestLog.status]}` : "まだ記録がありません"}</h2>
            {latestLog ? <p className="latest-share-meta">{formatDate(latestLog.createdAt)} の記録</p> : null}
            <p>{latestLog ? latestLog.message : "有事の状態共有を記録するとここに表示されます。"}</p>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">紙の控え</p>
            <h2>スマホが使えない時に備える</h2>
            <p>家族、緊急連絡先、避難場所、備蓄、医療メモを紙に残せます。</p>
            <button type="button" className="wide-action" onClick={printSafetyNote}>
              紙に印刷する
            </button>
          </section>
        </div>

        <div className="screen-page" aria-hidden={activeScreen !== "family"}>
          <section className="panel compact-panel family-status-panel">
            <p className="panel-label">家族の状況</p>
            <h2>誰がどの状況か</h2>
            <div className="member-status-list">
              {data.members.map((member) => (
                <article className="member-status-row" key={member.id}>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.relation} / {member.latestStatusAt ? formatDate(member.latestStatusAt) : "まだ記録なし"}</span>
                  </div>
                  <button
                    type="button"
                    className={`status-pill ${member.latestStatus === "safe" ? "success" : "warning"}`}
                    onClick={() => setStatusDialog(member.latestStatus === "unavailable" && !member.latestStatusAt ? "unconfirmed" : member.latestStatus)}
                  >
                    {getMemberStatusLabel(member)}
                  </button>
                </article>
              ))}
            </div>
            <p className="small-copy">未確認はまだ誰も安否を押していない状態、返信困難は本人が返信困難として送信した状態です。</p>
          </section>

          <section className="panel">
            <p className="panel-label">家族</p>
            <h2>家族メンバー</h2>
            <p className="small-copy">
              家族を追加したら、招待をLINEやメールで送れます。今は端末内保存が中心のため、自動で同じデータが同期されるのはPhase 2のクラウド同期からです。
            </p>
            <div className="mutual-watch-card">
              <div>
                <p className="panel-label">つながる</p>
                <h3>家族・グループとつながる</h3>
                <p>相手に招待リンクを送り、承認されるとお互いの安否確認を見られます。相互に見守る場合は承認画面で「自分も相手に見守ってもらう」を選びます。</p>
              </div>
              <button type="button" onClick={() => cloudUser ? refreshWatchConnections(cloudUser) : setActiveScreen("settings")}>
                {cloudUser ? "更新する" : "ログインする"}
              </button>
            </div>
            <div className="connect-form">
              <input value={watchName} onChange={(event) => setWatchName(event.target.value)} placeholder="つながる相手の名前" />
              <input value={watchEmail} onChange={(event) => setWatchEmail(event.target.value)} placeholder="相手のメールアドレス" type="email" />
              <button type="button" className={watchAdding ? "is-busy" : ""} onClick={addWatchInvite} disabled={watchAdding}>
                {watchAdding ? "招待作成中..." : "招待してつながる"}
              </button>
            </div>
            <div className="connection-list">
              {watchLoading ? <p className="small-copy">つながりを確認中です...</p> : null}
              {watchTargets.length ? (
                <section className="connection-group">
                  <h3>見守っている相手</h3>
                  {watchTargets.map((target) => (
                    <article className="connection-row" key={target.link.id}>
                      <div>
                        <strong>{target.member.displayName}</strong>
                        <span>{target.latestCheckIn ? `最終確認 ${formatDate(target.latestCheckIn.checkedAt)}` : "まだ確認記録なし"}</span>
                      </div>
                      <span className="pill success">承認済み</span>
                    </article>
                  ))}
                </section>
              ) : null}
              {watchLinks.length ? (
                <section className="connection-group">
                  <h3>招待した相手</h3>
                  {watchLinks.map((link) => (
                    <article className="connection-row" key={link.id}>
                      <div>
                        <strong>{link.familyName}</strong>
                        <span>{link.familyEmail}</span>
                      </div>
                      <button type="button" className="secondary-action" onClick={() => shareWatchInvite(link)}>
                        {link.inviteStatus === "accepted" || link.active ? "再共有" : "招待を送る"}
                      </button>
                    </article>
                  ))}
                </section>
              ) : null}
            </div>
            <div className="watch-trial-card">
              <div>
                <p className="panel-label">検証用</p>
                <h3>相互見守りを試す</h3>
                <p>メール登録、家族招待、承認、見守り対象一覧の流れをFirebase側で確認できます。</p>
              </div>
              <a href="/watch">開く</a>
            </div>
            <button type="button" className="wide-action family-share-action" onClick={() => shareFamilyInvite()}>
              家族へ招待を送る
            </button>
            <div className="family-add-form">
              <input value={newMemberName} onChange={(event) => setNewMemberName(event.target.value)} placeholder="名前" />
              <input value={newMemberRelation} onChange={(event) => setNewMemberRelation(event.target.value)} placeholder="続柄" />
              <input value={newMemberPhone} onChange={(event) => setNewMemberPhone(event.target.value)} placeholder="緊急連絡先" />
              <button type="button" onClick={addMember}>追加</button>
            </div>
            <div className="family-list">
              {data.members.map((member) => (
                <article className="family-item family-item-compact disaster-card" key={member.id}>
                  <div className="family-item-main">
                    <div>
                      <h3>{member.name}</h3>
                      <p>{member.relation} / {member.phone || "連絡先未設定"}</p>
                    </div>
                    <span className={`pill ${member.latestStatus === "safe" ? "success" : "warning"}`}>
                      {getMemberStatusLabel(member)}
                    </span>
                  </div>
                  <details className="member-detail">
                    <summary>メモ・招待</summary>
                    <button type="button" className="secondary-action member-share-button" onClick={() => shareFamilyInvite(member)}>
                      この人へ招待を送る
                    </button>
                    <textarea
                      value={member.notes}
                      onChange={(event) => updateMember(member, { notes: event.target.value })}
                      placeholder="注意事項、迎えのルール、連絡の優先順"
                    />
                  </details>
                </article>
              ))}
            </div>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">緊急連絡先</p>
            <h2>連絡先リスト</h2>
            <p className="small-copy">親族、学校、かかりつけ医、近所の協力者などを登録できます。</p>
            <div className="family-add-form contact-add-form">
              <input value={newContactLabel} onChange={(event) => setNewContactLabel(event.target.value)} placeholder="種類 例: 親族" />
              <input value={newContactName} onChange={(event) => setNewContactName(event.target.value)} placeholder="名前" />
              <input value={newContactPhone} onChange={(event) => setNewContactPhone(event.target.value)} placeholder="電話番号" />
              <button type="button" onClick={addEmergencyContact}>追加</button>
            </div>
            {data.emergencyContacts.map((contact) => (
              <article className="contact-edit-row" key={contact.id}>
                <input value={contact.label} onChange={(event) => updateEmergencyContact(contact, { label: event.target.value })} aria-label="連絡先の種類" />
                <input value={contact.name} onChange={(event) => updateEmergencyContact(contact, { name: event.target.value })} aria-label="連絡先名" />
                <input value={contact.phone} onChange={(event) => updateEmergencyContact(contact, { phone: event.target.value })} aria-label="電話番号" />
              </article>
            ))}
          </section>

        </div>

        <div className="screen-page" aria-hidden={activeScreen !== "emergency"}>
          <section className="status-panel emergency-panel">
            <p className="panel-label">緊急モード</p>
            <h2>今の状況を送る</h2>
            <p className="small-copy">
              状況を選び、必要なら位置情報を含めます。送信後、家族状況に反映されます。
            </p>
            <div className="emergency-actions">
              <button
                type="button"
                className={selectedEmergencyStatus === "safe" ? "is-selected" : ""}
                onClick={() => chooseEmergencyStatus("safe")}
              >
                無事
              </button>
              <button
                type="button"
                className={`warning-action ${selectedEmergencyStatus === "need_help" ? "is-selected" : ""}`}
                onClick={() => chooseEmergencyStatus("need_help")}
              >
                要支援
              </button>
              <button
                type="button"
                className={`quiet-action ${selectedEmergencyStatus === "unavailable" ? "is-selected" : ""}`}
                onClick={() => chooseEmergencyStatus("unavailable")}
              >
                返信困難
              </button>
            </div>
            <div className="auto-message-preview emergency-message-preview">
              <span>送信される内容</span>
              <strong>{buildEmergencyShareText(selectedEmergencyStatus, getEmergencyMessage(selectedEmergencyStatus))}</strong>
            </div>
            <div className="location-share-card">
              <div>
                <p className="panel-label">位置情報</p>
                <h3>{emergencyLocationEnabled ? "今回だけ共有文に含める" : "共有しない"}</h3>
                <p>
                  位置共有は初期OFFです。ONを押した時だけ本人のスマホで現在地を取得し、運営サーバーへは送らず、送信する文面にだけ含めます。
                  <button type="button" className="inline-link-button" onClick={() => setActiveScreen("settings")}>詳しい説明</button>
                </p>
              </div>
              <button
                type="button"
                className={emergencyLocationEnabled ? "secondary-action is-selected" : "secondary-action"}
                onClick={toggleLocationShare}
              >
                {emergencyLocationEnabled ? "位置共有ON" : "現在地を取得してON"}
              </button>
            </div>
            {emergencyLocationEnabled ? (
              <div className="location-tools">
                <input
                  value={manualLocation}
                  onChange={(event) => {
                    setManualLocation(event.target.value);
                    setLocationMapUrl("");
                  }}
                  placeholder="例: 自宅、駅前、避難所名"
                />
                {locationMapUrl ? (
                  <a className="map-preview" href={locationMapUrl} target="_blank" rel="noreferrer">
                    Googleマップで現在地を開く
                  </a>
                ) : (
                  <p className="small-copy">許可後に現在地が入ります。取得できない場合は手動で場所を入力できます。</p>
                )}
              </div>
            ) : null}
            <div className="message-actions">
              <button type="button" className="wide-action" onClick={sendEmergencyUpdate}>
                アプリ内に送信する
              </button>
              <button type="button" className="secondary-action" onClick={() => shareEmergencyText(selectedEmergencyStatus)}>
                LINE・メールでも送る
              </button>
              <button type="button" className="secondary-action" onClick={copyEmergencyText}>共有文をコピー</button>
            </div>
          </section>
          <section className="panel compact-panel emergency-extra-panel">
            <div className="message-mode">
              <button
                type="button"
                className="message-toggle-button"
                onClick={() => {
                  const next = !useCustomEmergencyMessage;
                  setUseCustomEmergencyMessage(next);
                  if (!next) {
                    setEmergencyMessage(statusMessages[selectedEmergencyStatus]);
                  }
                }}
              >
                <span>{useCustomEmergencyMessage ? "-" : "+"}</span>
                送る文面を自分で調整する
              </button>
            </div>
            {useCustomEmergencyMessage ? (
              <div className="custom-message-box">
                <label className="field-label" htmlFor="emergency-template">送る文面</label>
                <select id="emergency-template" value={emergencyMessage} onChange={(event) => setEmergencyMessage(event.target.value)}>
                  {Array.from(new Set([...Object.values(statusMessages), ...data.templateMessages])).map((template) => (
                    <option key={template} value={template}>{template}</option>
                  ))}
                </select>
                <textarea value={emergencyMessage} onChange={(event) => setEmergencyMessage(event.target.value)} />
                <div className="template-add-form">
                  <input
                    value={newTemplateMessage}
                    onChange={(event) => setNewTemplateMessage(event.target.value)}
                    placeholder="よく使う文面を追加"
                  />
                  <button type="button" onClick={addTemplateMessage}>追加</button>
                </div>
              </div>
            ) : null}
            <p className="small-copy">位置情報は常時追跡しません。本人が明示的に操作した時だけ、この端末上で共有文に含めます。運営サーバーへは送信しません。</p>
            <p className="small-copy">救助や安全を保証するものではありません。必要な場合は公的な窓口や身近な人へ連絡してください。</p>
          </section>
        </div>

        <div className="screen-page" aria-hidden={activeScreen !== "note"}>
          <section className="panel">
            <p className="panel-label">防災ノート</p>
            <h2>避難場所</h2>
            <div className="family-add-form">
              <input value={newPlaceName} onChange={(event) => setNewPlaceName(event.target.value)} placeholder="避難場所名" />
              <input value={newPlaceAddress} onChange={(event) => setNewPlaceAddress(event.target.value)} placeholder="住所・目印" />
              <button type="button" onClick={addPlace}>追加</button>
            </div>
            {data.evacuationPlaces.map((place) => (
              <article className="note-item" key={place.id}>
                <h3>{place.name}</h3>
                <p>{place.address || "住所未設定"}</p>
                <textarea
                  value={place.note}
                  onChange={(event) =>
                    updateData({
                      ...data,
                      evacuationPlaces: data.evacuationPlaces.map((item) =>
                        item.id === place.id ? { ...item, note: event.target.value } : item
                      )
                    })
                  }
                  placeholder="集合ルールや注意事項"
                />
              </article>
            ))}
          </section>

          <section className="panel">
            <p className="panel-label">家族のルール</p>
            <h2>連絡と集合</h2>
            {data.disasterRules.map((rule) => (
              <article className="note-item" key={rule.id}>
                <h3>{rule.title}</h3>
                <textarea value={rule.body} onChange={(event) => updateRule(rule, event.target.value)} />
              </article>
            ))}
          </section>

          <section className="panel">
            <p className="panel-label">医療・配慮</p>
            <h2>服薬や注意事項</h2>
            {data.medicalNotes.map((note) => (
              <article className="note-item" key={note.id}>
                <h3>{note.memberName}</h3>
                <textarea value={note.body} onChange={(event) => updateMedical(note, event.target.value)} />
              </article>
            ))}
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">公的情報</p>
            <h2>防災・気象リンク</h2>
            <p className="small-copy">最新情報は公式サイトで確認してください。アプリ内では、家族で確認した内容をノートに残す使い方を想定しています。</p>
            <div className="official-link-list">
              {officialInfoLinks.map((link) => (
                <a className="official-link-card" href={link.href} target="_blank" rel="noreferrer" key={link.href}>
                  <span>{link.title}</span>
                  <strong>{link.source}</strong>
                  <small>{link.note}</small>
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="screen-page" aria-hidden={activeScreen !== "supplies"}>
          <section className="panel">
            <p className="panel-label">備蓄チェック</p>
            <h2>持ち出し品と備蓄</h2>
            <div className="supply-mode-actions">
              <button
                type="button"
                className={supplyEditMode ? "secondary-action" : "secondary-action supply-edit-toggle"}
                onClick={() => {
                  setSupplyEditMode(!supplyEditMode);
                  if (supplyEditMode) setEditingSupplyId(null);
                }}
              >
                {supplyEditMode ? "編集を終わる" : "数量・内容を編集する"}
              </button>
            </div>
            <p className="small-copy">{supplyEditMode ? "数量の増減や詳細の編集ができます。削除は右下のボタンから。" : "品名、分類、数量を一覧で確認できます。変更する時は「数量・内容を編集する」をタップ。"}</p>
            <details className="add-details">
              <summary>備蓄品を追加</summary>
              <div className="family-add-form">
                <select value={newSupplyOwnerName} onChange={(event) => setNewSupplyOwnerName(event.target.value)}>
                  <option value="">共通</option>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.name}>{member.name}さん用</option>
                  ))}
                </select>
                <select value={selectedSupplyTemplate} onChange={(event) => applySupplyTemplate(event.target.value)}>
                  <option value="">防災品テンプレートから選ぶ</option>
                  {supplyTemplates.map((template) => (
                    <option key={template.name} value={template.name}>{template.name}</option>
                  ))}
                </select>
                <input value={newSupplyName} onChange={(event) => setNewSupplyName(event.target.value)} placeholder="品名" />
                <select value={newSupplyCategory} onChange={(event) => setNewSupplyCategory(event.target.value as SupplyCategory)}>
                  {Object.entries(supplyLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input value={newSupplyQuantity} onChange={(event) => setNewSupplyQuantity(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="数量 例: 6" />
                <input value={newSupplyNote} onChange={(event) => setNewSupplyNote(event.target.value)} placeholder="備考 例: 2Lボトル、単三電池" />
                <input value={newSupplyExpiresAt} onChange={(event) => setNewSupplyExpiresAt(event.target.value)} type="date" />
                <button type="button" onClick={addSupply}>追加</button>
              </div>
            </details>
            <div className="supply-delete-actions">
              <button type="button" className="danger-button supply-delete-button" onClick={deleteCheckedSupplies}>
                {supplyDeleteMode ? `選択した備蓄品を削除${selectedSupplyCount > 0 ? ` (${selectedSupplyCount}件)` : ""}` : "削除する項目を選ぶ"}
              </button>
              {supplyDeleteMode ? (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setSupplyDeleteMode(false);
                    updateData({
                      ...data,
                      supplyItems: data.supplyItems.map((item) => ({ ...item, checked: false }))
                    }, "削除選択を解除しました。");
                  }}
                >
                  キャンセル
                </button>
              ) : null}
            </div>
            <div className="supply-list compact-supply-list">
              {data.supplyItems.map((item) => {
                const remaining = daysUntil(item.expiresAt);
                const expiryText = !item.expiresAt
                  ? "消費期限未設定"
                  : remaining === null
                    ? "消費期限未設定"
                    : remaining < 0
                      ? "消費期限切れ"
                      : remaining === 0
                        ? "本日が消費期限"
                        : `あと${remaining}日で消費期限`;
                return (
                  <article className={supplyDeleteMode && item.checked ? "supply-row is-selected-for-delete" : "supply-row"} key={item.id}>
                    {supplyDeleteMode ? (
                      <input
                        type="checkbox"
                        checked={item.checked}
                        aria-label={`${item.name}を削除対象にする`}
                        onChange={(event) => updateSupply(item, { checked: event.target.checked })}
                      />
                    ) : null}
                    {supplyEditMode && editingSupplyId === item.id ? (
                      <div className="supply-main supply-editor">
                        <input value={item.name} onChange={(event) => updateSupply(item, { name: event.target.value })} aria-label="備蓄品名" />
                        <div className="supply-edit-grid">
                          <select value={item.category} onChange={(event) => updateSupply(item, { category: event.target.value as SupplyCategory })} aria-label="分類">
                            {Object.entries(supplyLabels).map(([value, label]) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                          <input value={item.quantity} onChange={(event) => updateSupply(item, { quantity: event.target.value.replace(/\D/g, "") || "0" })} inputMode="numeric" aria-label="数量" />
                          <input value={item.expiresAt} onChange={(event) => updateSupply(item, { expiresAt: event.target.value })} type="date" aria-label="消費期限" />
                        </div>
                        <input value={item.note || ""} onChange={(event) => updateSupply(item, { note: event.target.value })} aria-label="備考" placeholder="備考 例: 2Lボトル、単三電池" />
                        <button type="button" className="secondary-action" onClick={() => setEditingSupplyId(null)}>編集を閉じる</button>
                      </div>
                    ) : (
                      <div className="supply-main">
                        <strong>{item.name}</strong>
                        <span>{supplyLabels[item.category]} / 数量 {item.quantity}</span>
                        {item.ownerName ? <small>{item.ownerName}さん用</small> : null}
                        {item.note ? <small>{item.note}</small> : null}
                        {supplyEditMode ? (
                          <div className="quantity-actions">
                            <button type="button" onClick={() => adjustSupplyQuantity(item, -1)}>-1</button>
                            <button type="button" onClick={() => adjustSupplyQuantity(item, 1)}>+1</button>
                            <button type="button" onClick={() => setEditingSupplyId(item.id)}>詳細編集</button>
                          </div>
                        ) : null}
                      </div>
                    )}
                    <span className={remaining !== null && remaining <= 30 ? "pill warning" : "pill"}>
                      {expiryText}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className="screen-page" aria-hidden={activeScreen !== "settings"}>
          <section className="panel">
            <p className="panel-label">設定</p>
            <h2>保存と通知</h2>
            <label className="check-row">
              <input
                type="checkbox"
                checked={data.notificationSettings.monthlyReview}
                onChange={(event) =>
                  updateData({
                    ...data,
                    notificationSettings: { ...data.notificationSettings, monthlyReview: event.target.checked }
                  })
                }
              />
              <span>月1回の見直しリマインドを使う</span>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={data.notificationSettings.syncEnabled}
                onChange={(event) =>
                  updateData({
                    ...data,
                    notificationSettings: { ...data.notificationSettings, syncEnabled: event.target.checked }
                  }, event.target.checked ? "クラウド同期を有効にしました。ログイン済みの場合は自動でバックアップされます。" : "クラウド同期をOFFにしました。")
                }
              />
              <span>クラウド同期を使う</span>
            </label>
            <p className="small-copy">端末保存が基本です。クラウド同期を有効にしてログインすると、別の端末でもデータを引き継げます。</p>

            {hasFirebaseConfig() ? (
              cloudUser ? (
                <div className="cloud-sync-status">
                  <p className="small-copy">ログイン中: <strong>{cloudUser.email}</strong>{cloudSyncing ? " · 同期中…" : cloudSyncedAt ? ` · 最終同期 ${cloudSyncedAt}` : ""}</p>
                  <button type="button" className="secondary-action" onClick={handleCloudSignOut}>ログアウト</button>
                </div>
              ) : (
                <div className="cloud-auth-form">
                  <p className="small-copy">クラウド同期を使うにはアカウントが必要です。</p>
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="メールアドレス"
                    autoComplete="email"
                  />
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="パスワード（6文字以上）"
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  />
                  {authError ? <p className="auth-error">{authError}</p> : null}
                  <div className="cloud-auth-actions">
                    <button type="button" onClick={handleCloudSignIn}>
                      {authMode === "login" ? "ログイン" : "新規登録"}
                    </button>
                    <button
                      type="button"
                      className="secondary-action"
                      onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
                    >
                      {authMode === "login" ? "新規登録はこちら" : "ログインに戻る"}
                    </button>
                  </div>
                </div>
              )
            ) : null}
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">位置情報と同意</p>
            <h2>必要な時だけ共有</h2>
            <p>
              常時位置追跡、移動履歴の蓄積、行動分析、広告利用は行いません。現在地は緊急時または本人の明示操作時のみ、
              家族への安否共有に必要な範囲で扱います。
            </p>
            <p className="small-copy">
              有事画面の位置共有は初期OFFです。本人が「現在地を取得してON」を押した時だけスマホの許可画面が出ます。
              取得した位置情報は本人の端末上で共有文に入るだけで、運営サーバーへは送信・保存しません。本人が共有文を送信・コピー・外部共有するまで、家族にも共有されません。
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={privacyConsent}
                onChange={(event) => updatePrivacyConsent(event.target.checked)}
              />
              <span>取得情報、利用目的、共有先、保存有無、停止方法、保護者同意の説明を確認しました</span>
            </label>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">データ</p>
            <h2>削除</h2>
            <p>この端末に保存した防災ノートを削除します。家族で必要な情報を確認してから実行してください。</p>
            <button
              type="button"
              className="danger-button"
              onClick={() => setResetConfirmOpen(true)}
            >
              端末データを初期化
            </button>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">PDF・印刷</p>
            <h2>紙の控えを作る</h2>
            <p>家族情報、緊急連絡先、避難場所、備蓄を1枚にまとめて印刷できます。スマホが使えない時の備えに。</p>
            <button type="button" className="wide-action" onClick={printSafetyNote}>
              PDF・印刷で保存
            </button>
            <p className="small-copy">iPhoneは「Safari → 共有 → PDFを保存」、Androidは「印刷 → PDFに保存」でPDF化できます。</p>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">法務</p>
            <h2>確認事項</h2>
            <div className="legal-links">
              <a href="/terms">利用規約</a>
              <a href="/privacy">プライバシーポリシー</a>
              <a href="/disclaimer">免責事項</a>
            </div>
          </section>
        </div>
        </div>
      </section>

      {familyOverviewOpen ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setFamilyOverviewOpen(false)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label="家族の状況" onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">家族の状況</p>
            <h2>今の状況</h2>
            <div className="status-modal-list">
              {visibleStatusSummaryItems.length > 0 ? (
                visibleStatusSummaryItems.map((item) => {
                  const members = getMembersForStatus(item.id);
                  return (
                    <div className="status-overview-row" key={item.id}>
                      <div className="status-overview-heading">
                        <span>{item.label}</span>
                        <strong>{item.count}人</strong>
                      </div>
                      <ul>
                        {members.map((member) => (
                          <li key={member.id}>
                            {member.name}
                            <span>{member.latestStatusAt ? formatDate(member.latestStatusAt) : "時刻未設定"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              ) : (
                <p>まだ家族の状況記録がありません。</p>
              )}
            </div>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setFamilyOverviewOpen(false);
                setActiveScreen("family");
              }}
            >
              家族画面で確認する
            </button>
            <button type="button" className="wide-action" onClick={() => setFamilyOverviewOpen(false)}>
              閉じる
            </button>
          </section>
        </div>
      ) : null}

      {supplyOverviewOpen ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setSupplyOverviewOpen(false)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label="備蓄の内容" onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">備蓄</p>
            <h2>備蓄の内訳</h2>
            <div className="status-modal-list">
              {supplyByOwner.map((group) => (
                <div className="status-overview-row" key={group.owner}>
                  <div className="status-overview-heading">
                    <span>{group.owner}</span>
                    <strong>{group.items.length}件</strong>
                  </div>
                  <ul>
                    {group.items.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        {item.name}
                        <span>数量 {item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button type="button" className="secondary-action" onClick={() => { setSupplyOverviewOpen(false); setActiveScreen("supplies"); }}>
              備蓄を編集する
            </button>
            <button type="button" className="wide-action" onClick={() => setSupplyOverviewOpen(false)}>閉じる</button>
          </section>
        </div>
      ) : null}

      {expiryOverviewOpen ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setExpiryOverviewOpen(false)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label="期限注意" onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">期限注意</p>
            <h2>期限が近い備蓄</h2>
            <div className="status-modal-list">
              {expiringSupplies.length ? expiringSupplies.map((item) => (
                <div className="setting-line" key={item.id}>
                  <span>{item.name}</span>
                  <strong>{daysUntil(item.expiresAt)}日以内</strong>
                </div>
              )) : <p>期限が近い備蓄はありません。</p>}
            </div>
            <button type="button" className="secondary-action" onClick={() => { setExpiryOverviewOpen(false); setActiveScreen("supplies"); }}>
              備蓄を確認する
            </button>
            <button type="button" className="wide-action" onClick={() => setExpiryOverviewOpen(false)}>閉じる</button>
          </section>
        </div>
      ) : null}

      {reviewOverviewOpen ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setReviewOverviewOpen(false)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label="月1回の確認" onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">月1回の確認</p>
            <h2>家族で確認すること</h2>
            <ul className="compact-list">
              <li>集合場所と連絡手順</li>
              <li>備蓄の数量と期限</li>
              <li>服薬、アレルギー、注意事項</li>
            </ul>
            <p className="review-feedback">前回の確認日: {formatDate(data.lastReviewedAt)}</p>
            <button type="button" className="secondary-action" onClick={() => { setReviewOverviewOpen(false); setActiveScreen("note"); }}>
              防災ノートを確認する
            </button>
            <button type="button" className="wide-action" onClick={() => { markReviewed(); setReviewOverviewOpen(false); }}>
              確認した日として記録
            </button>
          </section>
        </div>
      ) : null}

      {statusDialog ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setStatusDialog(null)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label={statusDialogTitle} onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">家族の状況</p>
            <h2>{statusDialogTitle}</h2>
            {statusDialog === "unconfirmed" ? (
              <p className="small-copy">未確認は、まだ安否ボタンや有事の送信が押されていない状態です。</p>
            ) : statusDialog === "unavailable" ? (
              <p className="small-copy">返信困難は、本人が「返信困難」として送信した状態です。</p>
            ) : null}
            <div className="status-modal-list">
              {statusDialogMembers.length > 0 ? (
                statusDialogMembers.map((member) => (
                  <div className="setting-line" key={member.id}>
                    <span>{member.name}</span>
                    <strong>{member.latestStatusAt ? formatDate(member.latestStatusAt) : "時刻未設定"}</strong>
                  </div>
                ))
              ) : (
                <p>該当する家族はいません。</p>
              )}
            </div>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setStatusDialog(null);
                setActiveScreen("family");
              }}
            >
              家族画面で確認する
            </button>
            <button type="button" className="wide-action" onClick={() => setStatusDialog(null)}>
              閉じる
            </button>
          </section>
        </div>
      ) : null}

      {resetConfirmOpen ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setResetConfirmOpen(false)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label="端末データ初期化の確認" onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">確認</p>
            <h2>端末データを初期化しますか？</h2>
            <p>この端末に保存している家族、連絡先、備蓄、ノートの内容を初期状態に戻します。元に戻せません。</p>
            <button type="button" className="danger-button" onClick={resetLocalData}>
              初期化する
            </button>
            <button type="button" className="wide-action" onClick={() => setResetConfirmOpen(false)}>
              キャンセル
            </button>
          </section>
        </div>
      ) : null}

      {installGuideOpen ? (
        <div className="status-modal-backdrop" role="presentation" onClick={() => setInstallGuideOpen(false)}>
          <section className="status-modal" role="dialog" aria-modal="true" aria-label="アプリ追加の手順" onClick={(event) => event.stopPropagation()}>
            <p className="panel-label">アプリ追加</p>
            <h2>ホーム画面に追加する</h2>
            <div className="install-guide-list">
              <section>
                <h3>Android Chrome</h3>
                <p>右上の「︙」を押し、「ホーム画面に追加」または「アプリをインストール」を選びます。</p>
              </section>
              <section>
                <h3>iPhone Safari</h3>
                <p>下の共有ボタンを押し、「ホーム画面に追加」を選びます。</p>
              </section>
              <section>
                <h3>すでに追加済みの場合</h3>
                <p>ホーム画面の「あんぴノート」アイコンから起動してください。</p>
              </section>
            </div>
            <button type="button" className="wide-action" onClick={() => setInstallGuideOpen(false)}>
              閉じる
            </button>
          </section>
        </div>
      ) : null}

      <nav className="bottom-nav disaster-nav" aria-label="画面切り替え">
        {screens.map((screen) => (
          <button
            key={screen.id}
            type="button"
            className={activeScreen === screen.id ? "is-active" : ""}
            onClick={() => switchScreen(screen.id)}
          >
            {screen.label}
          </button>
        ))}
      </nav>

      <section className="print-sheet" aria-label="印刷用 安否確認ノート">
        <header>
          <p>印刷用控え</p>
          <h1>安否確認ノート</h1>
          <p>印刷日: {new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(new Date())}</p>
        </header>

        <section>
          <h2>家族</h2>
          {data.members.map((member) => (
            <div className="print-row" key={member.id}>
              <strong>{member.name}</strong>
              <span>{member.relation} / {member.phone || "連絡先未設定"} / 最新状態: {statusLabels[member.latestStatus]}</span>
              <p>{member.notes || "注意事項なし"}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>緊急連絡先</h2>
          {data.emergencyContacts.map((contact) => (
            <div className="print-row" key={contact.id}>
              <strong>{contact.label}: {contact.name}</strong>
              <span>{contact.phone || "未設定"}</span>
            </div>
          ))}
        </section>

        <section>
          <h2>避難場所・集合ルール</h2>
          {data.evacuationPlaces.map((place) => (
            <div className="print-row" key={place.id}>
              <strong>{place.name}</strong>
              <span>{place.address || "住所未設定"}</span>
              <p>{place.note || "メモなし"}</p>
            </div>
          ))}
          {data.disasterRules.map((rule) => (
            <div className="print-row" key={rule.id}>
              <strong>{rule.title}</strong>
              <p>{rule.body}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>服薬・アレルギー・注意事項</h2>
          {data.medicalNotes.map((note) => (
            <div className="print-row" key={note.id}>
              <strong>{note.memberName}</strong>
              <p>{note.body}</p>
            </div>
          ))}
        </section>

        <section>
          <h2>備蓄</h2>
          {data.supplyItems.map((item) => (
            <div className="print-row compact" key={item.id}>
              <strong>{item.name}</strong>
              <span>{supplyLabels[item.category]} / 数量 {item.quantity} / {item.note || "備考なし"} / 消費期限: {item.expiresAt || "未設定"}</span>
            </div>
          ))}
        </section>

        <footer>
          <p>位置情報は常時追跡しません。共有は緊急時または本人の明示操作時のみ行う設計です。</p>
          <p>この紙は個人情報を含みます。保管場所と共有先に注意してください。</p>
        </footer>
      </section>
    </main>
  );
}
