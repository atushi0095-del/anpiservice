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
      setMessage("ログインしました。承認ボタンを押してください。");
    } catch (error) {
      setMessage(toAuthMessage(error));
    } finally {
      setAuthAction(null);
    }
  }

  async function handleAccept() {
    if (!authUser) {
      setMessage("先にメールでログインまたは新規登録してください。");
      return;
    }

    setAccepting(true);
    setMessage("見守りを承認しています...");
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
      setMessage("見守り招待を承認しました。アプリ通知を登録できます。");
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
          <img src="/icon.svg" alt="あんぴノート" className="app-icon" />
          <div>
            <p className="eyebrow">見守り招待</p>
            <h1>あんぴノート</h1>
          </div>
        </div>
      </header>

      <p className={`app-message ${loading || authAction || accepting ? "is-busy" : ""}`}>{loading ? "読み込み中です..." : message}</p>

      <section className="panel invite-card">
        <p className="panel-label">招待内容</p>
        <h2>{invite ? `${invite.member.displayName} さんを見守る` : "招待を確認中"}</h2>
        <p>
          承認すると、未チェックイン時にこの家族アカウントへ通知できるようになります。
          本人の見守り情報は、承認した家族だけが確認できます。
        </p>
        {invite ? (
          <div className="setting-line">
            <span>招待先</span>
            <strong>{invite.familyEmail}</strong>
          </div>
        ) : null}
      </section>

      {!authUser ? (
        <section className="panel">
          <p className="panel-label">家族アカウント</p>
          <h2>ログインまたは登録</h2>
          <div className="auth-form invite-auth">
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="メールアドレス" type="email" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="パスワード 8文字以上" type="password" />
            <button type="button" className={authAction === "signin" ? "is-busy" : ""} onClick={() => handleAuth("signin")} disabled={Boolean(authAction)}>
              {authAction === "signin" ? "ログイン中..." : "ログイン"}
            </button>
            <button type="button" className={authAction === "signup" ? "is-busy" : ""} onClick={() => handleAuth("signup")} disabled={Boolean(authAction)}>
              {authAction === "signup" ? "登録中..." : "新規登録"}
            </button>
          </div>
          <p className="small-copy">パスワードは8文字以上で、英字と数字を含めてください。一度ログインすると次回から自動ログインされます。</p>
        </section>
      ) : (
        <section className="panel">
          <p className="panel-label">承認</p>
          <h2>{authUser.email} で承認します</h2>
          <label className="check-row">
            <input type="checkbox" checked={mutualWatch} onChange={(event) => setMutualWatch(event.target.checked)} />
            <span>自分も相手に見守ってもらう</span>
          </label>
          <button
            type="button"
            className={`wide-action ${accepting ? "is-busy" : ""}`}
            onClick={handleAccept}
            disabled={accepting || Boolean(acceptedCode)}
          >
            {accepting ? "承認中..." : acceptedCode ? "承認済み" : "見守りを承認"}
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
