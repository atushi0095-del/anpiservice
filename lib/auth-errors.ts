export function toAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("auth/email-already-in-use")) {
    return "このメールアドレスはすでに登録されています。ログインをお試しください。";
  }

  if (message.includes("auth/invalid-email")) {
    return "メールアドレスの形式を確認してください。";
  }

  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
    return "メールアドレスまたはパスワードが違います。";
  }

  if (message.includes("auth/weak-password")) {
    return "パスワードは8文字以上で、英字と数字を含めてください。";
  }

  if (message.includes("auth/configuration-not-found") || message.includes("auth/operation-not-allowed")) {
    return "Firebase Authentication の設定を確認してください。";
  }

  if (message.includes("auth/too-many-requests")) {
    return "試行回数が多すぎます。少し時間をおいてからもう一度お試しください。";
  }

  return message || "認証に失敗しました。";
}

export function toAppErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("Cloud Firestore API has not been used") ||
    message.includes("firestore.googleapis.com") ||
    message.includes("PERMISSION_DENIED")
  ) {
    return "Firebase の Firestore がまだ有効になっていません。Firebase コンソールで Firestore Database を有効化し、少し待ってからもう一度お試しください。";
  }

  if (message.includes("invite-error:")) {
    return message.replace("invite-error:", "").trim() || "招待の処理に失敗しました。";
  }

  if (message.includes("client is offline") || message.includes("offline") || message.includes("unavailable")) {
    return "通信できませんでした。インターネット接続を確認し、少し時間をおいてもう一度お試しください。";
  }

  if (message.includes("permission-denied") || message.includes("Missing or insufficient permissions")) {
    return "この情報を見る権限がありません。ログイン中のアカウントを確認してください。";
  }

  if (message.includes("not-found")) {
    return "必要なデータが見つかりませんでした。";
  }

  if (message.includes("Firebase environment variables")) {
    return "Firebase の設定が不足しています。Vercel の環境変数と Firebase 設定を確認してください。";
  }

  return message || "処理に失敗しました。";
}

export function isStrongEnoughPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}
