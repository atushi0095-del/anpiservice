"use client";

import { useState } from "react";
import { toAppErrorMessage } from "@/lib/auth-errors";
import { getFirebaseClients, hasFirebaseConfig } from "@/lib/firebase";

type PushRegistrationProps = {
  lineLinkCode?: string;
  userId?: string;
  enabled: boolean;
  label?: string;
};

export function PushRegistration({ lineLinkCode, userId, enabled, label = "アプリ通知を登録" }: PushRegistrationProps) {
  const [status, setStatus] = useState(enabled ? "アプリ通知は登録済みです。" : "Androidアプリで通知を登録できます。");
  const [registering, setRegistering] = useState(false);

  async function handleRegisterPush() {
    setRegistering(true);
    try {
      const [{ Capacitor }, { PushNotifications }] = await Promise.all([
        import("@capacitor/core"),
        import("@capacitor/push-notifications")
      ]);

      if (!Capacitor.isNativePlatform()) {
        setStatus("アプリ通知はAndroidアプリ版で利用できます。Web版ではメール通知を使います。");
        return;
      }

      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== "granted") {
        setStatus("通知が許可されませんでした。端末設定から通知を許可してください。");
        return;
      }

      await PushNotifications.register();

      await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const openPath = event.notification.data?.openPath;
        if (typeof openPath === "string") {
          window.location.href = openPath;
        } else {
          window.location.href = "/";
        }
      });

      const registration = await new Promise<string>((resolve, reject) => {
        const cleanup: Array<{ remove: () => Promise<void> }> = [];

        PushNotifications.addListener("registration", (token) => {
          resolve(token.value);
        }).then((handle) => cleanup.push(handle));

        PushNotifications.addListener("registrationError", (error) => {
          reject(error);
        }).then((handle) => cleanup.push(handle));

        window.setTimeout(() => {
          cleanup.forEach((handle) => handle.remove());
        }, 15000);
      });

      const token = userId && hasFirebaseConfig() ? await getFirebaseClients().auth.currentUser?.getIdToken() : undefined;
      const response = await fetch("/api/push/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          lineLinkCode,
          userId,
          pushToken: registration
        })
      });

      if (!response.ok) {
        throw new Error("アプリ通知の登録に失敗しました。");
      }

      setStatus("アプリ通知を登録しました。未チェックイン時はこちらへ通知します。");
    } catch (error) {
      setStatus(toAppErrorMessage(error));
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="push-registration">
      <p>{status}</p>
      <button type="button" onClick={handleRegisterPush} disabled={registering || enabled}>
        {registering ? "登録中..." : enabled ? "登録済み" : label}
      </button>
    </div>
  );
}
