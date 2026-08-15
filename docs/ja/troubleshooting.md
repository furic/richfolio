---
title: トラブルシューティング
layout: default
nav_order: 8
lang: ja
permalink: /troubleshooting.html
---

# トラブルシューティング

よくある問題とその対処法。

---

## "Can only send testing emails to your own email address"

**原因：** Resend 無料枠の制限です。

**対処：** `RECIPIENT_EMAIL` を Resend にサインアップしたときに使ったメールアドレスと同じものに設定するか、Resend でカスタムドメインを認証してください（Dashboard → Domains → Add Domain → DNS レコードを追加）。

---

## "GEMINI_API_KEY quota: limit 0"

**原因：** 新しい Gemini API キーは有効化に数分かかります。請求と API が有効化されていないと、一部のキーはまったく動作しないことがあります。

**対処：** 以下の手順を順番に試してください：

1. **5〜10 分待つ** — 新しいキーは有効化に時間が必要なことがあります
2. **Generative Language API を有効化** — [Google Cloud Console](https://console.cloud.google.com/apis/library) に移動 → 「Generative Language API」を検索 → API キーに関連付けられたプロジェクトで **Enable** をクリック
3. **請求情報を追加** — [Google AI Studio](https://aistudio.google.com) に移動 → Settings → Billing で請求情報を追加。**無料枠**を選択することは引き続き可能です — 請求情報の追加はキーの有効化のためで、無料の制限を超えない限り課金されません

その間、Richfolio は自動的にギャップベースの推奨にフォールバックします — ブリーフは引き続き配信されますが、AI 分析がないだけです。Claude（`CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY`）や `MISTRAL_API_KEY` も設定している場合は、Gemini が復旧するまでそのプロバイダが単独で分析を継続します — その回はデグレード扱いとなり（`⚠ 1/2 AI` バッジ）、単独プロバイダの投票がクロスチェック済みのものと同じには見えないようになります。

---

## "gemini-2.5-flash is no longer available to new users"

**原因：** Google は古いキーより先に**新しい**API キーに対してモデルを終了します。新規作成したキーは `gemini-2.5-flash` で `404` を受け取る一方、同じモデルでも既存のキーは正常に動作します — そのため、初期設定時ではなく 2 つ目の Gemini キーを追加した直後に現れるのが典型的です。

```
404 ... models/gemini-2.5-flash is no longer available to new users.
```

**対処：** `GEMINI_MODEL` 環境変数を現行モデルに設定します。`gemini-flash-latest` は常に最新の Flash を指すエイリアスなので、次に Google がモデルを入れ替えても壊れません。

```yaml
GEMINI_MODEL: gemini-flash-latest
```

正常に動作している既存キーを気付かないうちに別モデルへ移してしまわないよう、デフォルトは意図的に `gemini-2.5-flash` のままにしてあります。暗号資産ワークフローでは既に設定済みです。メインのキーが同じエラーに遭遇したら、`GEMINI_MODEL` をリポジトリの**変数（Variable）**として追加してください — コード変更は不要です。

---

## 暗号資産クロスペアがブリーフに出てこない

**原因：** おおむね次の 3 つのいずれかです（可能性の高い順）。

**対処：**

1. **未設定** — `watchingCrypto` はローカルの `config.json` だけでなく、`CONFIG_JSON` 変数に入っている必要があります。各要素は `"BASE/QUOTE"` 形式の文字列でなければならず、形式が不正な要素は実行を止めずに警告付きでスキップされます。
2. **その市場が存在しない** — ログには試した 2 つのシンボルが出ます（例：`no tradable spot market for NOPE_CRO or CRO_NOPE`）。crypto.com が*どちらかの*方向でそのペアを上場している必要があります。逆方向しか無い場合、Richfolio は自動的に逆数化します。
3. **ネットワークまたは地域ブロック** — `403`／`451` はログ上で地域ブロックの可能性として明示されます。crypto.com が米国居住者に制限しているのは*取引*であり、GitHub ランナーからのマーケットデータがブロックされた例は確認されていません。リポジトリ → **Actions** → **Crypto Monitor** → **Run workflow** → モード `smoke` で検証でき、API の疎通チェックを行ってどのステップで失敗したかを出力します。

---

## Claude がブリーフから静かに欠落する

**原因：** `CLAUDE_CODE_OAUTH_TOKEN` の期限切れまたは未設定は、`ANTHROPIC_API_KEY` が欠けている場合とまったく同じ症状になります — Claude が単に存在しなくなるだけです。Claude 単独の構成では、ブリーフは黙ってギャップベースの推奨にフォールバックします。マルチ AI 構成では、残りのプロバイダが続行し、その回はデグレード扱いになります（`⚠ 1/2 AI` バッジ）。派手なエラーは出ないため、Claude プロバイダの認証失敗がないか GitHub Actions の実行ログを確認してください。

**対処：** サブスクリプショントークンは約 1 年で失効し、自動更新はありません。ローカルで `claude setup-token` を再実行してトークンを再発行し、`CLAUDE_CODE_OAUTH_TOKEN` の Secret を更新してください。代わりに従量課金にしたい場合は、`ANTHROPIC_API_KEY` を設定し、`CLAUDE_CODE_OAUTH_TOKEN` は未設定のままにしてください。

---

## あるティッカーで "fetch failed — internal-error" が出る

**原因：** Yahoo Finance は特定のティッカー（特に BIPC のようにあまり一般的でないもの）で時折問題が起きることがあります。

**対処：** 対応不要です。そのティッカーはスキップされ、残りは通常通り続行されます。これは Yahoo Finance の断続的な問題です。

---

## GitHub Actions で Secret が空に表示される

**原因：** Secret が間違ったレベルで追加されました。

**対処：** Secret が**リポジトリ**レベルで追加されていることを確認してください：Settings → Secrets and variables → Actions → Repository secrets。環境レベルではありません。

---

## ニュースが返ってこない

**原因：** NewsAPI 無料枠は直近 24 時間の記事のみを返します。一部のティッカー（特に ETF や小型株）はニュースヘッドラインに登場することが稀です。

**対処：** これは正常な挙動です。それらのティッカーについてはニュースなしでブリーフは問題なく実行されます。AI 分析は推奨の中で「最近のニュースなし」と記載します。

---

## Telegram メッセージが届かない

**原因：** ボットとの会話をまだ開始していません。

**対処：** Telegram を開き、ユーザー名でボットを検索し、何かメッセージ（例：「hi」）を送ってください。Telegram Bot API では、ボットがメッセージを送れるようにするにはユーザーが先にコンタクトを開始する必要があります。その後、Richfolio を再実行してください。

---

## "Missing config.json" エラー

**原因：** プロジェクトルートに `config.json` が存在しません。

**対処：**
- **GitHub Actions：** `CONFIG_JSON` 変数が有効な JSON 内容で存在することを確認してください（Settings → Secrets and variables → Actions → **Variables** タブ）。
- **ローカル：** `cp config.example.json config.json` を実行し、ポートフォリオデータで編集してください。

---

## ブリーフは実行されるがメールが空、またはセクションが欠けている

**原因：** 1 つ以上の API キーが欠けているか無効です。

**対処：** `.env` ファイル（ローカル）または GitHub Secret（Actions）を確認してください。ブリーフは利用可能なものに応じて適応します：
- `NEWS_API_KEY` なし → ニュースセクションなし
- `GEMINI_API_KEY`、Claude（`CLAUDE_CODE_OAUTH_TOKEN`／`ANTHROPIC_API_KEY`）、`MISTRAL_API_KEY` のいずれもなし → AI ではなくギャップベースの推奨
- AI キーのいずれか 1 つだけ設定 → シングル AI モード（現在の挙動）
- AI キーを 2 つ以上設定 → マルチ AI モード：スコアは平均化され、各推奨の下に AI ごとの内訳が表示され、STRONG BUY は反対意見の距離で上限を判断（反対が BUY なら維持、`HOLD`／`WAIT` があれば BUY に上限）
- `TELEGRAM_BOT_TOKEN` なし → メールのみ（Telegram なし）

すべての組み合わせが有効です — 必須なのは `RESEND_API_KEY` と `RECIPIENT_EMAIL` だけです。
