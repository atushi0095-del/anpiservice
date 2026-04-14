# Android公開準備チェックリスト

## 1. Firebase Androidアプリ登録

Firebase ConsoleでAndroidアプリを追加する。

- Android package name: `jp.anpinote.app`
- App nickname: `あんぴノート Android`
- Debug signing certificate SHA-1: 最初は未入力でもよい

登録後、`google-services.json` をダウンロードし、次へ配置する。

```text
android/app/google-services.json
```

`google-services.json` は `.gitignore` 済みのため、GitHubにはpushしない。

## 2. Android Studioで起動

```powershell
npm run android:sync
npm run android:open
```

Android Studioで開いたら、実機またはエミュレーターを選んでRunする。

このPCの現在の `java -version` は Java 8 のため、Gradle CLIビルドにはJava 11以上が必要。
Android Studioで開く場合は、Android Studio同梱JDKを使えばよい。

CLIでビルドする場合は、JDK 17をインストールし、`JAVA_HOME` をJDK 17へ向ける。

例:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
cd android
.\gradlew.bat assembleDebug
```

## 3. Push通知テスト

1. Androidアプリを起動
2. 家族カードの `アプリ通知を登録` を押す
3. Androidの通知許可ダイアログで許可
4. 通知優先が `アプリ通知` になることを確認
5. Firestoreの `watchLinks` に `pushToken` と `pushEnabled: true` が保存されることを確認

## 4. Google Play内部テスト

Google Play Consoleでアプリを作成する。

- アプリ名: `あんぴノート`
- デフォルト言語: 日本語
- アプリ/ゲーム: アプリ
- 無料/有料: 最初は無料

内部テストで確認する。

- ログインできる
- チェックインできる
- 家族メール追加ができる
- アプリ通知登録ができる
- 未チェックイン時の通知が届く

## 5. 公開前の注意

- プライバシーポリシーURLをGoogle Play Consoleへ登録
- 利用規約URLをアプリ内に表示
- 「救急通報ではない」免責を明記
- 位置情報を取得しない方針を明記
- 通知が遅延/不達になる可能性を明記
