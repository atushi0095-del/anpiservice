# GitHub + Vercel 公開手順

## 1. GitHubへpush

```powershell
git add .
git commit -m "Prepare Vercel production deploy"
git push
```

GitHubリポジトリが未作成の場合は、GitHubで空のリポジトリを作り、表示された `git remote add origin ...` を実行してからpushする。

## 2. VercelへImport

Vercelで `Add New Project` からGitHubリポジトリを選ぶ。

- Framework Preset: Next.js
- Build Command: `npm run build`
- Output Directory: 空欄

## 3. Vercel環境変数

Vercel Project Settings の Environment Variables に以下を設定する。

### Firebase Web

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### Firebase Admin

Firebase Consoleでサービスアカウント鍵を作り、以下を設定する。

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`

`FIREBASE_PRIVATE_KEY` は改行を `\n` として1行で貼る。

### LINE

LINE DevelopersのMessaging APIチャネルから取得する。

- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL`

`NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL` はLINE公式アカウントの友だち追加URLを入れる。

### Cron

- `CRON_SECRET`

任意の長いランダム文字列を入れる。

## 4. Firebase設定

Firebase Consoleで以下を有効にする。

- Authentication: メール/パスワード
- Firestore Database

Firestore RulesとIndexesを反映する場合:

```powershell
firebase deploy --only firestore
```

Firebase CLIを使わない場合は、`firestore.rules` と `firestore.indexes.json` の内容をFirebase Consoleで反映する。

## 5. LINE Webhook設定

Vercel公開後、LINE DevelopersのWebhook URLに以下を設定する。

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/api/line/webhook
```

設定後に `Webhookの利用` をオンにし、検証ボタンで成功を確認する。

## 6. 動作確認

1. Vercel公開URLをスマホで開く
2. メールアドレスで新規登録
3. 家族の名前とメールを追加
4. 表示された `ANPI-123456` 形式のLINE連携コードをコピー
5. 家族のLINEで公式アカウントを友だち追加
6. LINEで連携コードを送信
7. 「LINE連携が完了しました」と返信されることを確認

## 7. 通知判定

Vercel Cronが30分ごとに以下を実行する。

```text
/api/jobs/evaluate-safety
```

手動で試す場合:

```powershell
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-VERCEL-DOMAIN.vercel.app/api/jobs/evaluate-safety
```

## 8. 最初の公開範囲

最初は一般公開ではなく、家族・知人など10組程度へ限定してURLを共有する。

- 通知が届くか
- 毎日チェックインできるか
- 家族側が安心感を感じるか
- 月額300円なら払うか

この4点を確認してから、正式な集客やストア公開へ進む。
