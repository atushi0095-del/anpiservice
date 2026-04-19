"use client";

import { useEffect, useMemo, useState } from "react";
import type { UIEvent } from "react";
import { defaultDisasterNoteData } from "@/lib/disaster-demo-data";
import type {
  DisasterNoteData,
  DisasterRule,
  EmergencyStatus,
  HouseholdMember,
  MedicalNote,
  SafetyStatusLog,
  SupplyCategory,
  SupplyItem
} from "@/lib/disaster-types";

type AppScreen = "home" | "family" | "emergency" | "note" | "supplies" | "settings";
type ConsentDoc = {
  id: "terms" | "privacy" | "disclaimer";
  title: string;
  lead: string;
  sections: Array<{ heading: string; body: string }>;
};

const storageKey = "kazoku-bosai-note-v1";

const screens: Array<{ id: AppScreen; label: string }> = [
  { id: "home", label: "ホーム" },
  { id: "family", label: "家族" },
  { id: "emergency", label: "有事" },
  { id: "note", label: "ノート" },
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
          "位置情報は原則として運営サーバーに保存しない設計を優先します。家族共有に必要な最低限の中継を行う場合も、共有後は速やかに破棄する方針です。端末内に保存した情報は、設定画面から削除できます。"
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
          "位置情報は、緊急時または利用者が明示的に共有した場合のみ扱います。常時位置追跡、移動履歴の蓄積、行動分析は行いません。位置の正確性、到達可能性、共有先が必ず確認できることを保証するものではありません。"
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

function loadLocalData(): DisasterNoteData {
  if (typeof window === "undefined") {
    return defaultDisasterNoteData;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? { ...defaultDisasterNoteData, ...JSON.parse(raw) } : defaultDisasterNoteData;
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
  const [newSupplyName, setNewSupplyName] = useState("");
  const [newSupplyCategory, setNewSupplyCategory] = useState<SupplyCategory>("food");
  const [newSupplyQuantity, setNewSupplyQuantity] = useState("");
  const [newSupplyExpiresAt, setNewSupplyExpiresAt] = useState("");
  const [newPlaceName, setNewPlaceName] = useState("");
  const [newPlaceAddress, setNewPlaceAddress] = useState("");
  const [emergencyMessage, setEmergencyMessage] = useState(defaultDisasterNoteData.templateMessages[0]);
  const [newTemplateMessage, setNewTemplateMessage] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [locationMapUrl, setLocationMapUrl] = useState("");
  const [useCustomEmergencyMessage, setUseCustomEmergencyMessage] = useState(false);
  const [selectedEmergencyStatus, setSelectedEmergencyStatus] = useState<EmergencyStatus>("safe");
  const [lastEmergencyStatus, setLastEmergencyStatus] = useState<EmergencyStatus | null>(null);
  const [reviewJustMarked, setReviewJustMarked] = useState(false);
  const [dailyJustChecked, setDailyJustChecked] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [consentStep, setConsentStep] = useState(0);
  const [consentRead, setConsentRead] = useState<Record<ConsentDoc["id"], boolean>>({
    terms: false,
    privacy: false,
    disclaimer: false
  });
  const [consentScrolledToEnd, setConsentScrolledToEnd] = useState(false);

  useEffect(() => {
    setData(loadLocalData());
    setPrivacyConsent(window.localStorage.getItem(consentStorageKey) === "true");
    setReady(true);
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
    setConsentScrolledToEnd(false);
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
  const familyStatusCounts = useMemo(
    () => ({
      safe: data.members.filter((member) => member.latestStatus === "safe").length,
      need_help: data.members.filter((member) => member.latestStatus === "need_help").length,
      unavailable: data.members.filter((member) => member.latestStatus === "unavailable").length
    }),
    [data.members]
  );
  const familyStatusSummary =
    data.members.length === 0
      ? "家族未登録"
      : familyStatusCounts.need_help > 0
        ? `要支援 ${familyStatusCounts.need_help}人`
        : familyStatusCounts.unavailable > 0
          ? `未確認 ${familyStatusCounts.unavailable}人`
          : "全員無事";

  function updateData(next: DisasterNoteData, nextMessage = "保存しました。") {
    setData(next);
    setMessage(nextMessage);
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

  function addSupply() {
    if (!newSupplyName.trim()) {
      setMessage("備蓄品名を入力してください。");
      return;
    }

    const supply: SupplyItem = {
      id: createId("supply"),
      name: newSupplyName.trim(),
      category: newSupplyCategory,
      quantity: newSupplyQuantity.trim() || "1",
      expiresAt: newSupplyExpiresAt,
      checked: false
    };
    updateData({ ...data, supplyItems: [supply, ...data.supplyItems] }, "備蓄品を追加しました。");
    setNewSupplyName("");
    setNewSupplyQuantity("");
    setNewSupplyExpiresAt("");
  }

  function updateSupply(supply: SupplyItem, patch: Partial<SupplyItem>) {
    updateData({
      ...data,
      supplyItems: data.supplyItems.map((item) => (item.id === supply.id ? { ...item, ...patch } : item))
    });
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
      data.notificationSettings.locationShareEnabled && manualLocation.trim()
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
        data.notificationSettings.locationShareEnabled && manualLocation.trim()
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

  function recordDailyCheckIn() {
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
    setConsentRead((current) => ({ ...current, [doc.id]: true }));

    if (consentStep < consentDocs.length - 1) {
      setConsentStep((current) => current + 1);
      return;
    }

    updatePrivacyConsent(true);
  }

  function printSafetyNote() {
    setMessage("印刷画面を開きます。紙に残して、スマホが使えない時の控えにできます。");
    window.print();
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
          <article className="consent-document" onScroll={handleConsentScroll}>
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
        <button type="button" className="install-button" onClick={() => setMessage("ブラウザの共有メニューからホーム画面に追加できます。")}>
          アプリ追加
        </button>
      </header>

      <p className="app-message">{message}</p>

      <section className="app-screen" aria-label="安否確認ノート">
        <div className={activeScreen === "home" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "home"}>
          <section className={dailyJustChecked ? "status-panel daily-check-panel checkin-complete" : "status-panel daily-check-panel"}>
            <p className="panel-label">日常の安否確認</p>
            <h2>{dailyJustChecked ? "今日の安否確認が完了しました" : "今日の無事を家族に残す"}</h2>
            <button
              type="button"
              className={dailyJustChecked ? "checkin-button is-complete" : "checkin-button"}
              onClick={recordDailyCheckIn}
            >
              無事です
            </button>
            <p className="checkin-feedback">
              {dailyJustChecked ? `最終安否確認: ${formatDate(data.members[0]?.latestStatusAt || data.statusLogs[0]?.createdAt || "")}` : "日常の見守り用です。緊急時は下の「有事の安否共有」を使ってください。"}
            </p>
          </section>

          <section className="status-panel disaster-home">
            <p className="panel-label">今日の安否ステータス</p>
            <h2>{monthlyTaskDone ? "今月の家族確認は完了しています" : "今月の家族確認があります"}</h2>
            <div className="metric-grid">
              <div>
                <span>家族状況</span>
                <strong>{familyStatusSummary}</strong>
              </div>
              <div>
                <span>最終更新</span>
                <strong>{formatDate(data.lastReviewedAt)}</strong>
              </div>
              <div>
                <span>備蓄</span>
                <strong>{checkedCount}/{data.supplyItems.length}</strong>
              </div>
              <div>
                <span>期限注意</span>
                <strong>{expiringSupplies.length}件</strong>
              </div>
            </div>
            <div className="family-status-strip">
              <span>無事 {familyStatusCounts.safe}人</span>
              <span>要支援 {familyStatusCounts.need_help}人</span>
              <span>未確認 {familyStatusCounts.unavailable}人</span>
            </div>
            <button type="button" className="checkin-button emergency-launch" onClick={() => setActiveScreen("emergency")}>
              有事の安否共有
            </button>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">家族確認メモ</p>
            <h2>{monthlyTaskDone ? "今月の家族確認が完了しています" : "今月、家族で確認すること"}</h2>
            <ul className="compact-list">
              <li>集合場所と連絡手順を確認</li>
              <li>備蓄の期限と数量を確認</li>
              <li>服薬、アレルギー、注意事項を更新</li>
            </ul>
            <p className={reviewJustMarked ? "review-feedback is-complete" : "review-feedback"}>
              家族で確認した日: {formatDate(data.lastReviewedAt)}
            </p>
            <button type="button" className={reviewJustMarked ? "wide-action is-complete" : "wide-action"} onClick={markReviewed}>
              {reviewJustMarked ? "家族確認を完了しました" : "家族確認を完了にする"}
            </button>
          </section>

          <section className="panel compact-panel">
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

        <div className={activeScreen === "family" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "family"}>
          <section className="panel">
            <p className="panel-label">家族</p>
            <h2>家族メンバー</h2>
            <p className="small-copy">
              家族を追加したら、招待をLINEやメールで送れます。今は端末内保存が中心のため、自動で同じデータが同期されるのはPhase 2のクラウド同期からです。
            </p>
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
                <article className="family-item disaster-card" key={member.id}>
                  <div>
                    <h3>{member.name}</h3>
                    <p>{member.relation} / {member.phone || "連絡先未設定"}</p>
                    <span className={`pill ${member.latestStatus === "safe" ? "success" : "warning"}`}>
                      {statusLabels[member.latestStatus]}
                    </span>
                    <button type="button" className="secondary-action member-share-button" onClick={() => shareFamilyInvite(member)}>
                      この人へ招待を送る
                    </button>
                    <textarea
                      value={member.notes}
                      onChange={(event) => updateMember(member, { notes: event.target.value })}
                      placeholder="注意事項、迎えのルール、連絡の優先順"
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">緊急連絡先</p>
            <h2>連絡先リスト</h2>
            {data.emergencyContacts.map((contact) => (
              <div className="setting-line" key={contact.id}>
                <span>{contact.label}: {contact.name}</span>
                <strong>{contact.phone || "未設定"}</strong>
              </div>
            ))}
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">家族の状況</p>
            <h2>{familyStatusSummary}</h2>
            <div className="family-status-strip family-status-strip-light">
              <span>無事 {familyStatusCounts.safe}人</span>
              <span>要支援 {familyStatusCounts.need_help}人</span>
              <span>未確認 {familyStatusCounts.unavailable}人</span>
            </div>
            {data.members.map((member) => (
              <div className="setting-line" key={member.id}>
                <span>{member.name}</span>
                <strong>{statusLabels[member.latestStatus]}</strong>
              </div>
            ))}
          </section>
        </div>

        <div className={activeScreen === "emergency" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "emergency"}>
          <section className="status-panel emergency-panel">
            <p className="panel-label">緊急モード</p>
            <h2>今の状況と送る文面</h2>
            <p className="small-copy">
              まず状況を選び、位置情報を含めるか決めてから送信します。送信後、家族状況と最新の共有に反映されます。
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
            <p className="emergency-confirmation">
              {lastEmergencyStatus
                ? `${statusLabels[lastEmergencyStatus]}を送信済みです。必要ならもう一度送信できます。`
                : `${statusLabels[selectedEmergencyStatus]}の文面を準備しています。`}
            </p>
            <div className="location-share-card">
              <div>
                <p className="panel-label">位置情報</p>
                <h3>{data.notificationSettings.locationShareEnabled ? "今回だけ共有する" : "共有しない"}</h3>
                <p>常時追跡はせず、ボタンを押した時だけ共有文に含めます。</p>
              </div>
              <button
                type="button"
                className={data.notificationSettings.locationShareEnabled ? "secondary-action is-selected" : "secondary-action"}
                onClick={() =>
                  updateData({
                    ...data,
                    notificationSettings: {
                      ...data.notificationSettings,
                      locationShareEnabled: !data.notificationSettings.locationShareEnabled
                    }
                  }, data.notificationSettings.locationShareEnabled ? "位置共有をOFFにしました。" : "位置共有を今回の操作で有効にしました。")
                }
              >
                {data.notificationSettings.locationShareEnabled ? "位置共有ON" : "位置共有OFF"}
              </button>
            </div>
            {data.notificationSettings.locationShareEnabled ? (
              <div className="location-tools">
                <input
                  value={manualLocation}
                  onChange={(event) => {
                    setManualLocation(event.target.value);
                    setLocationMapUrl("");
                  }}
                  placeholder="例: 自宅、駅前、避難所名"
                />
                <button type="button" className="secondary-action" onClick={fillCurrentLocation}>現在地を取得して地図リンクを作る</button>
                {locationMapUrl ? (
                  <a className="map-preview" href={locationMapUrl} target="_blank" rel="noreferrer">
                    Googleマップで現在地を開く
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="auto-message-preview">
              <span>送信される内容</span>
              <strong>{buildEmergencyShareText(selectedEmergencyStatus, getEmergencyMessage(selectedEmergencyStatus))}</strong>
            </div>
            <div className="message-actions">
              <button type="button" className="wide-action" onClick={sendEmergencyUpdate}>
                アプリ内に送信する
              </button>
              <button type="button" className="secondary-action" onClick={() => shareEmergencyText(selectedEmergencyStatus)}>
                LINE・メールでも送る
              </button>
              <button type="button" className="secondary-action" onClick={copyEmergencyText}>共有文をコピー</button>
            </div>
            <div className="message-mode">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={useCustomEmergencyMessage}
                  onChange={(event) => {
                    setUseCustomEmergencyMessage(event.target.checked);
                    if (!event.target.checked) {
                      setEmergencyMessage(statusMessages[selectedEmergencyStatus]);
                    }
                  }}
                />
                <span>送る文面を自分で調整する</span>
              </label>
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
            <p className="small-copy">位置情報は常時追跡しません。緊急時または本人が明示的に操作した時だけ共有文に含めます。</p>
            <p className="small-copy">救助や安全を保証するものではありません。必要な場合は公的な窓口や身近な人へ連絡してください。</p>
          </section>
        </div>

        <div className={activeScreen === "note" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "note"}>
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
        </div>

        <div className={activeScreen === "supplies" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "supplies"}>
          <section className="panel">
            <p className="panel-label">備蓄チェック</p>
            <h2>持ち出し品と備蓄</h2>
            <details className="add-details">
              <summary>備蓄品を追加</summary>
              <div className="family-add-form">
                <input value={newSupplyName} onChange={(event) => setNewSupplyName(event.target.value)} placeholder="品名" />
                <select value={newSupplyCategory} onChange={(event) => setNewSupplyCategory(event.target.value as SupplyCategory)}>
                  {Object.entries(supplyLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input value={newSupplyQuantity} onChange={(event) => setNewSupplyQuantity(event.target.value)} placeholder="数量" />
                <input value={newSupplyExpiresAt} onChange={(event) => setNewSupplyExpiresAt(event.target.value)} type="date" />
                <button type="button" onClick={addSupply}>追加</button>
              </div>
            </details>
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
                  <article className={`supply-row ${item.checked ? "is-checked" : ""}`} key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.checked}
                      aria-label={`${item.name}を確認済みにする`}
                      onChange={(event) => updateSupply(item, { checked: event.target.checked })}
                    />
                    <div className="supply-main">
                      <strong>{item.name}</strong>
                      <span>{supplyLabels[item.category]} / {item.quantity}</span>
                    </div>
                    <span className={remaining !== null && remaining <= 30 ? "pill warning" : "pill"}>
                      {expiryText}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        </div>

        <div className={activeScreen === "settings" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "settings"}>
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
                  }, "クラウド同期はPhase 2で接続します。")
                }
              />
              <span>クラウド同期を使う</span>
            </label>
            <p className="small-copy">Phase 1は端末保存が基本です。同期、通知、PDF出力はPhase 2で接続します。</p>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">位置情報と同意</p>
            <h2>必要な時だけ共有</h2>
            <p>
              常時位置追跡、移動履歴の蓄積、行動分析、広告利用は行いません。現在地は緊急時または本人の明示操作時のみ、
              家族への安否共有に必要な範囲で扱います。
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
              onClick={() => {
                window.localStorage.removeItem(storageKey);
                setData(defaultDisasterNoteData);
                setMessage("端末内のデータを初期化しました。");
              }}
            >
              端末データを初期化
            </button>
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
      </section>

      <nav className="bottom-nav disaster-nav" aria-label="画面切り替え">
        {screens.map((screen) => (
          <button
            key={screen.id}
            type="button"
            className={activeScreen === screen.id ? "is-active" : ""}
            onClick={() => setActiveScreen(screen.id)}
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
              <span>{supplyLabels[item.category]} / {item.quantity} / 消費期限: {item.expiresAt || "未設定"}</span>
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
