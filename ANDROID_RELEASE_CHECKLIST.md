# ここシェア Android公開チェックリスト

## 公開版の構成

- 無料版はログイン、Firebase Authentication、Firestore、FCMを使用しない
- 家族、防災メモ、備蓄、安否記録は端末内に保存する
- 位置情報は本人がONにした時だけ取得する
- 位置情報は運営データベースへ保存しない
- 地図プレビューはOpenStreetMap、地図を開く操作はGoogle Mapsを利用する
- 安否と現在地は、本人が選んだLINE、メール等へOS共有画面から送る
- 将来の有料版用クラウド実装はコードに残すが、既定値では停止する

クラウド機能を将来有効にする場合だけ、Web側で次の両方を設定する。

```text
NEXT_PUBLIC_CLOUD_FEATURES_ENABLED=true
CLOUD_FEATURES_ENABLED=true
```

無料版では設定しない。

## Androidアプリ情報

- アプリ名: `ここシェア`
- パッケージ名: `com.ajuworks.kokoshare`
- versionCode: `1`
- versionName: `1.0.0`
- targetSdkVersion: `36`
- Firebase: 無効
- 通知権限: なし
- 位置情報権限: 前景での概算位置・正確な位置

## ローカル確認

```powershell
npx tsc --noEmit
npm test
npm run build
npm run android:sync
cd android
.\gradlew.bat clean bundleRelease
```

作成先:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## 実機確認

- 初回同意画面を最後まで進められる
- 防災メモ、備蓄、家族情報が再起動後も残る
- 「無事です」が端末内へ記録される
- 位置情報が初期OFFである
- 位置情報ON時だけAndroidの許可画面が表示される
- 地図プレビューと「Googleマップで開く」が動く
- 「送るアプリを選ぶ」でLINE、メール等の選択画面が開く
- 共有文に必要な時だけ地図リンクが含まれる
- ログイン、招待承認、アプリ内送信、通知許可が表示されない
- データ初期化前に確認画面が表示される
- オフライン再起動時に保存済み情報を確認できる

## Google Play Console

- デフォルト言語: 日本語
- アプリ/ゲーム: アプリ
- 価格: 無料
- 対象ユーザー: 初回は18歳以上
- 広告: なし
- アカウント作成: なし
- アカウント削除URL: 不要。端末内データの削除方法はプライバシーポリシーに記載
- プライバシーポリシー: `https://anpinote.vercel.app/privacy`

データセーフティ回答では、端末内保存、任意の位置情報、Vercelによる画面配信、OpenStreetMap/Google Mapsへの外部送信、
利用者が選んだ共有先への送信を実際の挙動に合わせて申告する。

## 公開前の注意

- AABの署名とパッケージ名を確認する
- 統合後のAndroidManifestに通知権限がないことを確認する
- Google Playの内部テストで実機確認する
- 本番公開前にプライバシーポリシーURLが一般公開されていることを確認する
- 署名鍵と`keystore.properties`を別の安全な場所へバックアップする
