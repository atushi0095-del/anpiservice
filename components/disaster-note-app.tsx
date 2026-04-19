"use client";

import { useEffect, useMemo, useState } from "react";
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

const statusActionCopy: Record<EmergencyStatus, string> = {
  safe: "無事を記録",
  need_help: "要支援を記録",
  unavailable: "返信困難を記録"
};

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
  const [manualLocation, setManualLocation] = useState("");
  const [selectedEmergencyStatus, setSelectedEmergencyStatus] = useState<EmergencyStatus>("safe");
  const [lastEmergencyStatus, setLastEmergencyStatus] = useState<EmergencyStatus | null>(null);
  const [reviewJustMarked, setReviewJustMarked] = useState(false);
  const [dailyJustChecked, setDailyJustChecked] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

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
    setEmergencyMessage(statusMessages[status]);
  }

  function recordEmergencyStatus(status: EmergencyStatus, messageOverride?: string) {
    const now = new Date().toISOString();
    const member = data.members[0] || defaultDisasterNoteData.members[0];
    setSelectedEmergencyStatus(status);
    setLastEmergencyStatus(status);
    const log: SafetyStatusLog = {
      id: createId("status"),
      memberId: member.id,
      memberName: member.name,
      status,
      message: messageOverride || emergencyMessage || statusMessages[status],
      locationText: data.notificationSettings.locationShareEnabled ? manualLocation.trim() : undefined,
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
    const text = `${emergencyMessage}\n現在地: ${
      data.notificationSettings.locationShareEnabled && manualLocation ? manualLocation : "位置情報は共有していません"
    }`;
    navigator.clipboard
      ?.writeText(text)
      .then(() => setMessage("共有文をコピーしました。LINEやメールに貼り付けて送れます。"))
      .catch(() => setMessage("共有文をコピーできませんでした。画面の文面を手動で送ってください。"));
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

  function printSafetyNote() {
    setMessage("印刷画面を開きます。紙に残して、スマホが使えない時の控えにできます。");
    window.print();
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
                <span>家族</span>
                <strong>{data.members.length}人</strong>
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
        </div>

        <div className={activeScreen === "emergency" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "emergency"}>
          <section className="status-panel emergency-panel">
            <p className="panel-label">緊急モード</p>
            <h2>今の状況を記録</h2>
            <div className="emergency-actions">
              <button
                type="button"
                className={lastEmergencyStatus === "safe" ? "is-selected" : ""}
                onClick={() => {
                  chooseEmergencyStatus("safe");
                  recordEmergencyStatus("safe", statusMessages.safe);
                }}
              >
                無事
              </button>
              <button
                type="button"
                className={`warning-action ${lastEmergencyStatus === "need_help" ? "is-selected" : ""}`}
                onClick={() => {
                  chooseEmergencyStatus("need_help");
                  recordEmergencyStatus("need_help", statusMessages.need_help);
                }}
              >
                要支援
              </button>
              <button
                type="button"
                className={`quiet-action ${lastEmergencyStatus === "unavailable" ? "is-selected" : ""}`}
                onClick={() => {
                  chooseEmergencyStatus("unavailable");
                  recordEmergencyStatus("unavailable", statusMessages.unavailable);
                }}
              >
                返信困難
              </button>
            </div>
            <p className="emergency-confirmation">
              {lastEmergencyStatus ? `${statusLabels[lastEmergencyStatus]}を記録済みです。必要なら下の文面を家族へ送れます。` : "ボタンを押すと、この画面のまま状態を記録します。"}
            </p>
            <p className="small-copy">救助や安全を保証するものではありません。必要な場合は公的な窓口や身近な人へ連絡してください。</p>
          </section>

          <section className="panel">
            <p className="panel-label">定型文</p>
            <h2>送る文面</h2>
            <div className="status-choice">
              {(Object.keys(statusLabels) as EmergencyStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={selectedEmergencyStatus === status ? "is-selected" : ""}
                  onClick={() => chooseEmergencyStatus(status)}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
            <select value={emergencyMessage} onChange={(event) => setEmergencyMessage(event.target.value)}>
              {Array.from(new Set([...Object.values(statusMessages), ...data.templateMessages])).map((template) => (
                <option key={template} value={template}>{template}</option>
              ))}
            </select>
            <textarea value={emergencyMessage} onChange={(event) => setEmergencyMessage(event.target.value)} />
            <label className="check-row">
              <input
                type="checkbox"
                checked={data.notificationSettings.locationShareEnabled}
                onChange={(event) =>
                  updateData({
                    ...data,
                    notificationSettings: { ...data.notificationSettings, locationShareEnabled: event.target.checked }
                  }, event.target.checked ? "位置共有を今回の操作で有効にしました。" : "位置共有をOFFにしました。")
                }
              />
              <span>手動で現在地を共有する</span>
            </label>
            {data.notificationSettings.locationShareEnabled ? (
              <input value={manualLocation} onChange={(event) => setManualLocation(event.target.value)} placeholder="例: 自宅、駅前、避難所名" />
            ) : null}
            <p className="small-copy">位置情報は常時追跡しません。緊急時または本人が明示的に操作した時だけ共有文に含めます。</p>
            <div className="message-actions">
              <button type="button" className="wide-action" onClick={() => recordEmergencyStatus(selectedEmergencyStatus)}>
                {statusActionCopy[selectedEmergencyStatus]}
              </button>
              <button type="button" className="secondary-action" onClick={copyEmergencyText}>共有文をコピー</button>
            </div>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">家族状況</p>
            <h2>最新状態</h2>
            {data.members.map((member) => (
              <div className="setting-line" key={member.id}>
                <span>{member.name}</span>
                <strong>{statusLabels[member.latestStatus]}</strong>
              </div>
            ))}
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
