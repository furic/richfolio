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

その間、Richfolio は自動的にギャップベースの推奨にフォールバックします — ブリーフは引き続き配信されますが、AI 分析がないだけです。Claude（`CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY`）や `MISTRAL_API_KEY` も設定している場合は、Gemini が復旧するまでそのプロバイダが単独で分析を継続します — その回はデグレード扱いとなり（`⚠ 1/2 AI` バッジ）、STRONG BUY は BUY に上限が下がります。

---

## Claude がブリーフから静かに欠落する

**原因：** `CLAUDE_CODE_OAUTH_TOKEN` の期限切れまたは未設定は、`ANTHROPIC_API_KEY` が欠けている場合とまったく同じ症状になります — Claude が単に存在しなくなるだけです。Claude 単独の構成では、ブリーフは黙ってギャップベースの推奨にフォールバックします。マルチ AI 構成では、残りのプロバイダが続行し、その回はデグレード扱いになります（`⚠ 1/2 AI` バッジ、STRONG BUY は BUY に上限）。派手なエラーは出ないため、Claude プロバイダの認証失敗がないか GitHub Actions の実行ログを確認してください。

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
- AI キーを 2 つ以上設定 → マルチ AI モード：スコアは平均化され、各推奨の下に AI ごとの内訳が表示され、STRONG BUY は全 AI の一致が必要
- `TELEGRAM_BOT_TOKEN` なし → メールのみ（Telegram なし）

すべての組み合わせが有効です — 必須なのは `RESEND_API_KEY` と `RECIPIENT_EMAIL` だけです。
