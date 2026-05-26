"use client";

import { useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User
} from "firebase/auth";
import { PushRegistration } from "@/components/push-registration";
import { isStrongEnoughPassword, toAppErrorMessage, toAuthMessage } from "@/lib/auth-errors";
import { getFirebaseClients, hasFirebaseConfig } from "@/lib/firebase";

type InviteAcceptanceProps = {
  code: string;
};

type InvitePreview = {
  code: string;
  familyName: string;
  familyEmail: string;
  inviteStatus: "pending" | "accepted";
  member: {
    id: string;
    displayName: string;
    email: string;
  };
};

const appName = "いまここ安否ノート";

export function InviteAcceptance({ code }: InviteAcceptanceProps) {
  const firebaseEnabled = hasFirebaseConfig();
  const normalizedCode = decodeURIComponent(code).trim().toUpperCase();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("招待を確認しています。");
  const [loading, setLoading] = useState(true);
  const [acceptedCode, setAcceptedCode] = useState<string | null>(null);
  const [mutualWatch, setMutualWatch] = useState(true);
  const [authAction, setAuthAction] = useState<"signin" | "signup" | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${encodeURIComponent(normalizedCode)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "招待を確認できませんでした。");
        }
        setInvite(data as InvitePreview);
        setEmail((data as InvitePreview).familyEmail || "");
        setMessage("招待内容を確認してください。");
      })
      .catch((error) => setMessage(toAppErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [normalizedCode]);

  useEffect(() => {
    if (!firebaseEnabled) {
      return;
    }

    const { auth } = getFirebaseClients();
    return onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user?.email) {
        setEmail(user.email);
      }
    });
  }, [firebaseEnabled]);

  async function handleAuth(mode: "signin" | "signup") {
    if (!firebaseEnabled) {
      setMessage("Firebase設定後に招待承認を利用できます。");
      return;
    }

    setAuthAction(mode);
    setMessage(mode === "signin" ? "ログインしています..." : "新規登録しています...");
    try {
      const { auth } = getFirebaseClients();
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (!guardianConsent) {
          setMessage("新規登録には、18歳以上であること、または保護者同意の確認が必要です。");
          return;
        }
        if (!isStrongEnoughPassword(password)) {
          setMessage("パスワードは8文字以上で、英字と数字を含めてください。");
          return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setPassword("");
      setMessage("ログインできました。承認ボタンを押してください。");
    } catch (error) {
      setMessage(toAuthMessage(error));
    } finally {
      setAuthAction(null);
    }
  }

  async function handleAccept() {
    if (!authUser) {
      setMessage("先にメールでログイン、または新規登録してください。");
      return;
    }

    setAccepting(true);
    setMessage("招待を承認しています...");
    try {
      const token = await authUser.getIdToken();
      const response = await fetch(`/api/invites/${encodeURIComponent(normalizedCode)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ mutualWatch })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ? `invite-error: ${data.error}` : "招待の承認に失敗しました。");
      }
      setAcceptedCode(data.lineLinkCode);
      setMessage("招待を承認しました。必要なら通知設定を続けてください。");
    } catch (error) {
      setMessage(toAppErrorMessage(error));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="phone-app invite-page">
      <header className="app-header">
        <div className="brand-row">
          <img src="/icon.svg" alt={appName} className="app-icon" />
          <div>
            <p className="eyebrow">招待承認</p>
            <h1>{appName}</h1>
          </div>
        </div>
      </header>

      <p className={`app-message ${loading || authAction || accepting ? "is-busy" : ""}`}>
        {loading ? "読み込み中です..." : message}
      </p>

      <section className="panel invite-card">
        <p className="panel-label">招待内容</p>
        <h2>{invite ? `${invite.member.displayName} さんとつながる` : "招待を確認中"}</h2>
        <p>
          承認すると、家族や友達として安否確認と時間限定の位置共有を使えるようになります。
          本人の共有情報は、明示操作した時だけ相手に届きます。
        </p>
        {invite ? (
          <div className="setting-line">
            <span>招待先メール</span>
            <strong>{invite.familyEmail}</strong>
          </div>
        ) : null}
      </section>

      {!authUser ? (
        <section className="panel">
          <p className="panel-label">アカウント</p>
          <h2>ログインまたは新規登録</h2>
          <div className="auth-form invite-auth">
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="メールアドレス" type="email" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="パスワード（8文字以上）" type="password" />
            {authAction !== "signin" ? (
              <label className="check-row legal-check-row">
                <input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} />
                <span>18歳以上です。または、保護者の同意を得て利用します。</span>
              </label>
            ) : null}
            <button type="button" className={authAction === "signin" ? "is-busy" : ""} onClick={() => handleAuth("signin")} disabled={Boolean(authAction)}>
              {authAction === "signin" ? "ログイン中..." : "ログイン"}
            </button>
            <button type="button" className={authAction === "signup" ? "is-busy" : ""} onClick={() => handleAuth("signup")} disabled={Boolean(authAction)}>
              {authAction === "signup" ? "登録中..." : "新規登録"}
            </button>
          </div>
          <p className="small-copy">ログインすると承認できます。新規登録した場合も、そのまま承認に進めます。</p>
        </section>
      ) : (
        <section className="panel">
          <p className="panel-label">承認</p>
          <h2>{authUser.email} でログイン中です</h2>
          <label className="check-row">
            <input type="checkbox" checked={mutualWatch} onChange={(event) => setMutualWatch(event.target.checked)} />
            <span>自分も相手の状況を受け取る</span>
          </label>
          <button
            type="button"
            className={`wide-action ${accepting ? "is-busy" : ""}`}
            onClick={handleAccept}
            disabled={accepting || Boolean(acceptedCode)}
          >
            {accepting ? "承認中..." : acceptedCode ? "承認済み" : "招待を承認する"}
          </button>
          {acceptedCode ? <PushRegistration lineLinkCode={acceptedCode} enabled={false} /> : null}
        </section>
      )}

      <footer>
        <a href="/">アプリを開く</a>
        <a href="/privacy">プライバシーポリシー</a>
      </footer>
    </main>
  );
}
