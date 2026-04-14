# Androidアプリ通知への移行計画

## 方針

LINE通知は将来の補助通知として残し、Android版ではFirebase Cloud Messagingのプッシュ通知を主通知にする。

理由:

- LINEは通知数が増えると月額費用が増える
- Google Play Consoleは初回登録費用で公開を始められる
- Firebase Cloud MessagingはAndroidアプリ通知の標準的な選択肢
- ユーザー体験としても、見守りアプリから直接通知が届く方が自然

## 通知の優先順位

本番では次の順番で通知する。

1. アプリプッシュ通知
2. LINE通知
3. メール代替ログ

LINEは削除しない。家族がLINEを希望する場合、またはアプリ通知を許可していない場合の補助通知として残す。

## 低コスト運用

### 最初

- PWAをVercelで公開
- Firebase AuthenticationとFirestoreを使用
- LINE連携は残す
- 少人数で実利用テスト

### Android公開時

- Google Play Consoleへ登録
- PWAをCapacitorでAndroidアプリ化
- Firebase Cloud Messagingを追加
- 家族端末のFCM tokenをFirestoreに保存
- 未チェックイン時はFCM tokenへ通知

## 必要なデータ追加

`watchLinks` に次の項目を追加する。

- `pushToken`: 家族端末のFCM registration token
- `pushEnabled`: アプリ通知が許可されているか
- `pushLinkedAt`: token登録日時
- `preferredChannel`: `push` / `line` / `email`

通知判定では `preferredChannel` を見て送信する。

現在のWeb APIでは、次の順番で通知する。

1. `pushEnabled` と `pushToken` がある場合はFirebase Cloud Messaging
2. LINE連携済みならLINE Messaging API
3. どちらも未設定ならメール代替ログ

Androidアプリ側は、FCM tokenを取得後に次のAPIへ登録する。

```text
POST /api/push/register
```

Body:

```json
{
  "lineLinkCode": "ANPI-123456",
  "pushToken": "FCM_REGISTRATION_TOKEN"
}
```

このAPIは該当する `watchLinks` に `pushToken`、`pushEnabled`、`pushLinkedAt`、`preferredChannel: "push"` を保存する。

## Android実装候補

### 推奨: Capacitor

既存のNext.js/PWAを活かしてAndroidアプリ化する。

- `@capacitor/core`
- `@capacitor/android`
- `@capacitor/push-notifications`
- Firebase Android設定の `google-services.json`

メリット:

- 既存画面を作り直さない
- Androidアプリ通知を使える
- 将来iOSへ広げやすい

### 代替: Trusted Web Activity

PWAをほぼそのままAndroidアプリとして包む。

メリット:

- 軽い
- 既存Web公開を活かせる

注意:

- ネイティブ機能の自由度はCapacitorより低い

## Google Play公開前の判断基準

次の条件を満たしたらAndroid公開へ進む。

- PWAで10組以上が実利用
- LINE通知が無料枠を超えそう
- 家族側からアプリ通知の要望がある
- 月額300円以上で払う意思があるユーザーがいる

## 収益化

### 無料

- 本人1名
- 家族1名
- アプリ通知
- 通知履歴は直近数件

### 月額300円

- 家族3名
- アプリ通知
- LINE補助通知
- 通知履歴
- 確認頻度変更

### 月額500円

- 見守り対象2名
- 家族5名
- アプリ通知
- LINE補助通知
- 優先通知

## 実装順

1. PWA公開
2. Firebase本番接続
3. LINE連携テスト
4. `watchLinks` にpush通知用フィールド追加
5. Capacitor導入
6. Android端末でFCM token取得
7. Androidアプリから `/api/push/register` へFCM tokenを登録
8. Vercel通知判定APIでFCM送信
9. Google Play内部テスト
10. クローズドテスト
11. 公開

## 現在入っているAndroid向け土台

- Capacitor設定: `capacitor.config.ts`
- Androidビルド確認: `npm run build:android`
- Android同期: `npm run android:sync`
- Android Studio起動: `npm run android:open`
- Push通知登録UI: 家族カード内の「アプリ通知を登録」
- Push token登録API: `POST /api/push/register`

Androidプロジェクトを生成するコマンド:

```powershell
npm run android:sync
npm run android:open
```

この構成では、AndroidアプリはCapacitorでVercel公開URLを表示する。Web APIもVercel上のものをそのまま使う。

Android Studioで開いた後、Firebase ConsoleからAndroidアプリ `jp.anpinote.app` を追加し、`google-services.json` をAndroidプロジェクトへ配置する。

## 注意

アプリ通知そのものはLINEのような月額メッセージ課金を避けやすいが、Firestore、Vercel、Firebase Admin/API実行の利用量に応じたコストは別に発生し得る。

そのため、通知は「毎日送る」のではなく「未チェックイン時だけ送る」設計を維持する。
