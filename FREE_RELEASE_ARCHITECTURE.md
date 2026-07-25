# 無料版のデータ保存方針

## 結論

初回公開版は、利用者数が増えてもFirebaseの読み書き費用が発生しない構成とする。

## 無料版で利用するもの

- 端末内保存: 家族、連絡先、防災メモ、備蓄、安否記録、共有文テンプレート
- Vercel: Web画面の配信
- 端末の位置情報: 本人がONにした時だけ取得
- OpenStreetMap: 位置情報ON時の地図プレビュー
- Google Maps: 本人が「Googleマップで開く」を選んだ時
- Android/ブラウザの共有機能: LINE、メール等へ本人が送信した時

## 無料版で停止するもの

- Firebase Authentication
- Cloud Firestore
- Firebase Cloud Messaging
- ログインと新規登録
- 招待と相互承認
- アプリ内の安否・位置同期
- プッシュ通知
- クラウドバックアップ

クライアントは`NEXT_PUBLIC_CLOUD_FEATURES_ENABLED=true`、サーバーは`CLOUD_FEATURES_ENABLED=true`が
明示された場合だけクラウド機能を有効にする。既定値は停止である。

AndroidのGoogle Servicesプラグインも、Gradleプロパティ`KOKOSHARE_CLOUD_ENABLED=true`を明示した場合だけ適用する。
無料版AABではFirebase Messagingの自動初期化を停止し、通知権限を削除する。

## 将来の有料版

有料版では、継続的な運営費をまかなえる料金設計を確定した後に、次の機能を段階的に有効化する。

- 招待と相互承認
- アプリ内の安否・位置共有
- プッシュ通知
- 複数端末同期
- バックアップ

位置情報は有料版でも常時追跡せず、共有期限を設け、必要最小限の保存に限定する。
