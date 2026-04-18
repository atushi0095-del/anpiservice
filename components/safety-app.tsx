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
import {
  addFamilyContactViaApi,
  deactivateFamilyContactViaApi,
  loadFamilyDashboardViaApi,
  loadMemberDashboardViaApi,
  saveCheckInViaApi,
  saveSettingsViaApi
} from "@/lib/api-store";
import type { MemberDashboardData } from "@/lib/api-store";
import { isStrongEnoughPassword, toAppErrorMessage, toAuthMessage } from "@/lib/auth-errors";
import { demoCheckIn, demoFamily, demoMember, demoNotificationLogs, demoSettings, demoWatchLinks } from "@/lib/demo-data";
import { getFirebaseClients, hasFirebaseConfig } from "@/lib/firebase";
import { createCheckIn, formatJapaneseDateTime, getSafetyStatus, statusLabel } from "@/lib/safety";
import type {
  CheckIn,
  CheckInFrequencyDays,
  FamilyWatchTarget,
  NotificationLog,
  NotificationSettings,
  UserProfile,
  WatchLink
} from "@/lib/types";

const frequencyOptions: Array<{ label: string; value: CheckInFrequencyDays }> = [
  { label: "毎日", value: 1 },
  { label: "2日に1回", value: 2 },
  { label: "3日に1回", value: 3 }
];

const demoStorageKey = "anpi-note-demo-state";
const dashboardCachePrefix = "anpi-note-dashboard-";
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

function createLineLinkCode(): string {
  const value = Math.floor(100000 + Math.random() * 900000);
  return `ANPI-${value}`;
}

function inviteMailHref(link: WatchLink, inviteUrl: string) {
  const subject = encodeURIComponent("あんぴノート 見守り連絡先のお願い");
  const body = encodeURIComponent(
    `${link.familyName}さん\n\nあんぴノートの見守り連絡先として招待しました。\n次のリンクを開いて、メール登録またはログイン後に承認してください。\n\n${inviteUrl}\n\n承認後、未チェックイン時はアプリ通知またはメールでお知らせします。`
  );

  return `mailto:${link.familyEmail}?subject=${subject}&body=${body}`;
}

function lineShareHref(link: WatchLink, inviteUrl: string) {
  const text = encodeURIComponent(`${link.familyName}さん、あんぴノートの見守り招待です。\n${inviteUrl}`);
  return `https://line.me/R/msg/text/?${text}`;
}

function createInviteUrl(link: WatchLink) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "");

  if (configuredOrigin) {
    return `${configuredOrigin}/invite/${encodeURIComponent(link.lineLinkCode)}`;
  }

  if (typeof window === "undefined") {
    return `/invite/${encodeURIComponent(link.lineLinkCode)}`;
  }

  return `${window.location.origin}/invite/${encodeURIComponent(link.lineLinkCode)}`;
}

function channelLabel(link: WatchLink) {
  if (link.pushEnabled && link.pushToken) {
    return "アプリ通知";
  }

  return "メール代替";
}

function dashboardCacheKey(userId: string) {
  return `${dashboardCachePrefix}${userId}`;
}

function readCachedDashboard(userId: string): MemberDashboardData | null {
  try {
    const raw = window.localStorage.getItem(dashboardCacheKey(userId));
    return raw ? (JSON.parse(raw) as MemberDashboardData) : null;
  } catch {
    return null;
  }
}

function writeCachedDashboard(userId: string, data: MemberDashboardData) {
  try {
    window.localStorage.setItem(dashboardCacheKey(userId), JSON.stringify(data));
  } catch {
    // localStorage may be unavailable in private browsing.
  }
}

export function SafetyApp() {
  const firebaseEnabled = hasFirebaseConfig();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile>(demoMember);
  const [settings, setSettings] = useState<NotificationSettings>(demoSettings);
  const [latestCheckIn, setLatestCheckIn] = useState<CheckIn>(demoCheckIn);
  const [watchLinks, setWatchLinks] = useState<WatchLink[]>(demoWatchLinks);
  const [familyTargets, setFamilyTargets] = useState<FamilyWatchTarget[]>([]);
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
  const [authAction, setAuthAction] = useState<"signin" | "signup" | "signout" | null>(null);
  const [familyAdding, setFamilyAdding] = useState(false);
  const [frequencySaving, setFrequencySaving] = useState<CheckInFrequencyDays | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [refreshingFamily, setRefreshingFamily] = useState(false);
  const [installingApp, setInstallingApp] = useState(false);
  const [message, setMessage] = useState(
    firebaseEnabled ? "メールでログインするとデータをFirebaseへ保存します。" : "Firebase未設定のためデモモードで動作しています。"
  );
  const [loading, setLoading] = useState(false);

  const status = useMemo(
    () => getSafetyStatus(latestCheckIn.nextDueAt, settings.graceHours),
    [latestCheckIn.nextDueAt, settings.graceHours]
  );
  const checkedInToday = useMemo(() => {
    const checkedAt = new Date(latestCheckIn.checkedAt);
    const today = new Date();
    return (
      checkedAt.getFullYear() === today.getFullYear() &&
      checkedAt.getMonth() === today.getMonth() &&
      checkedAt.getDate() === today.getDate()
    );
  }, [latestCheckIn.checkedAt]);

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

      const cached = readCachedDashboard(user.uid);
      if (cached) {
        setProfile(cached.profile);
        setSettings(cached.settings);
        setLatestCheckIn(cached.latestCheckIn);
        setWatchLinks(cached.watchLinks);
        setLogs(cached.logs);
        setMessage("前回のデータを表示しています。最新情報を確認中です...");
      }

      setLoading(true);
      try {
        const data = await loadMemberDashboardViaApi(user);
        setProfile(data.profile);
        setSettings(data.settings);
        setLatestCheckIn(data.latestCheckIn);
        setWatchLinks(data.watchLinks);
        setLogs(data.logs);
        writeCachedDashboard(user.uid, data);
        setMessage("Firebaseに接続しました。チェックインと設定を保存します。");
      } catch (error) {
        setMessage(cached ? "最新情報の取得に失敗しました。前回のデータを表示しています。" : toAppErrorMessage(error));
      } finally {
        setLoading(false);
      }
    });
  }, [firebaseEnabled]);

  useEffect(() => {
    if (!firebaseEnabled || !authUser || activeScreen !== "family") {
      return;
    }

    let cancelled = false;
    setRefreshingFamily(true);
    loadFamilyDashboardViaApi(authUser)
      .then((targets) => {
        if (!cancelled) {
          setFamilyTargets(targets);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMessage(toAppErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRefreshingFamily(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeScreen, authUser, firebaseEnabled]);

  async function handleAuth(mode: "signin" | "signup") {
    if (!firebaseEnabled) {
      setMessage("Firebase環境変数を設定するとメール認証を使えます。");
      return;
    }

    setAuthAction(mode);
    setMessage(mode === "signin" ? "ログインしています..." : "登録しています...");
    try {
      const { auth } = getFirebaseClients();
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!isStrongEnoughPassword(password)) {
          setMessage("パスワードは8文字以上で、英字と数字を含めてください。");
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setPassword("");
    } catch (error) {
      setMessage(toAuthMessage(error));
    } finally {
      setAuthAction(null);
    }
  }

  async function handleSignOut() {
    if (!firebaseEnabled) {
      return;
    }

    setAuthAction("signout");
    setMessage("ログアウトしています...");
    try {
      const { auth } = getFirebaseClients();
      await signOut(auth);
      setProfile(demoMember);
      setSettings(demoSettings);
      setLatestCheckIn(demoCheckIn);
      setWatchLinks(demoWatchLinks);
      setFamilyTargets([]);
      setLogs(demoNotificationLogs);
    } catch (error) {
      setMessage(toAppErrorMessage(error));
    } finally {
      setAuthAction(null);
    }
  }

  async function handleCheckIn() {
    if (checkInSaving) {
      return;
    }

    setCheckInSaving(true);
    setCheckInFeedback(false);

    const memberId = firebaseEnabled && authUser ? authUser.uid : profile.id;
    const next = createCheckIn(memberId, settings);
    const nextLog: NotificationLog = {
      id: `log-${Date.now()}`,
      memberId: profile.id,
      recipientName: profile.displayName,
      channel: "app",
      kind: "self_reminder",
      status: "sent",
      message: "本人が「無事です」を記録しました。",
      createdAt: next.checkedAt
    };
    const nextLogs = [nextLog, ...logs];
    setLatestCheckIn(next);
    setLogs(nextLogs);
    setMessage(`チェックインを記録しました。クラウドへ保存しています...`);
    setCheckInFeedback(true);

    try {
      if (firebaseEnabled && authUser) {
        await saveCheckInViaApi(authUser, next);
        writeCachedDashboard(authUser.uid, { profile, settings, latestCheckIn: next, watchLinks, logs: nextLogs });
      }
      setMessage(`チェックインを記録しました。最終確認: ${formatJapaneseDateTime(next.checkedAt)}`);
    } catch (error) {
      setMessage(`画面には記録しましたが、クラウド保存に失敗しました。家族への反映には再度通信が必要です。${toAppErrorMessage(error)}`);
    } finally {
      window.setTimeout(() => setCheckInSaving(false), 450);
    }
  }

  async function handleFrequencyChange(value: CheckInFrequencyDays) {
    const nextSettings = { ...settings, frequencyDays: value };
    const nextCheckIn = createCheckIn(profile.id, nextSettings, new Date(latestCheckIn.checkedAt));
    setSettings(nextSettings);
    setLatestCheckIn(nextCheckIn);
    if (firebaseEnabled && authUser) {
      setFrequencySaving(value);
      setMessage("確認リズムを保存しています...");
      try {
        await saveSettingsViaApi(authUser, nextSettings);
        writeCachedDashboard(authUser.uid, { profile, settings: nextSettings, latestCheckIn: nextCheckIn, watchLinks, logs });
        setMessage("確認リズムを保存しました。");
      } catch (error) {
        setMessage(toAppErrorMessage(error));
      } finally {
        setFrequencySaving(null);
      }
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

    setFamilyAdding(true);
    setMessage("家族連絡先を追加しています...");
    try {
      const next: WatchLink =
        firebaseEnabled && authUser
          ? await addFamilyContactViaApi(authUser, familyName.trim(), familyEmail.trim())
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

      const nextWatchLinks = [next, ...watchLinks];
      setWatchLinks(nextWatchLinks);
      setFamilyName("");
      setFamilyEmail("");
      const nextLogs: NotificationLog[] = [
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
        ...logs
      ];
      setLogs(nextLogs);
      if (authUser) {
        writeCachedDashboard(authUser.uid, { profile, settings, latestCheckIn, watchLinks: nextWatchLinks, logs: nextLogs });
      }
      setMessage("家族連絡先を追加しました。招待リンクを送れます。");
    } catch (error) {
      setMessage(toAppErrorMessage(error));
    } finally {
      setFamilyAdding(false);
    }
  }

  async function handleDeactivate(link: WatchLink) {
    setDeactivatingId(link.id);
    setMessage("見守り解除を保存しています...");
    try {
      const next = firebaseEnabled && authUser ? await deactivateFamilyContactViaApi(authUser, link) : { ...link, active: false };
      const nextWatchLinks = watchLinks.map((item) => (item.id === link.id ? next : item));
      setWatchLinks(nextWatchLinks);
      if (authUser) {
        writeCachedDashboard(authUser.uid, { profile, settings, latestCheckIn, watchLinks: nextWatchLinks, logs });
      }
      setMessage("見守りを解除しました。");
    } catch (error) {
      setMessage(toAppErrorMessage(error));
    } finally {
      setDeactivatingId(null);
    }
  }

  async function handleShareInvite(link: WatchLink) {
    const inviteUrl = createInviteUrl(link);
    try {
      if (navigator.share) {
        await navigator.share({
          title: "あんぴノート 見守り招待",
          text: `${link.familyName}さん、あんぴノートの見守り招待です。`,
          url: inviteUrl
        });
        return;
      }

      await navigator.clipboard.writeText(inviteUrl);
      setMessage("招待リンクをコピーしました。メールやメッセージで送れます。");
    } catch {
      setMessage("共有をキャンセルしました。LINE送信や招待メールも使えます。");
    }
  }

  async function handleInstallApp() {
    setInstallingApp(true);
    try {
      if (!deferredInstallPrompt) {
        setMessage("ブラウザの共有メニューから「ホーム画面に追加」を選ぶと、アプリのように開けます。");
        return;
      }

      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      setDeferredInstallPrompt(null);
      setMessage(choice.outcome === "accepted" ? "ホーム画面に追加しました。" : "ホーム画面追加をキャンセルしました。");
    } catch (error) {
      setMessage(toAppErrorMessage(error));
    } finally {
      setInstallingApp(false);
    }
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

      <p className={`app-message ${loading || authAction || familyAdding || frequencySaving || deactivatingId || installingApp ? "is-busy" : ""}`}>
        {loading ? "読み込み中です..." : message}
      </p>

      <section className="app-screen" aria-label="安否確認アプリ">
        <div className={activeScreen === "checkin" ? "screen-page is-active" : "screen-page"} hidden={activeScreen !== "checkin"}>
          <section className={`status-panel main-checkin status-${status} ${checkInFeedback ? "checkin-complete" : ""}`}>
            <p className="panel-label">今日の確認</p>
            <h2>{checkedInToday ? "本日完了" : statusLabel(status)}</h2>
            <button
              type="button"
              className={`checkin-button ${checkInSaving ? "is-saving" : ""} ${checkInFeedback ? "is-complete" : ""}`}
              onClick={handleCheckIn}
              disabled={checkInSaving}
              aria-live="polite"
            >
              {checkInSaving ? "記録中..." : checkedInToday ? "本日完了" : "無事です"}
            </button>
            {checkedInToday ? <p className="checkin-feedback">今日の安否確認は完了しています。</p> : null}
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
          {authUser ? (
            <section className="panel">
              <p className="panel-label">見守り対象</p>
              <h2>見守り中の方</h2>
              <div className="family-list">
              {refreshingFamily ? <p className="small-copy">見守り対象を更新しています...</p> : null}
              {familyTargets.length ? (
                  familyTargets.map((target) => {
                    const targetStatus = target.latestCheckIn
                      ? getSafetyStatus(target.latestCheckIn.nextDueAt, target.settings?.graceHours || 6)
                      : "overdue";
                    return (
                      <article className="family-item" key={target.link.id}>
                        <div>
                          <h3>{target.member.displayName}</h3>
                          <p>{target.member.email}</p>
                          <span className={`pill ${targetStatus === "ok" ? "success" : "warning"}`}>{statusLabel(targetStatus)}</span>
                          <p className="small-copy">
                            最終確認:{" "}
                            {target.latestCheckIn ? formatJapaneseDateTime(target.latestCheckIn.checkedAt) : "まだ記録がありません"}
                          </p>
                        </div>
                        <PushRegistration lineLinkCode={target.link.lineLinkCode} enabled={Boolean(target.link.pushEnabled)} />
                      </article>
                    );
                  })
                ) : (
                  <p>まだ承認済みの見守り対象がありません。招待リンクから承認すると表示されます。</p>
                )}
              </div>
            </section>
          ) : null}

          <section className="panel auth-panel">
            <div>
              <p className="panel-label">アカウント</p>
              <h2>{authUser ? `${profile.displayName} さん` : "メール認証"}</h2>
              <p className="small-copy">{authUser ? "本人アカウントで利用中です。" : "メールで登録するとデータを保存できます。"}</p>
            </div>
            {firebaseEnabled ? (
              authUser ? (
                <button type="button" className={`logout-button ${authAction === "signout" ? "is-busy" : ""}`} onClick={handleSignOut} disabled={authAction === "signout"}>
                  {authAction === "signout" ? "処理中..." : "ログアウト"}
                </button>
              ) : (
                <div className="auth-form">
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="メールアドレス" type="email" />
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="パスワード 8文字以上"
                    type="password"
                  />
                  <button type="button" className={authAction === "signin" ? "is-busy" : ""} onClick={() => handleAuth("signin")} disabled={Boolean(authAction)}>
                    {authAction === "signin" ? "ログイン中..." : "ログイン"}
                  </button>
                  <button type="button" className={authAction === "signup" ? "is-busy" : ""} onClick={() => handleAuth("signup")} disabled={Boolean(authAction)}>
                    {authAction === "signup" ? "登録中..." : "新規登録"}
                  </button>
                  <p className="small-copy">パスワードは8文字以上で、英字と数字を含めてください。</p>
                </div>
              )
            ) : (
              <span className="pill warning">デモモード</span>
            )}
            {!authUser ? <p className="small-copy">一度ログインすると、ログアウトするまで自動ログインされます。</p> : null}
          </section>

          <section className="panel">
            <p className="panel-label">家族</p>
            <h2>通知先を追加</h2>
            <div className="family-add-form">
              <input value={familyName} onChange={(event) => setFamilyName(event.target.value)} placeholder="家族の名前" />
              <input value={familyEmail} onChange={(event) => setFamilyEmail(event.target.value)} placeholder="家族のメール" type="email" />
              <button type="button" className={familyAdding ? "is-busy" : ""} onClick={handleAddFamily} disabled={familyAdding}>
                {familyAdding ? "追加中..." : "追加"}
              </button>
            </div>
            <div className="family-list">
              {watchLinks.map((link) => (
                <article className="family-item" key={link.id}>
                  <div>
                    <h3>{link.familyName}</h3>
                    <p>{link.familyEmail}</p>
                    <span className={link.inviteStatus === "accepted" || link.active ? "pill success" : "pill warning"}>
                      {link.inviteStatus === "accepted" || link.active ? "承認済み" : "招待待ち"}
                    </span>
                    <span className={link.pushEnabled ? "pill success" : "pill"}>通知優先: {channelLabel(link)}</span>
                    {link.active ? (
                      <PushRegistration lineLinkCode={link.lineLinkCode} enabled={Boolean(link.pushEnabled)} />
                    ) : (
                      <p className="small-copy">家族が招待リンクを承認すると、アプリ通知を登録できます。</p>
                    )}
                  </div>
                  <div className="family-actions">
                    <button type="button" onClick={() => handleShareInvite(link)}>
                      共有
                    </button>
                    <a className="action-button" href={lineShareHref(link, createInviteUrl(link))} target="_blank" rel="noreferrer">
                      LINEで送る
                    </a>
                    <a className="action-button" href={inviteMailHref(link, createInviteUrl(link))}>
                      招待メール
                    </a>
                    <button
                      type="button"
                      className={deactivatingId === link.id ? "is-busy" : ""}
                      onClick={() => handleDeactivate(link)}
                      disabled={!link.active || deactivatingId === link.id}
                    >
                      {deactivatingId === link.id ? "処理中..." : link.active ? "見守り解除" : "解除済み"}
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
                    disabled={Boolean(frequencySaving)}
                  />
                  <span className={frequencySaving === option.value ? "is-saving" : ""}>
                    {frequencySaving === option.value ? "保存中..." : option.label}
                  </span>
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
            {authUser ? (
              <PushRegistration
                userId={authUser.uid}
                enabled={Boolean(profile.pushEnabled)}
                label="本人通知を登録"
              />
            ) : null}
            <button type="button" className={`wide-action ${installingApp ? "is-busy" : ""}`} onClick={handleInstallApp} disabled={isStandalone || installingApp}>
              {installingApp ? "処理中..." : isStandalone ? "ホーム画面から起動中" : deferredInstallPrompt ? "ホーム画面に追加" : "追加方法を表示"}
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
