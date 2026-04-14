export function toAuthMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("auth/email-already-in-use")) {
    return "このメールアドレスは登録済みです。ログインをお試しください。";
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
    return "Firebase Authenticationのメール/パスワード認証を有効にしてください。";
  }

  if (message.includes("auth/too-many-requests")) {
    return "ログイン試行が多すぎます。少し時間をおいてから再度お試しください。";
  }

  return message || "認証に失敗しました。";
}

export function isStrongEnoughPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}
