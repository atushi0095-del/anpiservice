# Google Play 公開準備メモ

## AAB 出力先
`android/app/build/outputs/bundle/release/app-release.aab`

## ローカルで保管するもの
- `android/app/upload-keystore.jks`
- `android/keystore.properties`

この2つはバックアップしてください。なくすと同じ upload key で更新できなくなります。
## Androidアプリ情報
- アプリ名: `ここシェア`
- パッケージ名: `com.ajuworks.kokoshare`
- versionCode: `1`
- versionName: `1.0.0`
- targetSdkVersion: `36`

## 初回公開版

- Firebase Authentication / Firestore / FCM: 無効
- 保存先: 端末内
- 通知権限: なし
- 位置情報: 本人がONにした時だけ前景で取得
