# ここシェア 1.0.0 Release Build Report

作成日: 2026-07-25

## AAB

- ファイル: `release/kokoshare-1.0.0.aab`
- 元の出力: `android/app/build/outputs/bundle/release/app-release.aab`
- サイズ: `3,024,843 bytes`
- SHA-256: `2779630701BA83B97E81772F720BE6F4D84B4B5C0129A16DE7715E9A17BEE4FE`

## Android情報

- アプリ名: `ここシェア`
- パッケージ名: `com.ajuworks.kokoshare`
- versionCode: `1`
- versionName: `1.0.0`
- minSdkVersion: `24`
- targetSdkVersion: `36`
- MainActivity: `com.ajuworks.kokoshare.MainActivity`

## 署名

- 状態: Release upload keyで署名済み
- jarsigner: 検証成功
- SHA-1: `56:F2:3B:70:D6:84:7A:BB:AD:62:6D:B2:5F:D8:AB:36:4B:76:F1:86`
- SHA-256: `33:5C:29:29:70:83:D2:C3:D7:FC:2D:85:5F:BD:CE:14:5C:AA:2E:99:8A:37:07:25:01:73:63:89:8A:B0:32:04`

自己署名のupload keyであることとタイムスタンプがないことに関するjarsignerの警告は、Android upload keyとして想定される状態である。
署名鍵はGoogle Play App SigningへAABをアップロードするための鍵であり、Google Play配信時のアプリ署名鍵とは別になる。

## 権限

- `android.permission.INTERNET`
- `android.permission.ACCESS_COARSE_LOCATION`
- `android.permission.ACCESS_FINE_LOCATION`
- AndroidX内部の署名保護permission

`POST_NOTIFICATIONS`と`VIBRATE`は含まれていない。

## Firebase・クラウド

- Firebase Authentication: 無効
- Cloud Firestore: 無効
- Firebase Cloud Messaging: 無効
- Google Services Gradleプラグイン: 無料版では不使用
- Release runtime依存関係: Firebase、Google Services、Capacitor Pushなし
- AAB内のCapacitorプラグイン: `@capacitor/share`のみ
- `google-services.json`: AABへ含めていない

## 保存と共有

- 家族、防災メモ、備蓄、安否記録: 端末内保存
- 位置情報: 本人がONにした時だけ前景で取得
- 運営データベースへの位置保存: なし
- 地図プレビュー: OpenStreetMap
- 地図を開く: Google Maps
- 外部共有: Android共有画面からLINE、メール等へ利用者が送信

## 検証結果

- `npx tsc --noEmit`: 成功
- `npm test`: 3 tests passed
- `npm run build`: 成功
- `npm run android:sync`: 成功。AndroidプラグインはShareのみ
- `gradlew clean bundleRelease`: 成功
- merged AndroidManifest確認: パッケージ、バージョン、権限が想定どおり
- releaseRuntimeClasspath確認: Firebase、Google Services、Push SDKなし
- 旧パッケージ`jp.anpinote.app`: プロジェクト内参照なし

## 未完了の外部確認

- Google Play ConsoleへのAABアップロード
- Google Play App Signing後の証明書確認
- 内部テストトラックからインストールした実機での最終確認
- Google Playのデータセーフティ・コンテンツレーティング審査
