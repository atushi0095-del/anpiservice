"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User
} from "firebase/auth";
import { PushRegistration } from "@/components/push-registration";
import { demoCheckIn, demoFamily, demoMember, demoNotificationLogs, demoSettings, demoWatchLinks } from "@/lib/demo-data";
import { getFirebaseClients, hasFirebaseConfig } from "@/lib/firebase";
import {
  addFamilyContact,
  createLineLinkCode,
  deactivateFamilyContact,
  loadMemberDashboard,
  saveCheckIn,
  saveSettings
} from "@/lib/firestore-store";
import { createCheckIn, formatJapaneseDateTime, getSafetyStatus, statusLabel } from "@/lib/safety";
import type { CheckIn, CheckInFrequencyDays, NotificationLog, NotificationSettings, UserProfile, WatchLink } from "@/lib/types";

const frequencyOptions: Array<{ label: string; value: CheckInFrequencyDays }> = [
  { label: "毎日", value: 1 },
  { label: "2日に1回", value: 2 },
  { label: "3日に1回", value: 3 }
];

const demoStorageKey = "anpi-note-demo-state";
const appScreens = [
  { id: "checkin", label: "確認" },
  { id: "family", label: "家族" },
  { id: "settings", label: "設定" },
  { id: "logs", label: "履歴" }
] as const;

type AppScreen = (typeof appScreens)[number]["id"];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DemoSnapshot = {
  settings: NotificationSettings;
  latestCheckIn: CheckIn;
  watchLinks: WatchLink[];
  logs: NotificationLog[];
};

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function inviteMailHref(link: WatchLink) {
  const subject = encodeURIComponent("あんぴノート 見守り連絡先のお願い");
  const body = encodeURIComponent(
    `${link.familyName}さん\n\nあんぴノートの見守り連絡先として登録しました。\n未チェックイン時は、アプリ通知またはメールでお知らせします。`
  );

  return `mailto:${link.familyEmail}?subject=${subject}&body=${body}`;
}

function channelLabel(link: WatchLink) {
  if (link.pushEnabled && link.pushToken) {
    return "アプリ通知";
  }

  return "メール代替";
}

export function SafetyApp() {
  const firebaseEnabled = hasFirebaseConfig();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>(demoMember);
  const [settings, setSettings] = useState<NotificationSettings>(demoSettings);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn>(demoCheckIn);
  const [watchLinks, setWatchLinks] = useState<WatchLink[]>(demoWatchLinks);
  const [logs, setLogs] = useState<NotificationLog[]>(demoNotificationLogs);
  const [isStandalone, setIsStandalone] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyEmail, setFamilyEmail] = useState("");
  const [demoStorageReady, setDemoStorageReady] = useState(false);
  const [checkInSaving, setCheckInSaving] = useState(false);
  const [checkInFeedback, setCheckInFeedback] = useState(false);
  const [activeScreen, setActiveScreen] = useState<AppScreen>("checkin");
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [message, setMessage] = useState(
    firebaseEnabled ? "メールでログインするとデータをFirebaseへ保存します。" : "Firebase未設定のためデモモードで動作しています。"
  );
  const [loading, setLoading] = useState(false);

  const status = useMemo(
    () => getSafetyStatus(latestCheckIn.nextDueAt, settings.graceHours),
    [latestCheckIn.nextDueAt, settings.graceHours]
  );

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || Boolean(standaloneNavigator.standalone));

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (firebaseEnabled) {
      return;
    }

    const rawSnapshot = window.localStorage.getItem(demoStorageKey);
    if (rawSnapshot) {
      try {
        const snapshot = JSON.parse(rawSnapshot) as DemoSnapshot;
        setSettings(snapshot.settings);
        setLatestCheckIn(snapshot.latestCheckIn);
        setWatchLinks(snapshot.watchLinks);
        setLogs(snapshot.logs);
        setMessage("デモモードです。家族メールとチェックインはこのブラウザに保存されます。");
      } catch {
        window.localStorage.removeItem(demoStorageKey);
      }
    }

    setDemoStorageReady(true);
  }, [firebaseEnabled]);

  useEffect(() => {
    if (firebaseEnabled || !demoStorageReady) {
      return;
    }

    const snapshot: DemoSnapshot = {
      settings,
      latestCheckIn,
      watchLinks,
      logs
    };
    window.localStorage.setItem(demoStorageKey, JSON.stringify(snapshot));
  }, [demoStorageReady, firebaseEnabled, latestCheckIn, logs, settings, watchLinks]);

  useEffect(() => {
    if (!firebaseEnabled) {
      return;
    }

    const { auth } = getFirebaseClients();
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) {
        setMessage("メールでログインするとデータをFirebaseへ保存します。");
        return;
      }

      setLoading(true);
      try {
        const data = await loadMemberDashboard(user);
        setProfile(data.profile);
        setSettings(data.settings);
        setLatestCheckIn(data.latestCheckIn);
        setWatchLinks(data.watchLinks);
        setLogs(data.logs);
        setMessage("Firebaseに接続しました。チェックインと設定を保存します。");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Firebaseデータの読み込みに失敗しました。");
      } finally {
        setLoading(false);
      }
    });
  }, [firebaseEnabled]);

  async function handleAuth(mode: "signin" | "signup") {
    if (!firebaseEnabled) {
      setMessage("Firebase環境変数を設定するとメール認証を使えます。");
      return;
    }

    setLoading(true);
    try {
      const { auth } = getFirebaseClients();
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setPassword("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "認証に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    if (!firebaseEnabled) {
      return;
    }

    const { auth } = getFirebaseClients();
    await signOut(auth);
    setProfile(demoMember);
    setSettings(demoSettings);
    setLatestCheckIn(demoCheckIn);
    setWatchLinks(demoWatchLinks);
    setLogs(demoNotificationLogs);
  }

  async function handleCheckIn() {
    if (checkInSaving) {
      return;
    }

    setCheckInSaving(true);
    setCheckInFeedback(false);

    try {
      const next = firebaseEnabled && authUser ? await saveCheckIn(authUser.uid, settings) : createCheckIn(profile.id, settings);
      setLatestCheckIn(next);
      setLogs((current) => [
        {
          id: `log-${Date.now()}`,
          memberId: profile.id,
          recipientName: profile.displayName,
          channel: "app",
          kind: "self_reminder",
          status: "sent",
          message: "本人が「無事です」を記録しました。",
          createdAt: next.checkedAt
        },
        ...current
      ]);
      setMessage(`チェックインを記録しました。最終確認: ${formatJapaneseDateTime(next.checkedAt)}`);
      setCheckInFeedback(true);
      window.setTimeout(() => setCheckInFeedback(false), 2600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "チェックインの記録に失敗しました。");
    } finally {
      window.setTimeout(() => setCheckInSaving(false), 450);
    }
  }

  async function handleFrequencyChange(value: CheckInFrequencyDays) {
    const nextSettings = { ...settings, frequencyDays: value };
    setSettings(nextSettings);
    setLatestCheckIn(createCheckIn(profile.id, nextSettings, new Date(latestCheckIn.checkedAt)));
    if (firebaseEnabled && authUser) {
      await saveSettings(nextSettings);
    }
  }

  async function handleAddFamily() {
    if (!familyName.trim() || !familyEmail.trim()) {
      setMessage("家族の名前とメールアドレスを入力してください。");
      return;
    }

    if (!isValidEmailAddress(familyEmail)) {
      setMessage("メールアドレスの形式を確認してください。");
      return;
    }

    const next: WatchLink =
      firebaseEnabled && authUser
        ? await addFamilyContact(authUser.uid, familyName.trim(), familyEmail.trim())
        : {
            id: `watch-${Date.now()}`,
            memberId: profile.id,
            familyId: `family-${Date.now()}`,
            familyName: familyName.trim(),
            familyEmail: familyEmail.trim(),
            lineLinkCode: createLineLinkCode(),
            lineLinked: false,
            pushEnabled: false,
            preferredChannel: "push",
            active: true,
            createdAt: new Date().toISOString()
          };

    setWatchLinks((current) => [next, ...current]);
    setFamilyName("");
    setFamilyEmail("");
    setLogs((current) => [
      {
        id: `log-${Date.now()}`,
        memberId: profile.id,
        watchLinkId: next.id,
        recipientName: next.familyName,
        channel: "email",
        kind: "family_alert",
        status: "queued",
        message: `${next.familyEmail} を見守り連絡先に追加しました。`,
        createdAt: new Date().toISOString()
      },
      ...current
    ]);
    setMessage("家族連絡先を追加しました。「招待メール作成」からメールアプリを開けます。");
  }

  async function handleDeactivate(link: WatchLink) {
    const next = firebaseEnabled && authUser ? await deactivateFamilyContact(link) : { ...link, active: false };
    setWatchLinks((current) => current.map((item) => (item.id === link.id ? next : item)));
  }

  async function handleInstallApp() {
    if (!deferredInstallPrompt) {
      setMessage("ブラウザの共有メニューから「ホーム画面に追加」を選ぶと、アプリのように開けます。");
      return;
    }

    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
    setMessage(choice.outcome === "accepted" ? "ホーム画面に追加しました。" : "ホーム画面追加をキャンセルしました。");
  }

  return (
    <main className="phone-app">
      <header className="app-header">
        <div className="brand-row">
          <img src="/icon.svg" alt="あんぴノート" className="app-icon" />
          <div>
            <p className="eyebrow">家族の見守り</p>
            <h1>あんぴノート</h1>
          </div>
        </div>
        <button type="button" className="install-button" onClick={handleInstallApp} disabled={isStandalone}>
          {isStandalone ? "追加済み" : "アプリを追加"}
        </button>
      </header>

      <p className="app-message">{loading ? "処理中です。" : message}</p>

      <section className="app-screen" aria-label="安否確認アプリ">
        <div className={activeScreen === "checkin" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "checkin"}>
          <section className={`status-panel main-checkin status-${status} ${checkInFeedback ? "checkin-complete" : ""}`}>
            <p className="panel-label">今日の確認</p>
            <h2>{checkInFeedback ? "記録しました" : statusLabel(status)}</h2>
            <button
              type="button"
              className={`checkin-button ${checkInSaving ? "is-saving" : ""} ${checkInFeedback ? "is-complete" : ""}`}
              onClick={handleCheckIn}
              disabled={checkInSaving}
              aria-live="polite"
            >
              {checkInSaving ? "記録中..." : checkInFeedback ? "完了" : "無事です"}
            </button>
            {checkInFeedback ? <p className="checkin-feedback">今日の安否確認を保存しました。</p> : null}
            <div className="checkin-summary">
              <span>最終確認</span>
              <strong>{formatJapaneseDateTime(latestCheckIn.checkedAt)}</strong>
            </div>
            <div className="checkin-summary">
              <span>次回期限</span>
              <strong>{formatJapaneseDateTime(latestCheckIn.nextDueAt)}</strong>
            </div>
          </section>

          <section className="panel compact-panel">
            <p className="panel-label">このアプリについて</p>
            <p>未チェックイン時に本人へ確認し、猶予時間を過ぎたら登録した家族へ知らせます。</p>
            <p className="small-copy">救急通報や生命の安全を保証するものではありません。</p>
          </section>
        </div>

        <div className={activeScreen === "family" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "family"}>
          <section className="panel auth-panel">
            <div>
              <p className="panel-label">アカウント</p>
              <h2>{authUser ? `${profile.displayName} さん` : "メール認証"}</h2>
              <p className="small-copy">{authUser ? "本人アカウントで利用中です。" : "メールで登録するとデータを保存できます。"}</p>
            </div>
            {firebaseEnabled ? (
              authUser ? (
                <button type="button" onClick={handleSignOut}>
                  ログアウト
                </button>
              ) : (
                <div className="auth-form">
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="メールアドレス" type="email" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="パスワード"
                    type="password"
                  />
                  <button type="button" onClick={() => handleAuth("signin")} disabled={loading}>
                    ログイン
                  </button>
                  <button type="button" onClick={() => handleAuth("signup")} disabled={loading}>
                    新規登録
                  </button>
                </div>
              )
            ) : (
              <span className="pill warning">デモモード</span>
            )}
          </section>

          <section className="panel">
            <p className="panel-label">家族</p>
            <h2>通知先を追加</h2>
            <div className="family-add-form">
              <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="家族の名前" />
              <input value={familyEmail} onChange={(event) => setFamilyEmail(event.target.value)} placeholder="家族のメール" type="email" />
              <button type="button" onClick={handleAddFamily}>
                追加
              </button>
            </div>
            <div className="family-list">
              {watchLinks.map((link) => (
                <article className="family-item" key={link.id}>
                  <div>
                    <h3>{link.familyName}</h3>
                    <p>{link.familyEmail}</p>
                    <span className={link.pushEnabled ? "pill success" : "pill"}>通知優先: {channelLabel(link)}</span>
                    <PushRegistration lineLinkCode={link.lineLinkCode} enabled={Boolean(link.pushEnabled)} />
                  </div>
                  <div className="family-actions">
                    <a className="action-button" href={inviteMailHref(link)}>
                      招待メール
                    </a>
                    <button type="button" onClick={() => handleDeactivate(link)} disabled={!link.active}>
                      {link.active ? "見守り解除" : "解除済み"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div className={activeScreen === "settings" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "settings"}>
          <section className="panel">
            <p className="panel-label">通知設定</p>
            <h2>確認のリズム</h2>
            <fieldset className="segmented">
              <legend>チェックイン頻度</legend>
              {frequencyOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="frequency"
                    checked={settings.frequencyDays === option.value}
                    onChange={() => handleFrequencyChange(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            <div className="setting-line">
              <span>本人リマインド</span>
              <strong>期限到来後すぐ</strong>
            </div>
            <div className="setting-line">
              <span>家族通知</span>
              <strong>{settings.graceHours}時間後</strong>
            </div>
          </section>

          <section className="panel">
            <p className="panel-label">スマホに追加</p>
            <h2>すぐ開けるようにする</h2>
            <p>ホーム画面に追加すると、ブラウザを探さず毎日の確認を始められます。</p>
            <button type="button" className="wide-action" onClick={handleInstallApp} disabled={isStandalone}>
              {isStandalone ? "ホーム画面から起動中" : deferredInstallPrompt ? "ホーム画面に追加" : "追加方法を表示"}
            </button>
            <p className="small-copy">
              Androidはボタンから追加できます。iPhoneはSafariの共有メニューから「ホーム画面に追加」を選びます。
            </p>
          </section>
        </div>

        <div className={activeScreen === "logs" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "logs"}>
          <section className="panel">
            <p className="panel-label">通知履歴</p>
            <h2>記録</h2>
            <div className="log-list">
              {logs.map((log) => (
                <article className="log-item" key={log.id}>
                  <span className="log-time">{formatJapaneseDateTime(log.createdAt)}</span>
                  <strong>{log.recipientName}</strong>
                  <p>{log.message}</p>
                  <span className="pill">
                    {log.channel.toUpperCase()} / {log.status}
                  </span>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>

      <nav className="bottom-nav" aria-label="画面切り替え">
        {appScreens.map((screen) => (
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

      <footer>
        <a href="/terms">利用規約</a>
        <a href="/privacy">プライバシーポリシー</a>
      </footer>
    </main>
  );
}
