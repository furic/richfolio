---
title: API キー
layout: default
nav_order: 5
lang: ja
permalink: /api-keys.html
---

# API キー

Richfolio は最大 5 つの外部サービスを利用しますが、すべて寛大な無料枠があります。必須なのは Resend と受信メールアドレスだけ — それ以外はすべてオプションです。

各キーはリポジトリの Secret として追加します：Settings → Secrets and variables → Actions → **Secrets** タブ。`RECIPIENT_EMAIL` は代わりに **Variable** として追加してください（閲覧／編集が容易です）。

![GitHub Actions Secrets](../screenshots/github_actions_secrets.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## Resend（メール）— 必須
{: .text-green-200}

Resend は HTML メールレポートを配信します。

1. [resend.com](https://resend.com) にアクセスしてサインアップ
2. ダッシュボードで **API Keys** に移動
3. **Create API Key** をクリックし、名前を付けてキーをコピー
4. GitHub Secret として追加 — 名前：`RESEND_API_KEY`、値：先ほどコピーしたキー

**無料枠：** 月 3,000 通。デフォルトでは `onboarding@resend.dev` から送信されます。カスタムドメインを認証しない限り、**アカウント所有者のメールアドレス**にしか送信できません（Dashboard → Domains → Add Domain → DNS レコードを追加）。

---

## 受信メールアドレス — 必須
{: .text-green-200}

GitHub の **Variable**（Secret ではない）として追加：名前：`RECIPIENT_EMAIL`、値：あなたのメールアドレス。

カスタムドメインを認証していない場合、Resend アカウントのメールアドレスと一致している必要があります。

---

## NewsAPI（ヘッドライン）— オプション
{: .text-yellow-200}

毎日のブリーフに各ティッカーのトップヘッドラインを提供します。

1. [newsapi.org](https://newsapi.org) にアクセスしてサインアップ
2. ダッシュボードに API キーがすぐに表示されます
3. GitHub Secret として追加 — 名前：`NEWS_API_KEY`、値：ダッシュボードのキー

**無料枠：** 1 日 100 リクエスト。Richfolio はバッチング経由で 1 回の実行につき約 4 リクエストを使用します。直近 24 時間のヘッドラインのみ。未設定の場合、ブリーフはニュースなしで実行されます。

---

## AI プロバイダ — AI 推奨を有効にするには少なくとも 1 つ必要

Richfolio は 3 つの AI プロバイダをサポートしています：**Google Gemini**、**Anthropic Claude**、**Mistral**。AI による買い推奨を利用するには、少なくとも 1 つを設定してください。**2 つ以上**を設定すると並列で実行され、スコアが平均化され、各推奨の横にプロバイダごとの内訳が表示されます。いずれも設定されていない場合は、ギャップベースの推奨にフォールバックします（AI なし）。

| モード | 設定 | 出力 |
|---|---|---|
| **AI なし** | いずれのキーも未設定 | ギャップベースの推奨のみ |
| **シングル AI** | 1 つのキーを設定 | 従来と同じ — ティッカーごとに 1 セットのアクション＋確信度 |
| **マルチ AI** | 2 つ以上のキーを設定 | ティッカーごとのコンセンサスアクション＋平均化された確信度。各推奨の下にプロバイダごとの内訳を表示。STRONG BUY は全プロバイダの一致が必要 |

---

## Google Gemini — オプション
{: .text-yellow-200}

Gemini 2.5 Flash で AI 買い推奨を提供します。

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) にアクセス
2. **Create API Key** をクリックし、Google Cloud プロジェクトを選択（または新規作成）
3. キーをコピーし、GitHub Secret として追加 — 名前：`GEMINI_API_KEY`、値：先ほどコピーしたキー

**無料枠：** 2026 年 8 月時点で、`gemini-2.5-flash` に対するライブの 429 エラーではクォータが**1 日約 20 リクエスト**と報告されています（以前はここで 1 日 250 リクエストと記載していましたが、Google はこの制限を予告なく変更するため、正確な数値は [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) を正とみなしてください）。Richfolio は 1 回の実行につき 2 リクエストを使用し（Stage 1 Observe ＋ Stage 2 Decide）、さらに STRONG BUY ティッカー 1 つにつき詳細分析で 1 リクエスト、毎日のニュース関連性フィルターで 1 リクエストを追加で使用します。1 日 6 回の実行スケジュール（daily 1 回 ＋ intraday 5 回）全体では、静かな日でも 13 リクエスト以上になるため、Gemini は後半の実行でクォータを使い切って離脱することがよくあります — その場合もブリーフ自体は送信され、デグレードしたプロバイダを示す `⚠ n/n AI` バッジが付きます。新しいキーはクォータが有効化されるまで数分かかることがあります（最初は 429 エラーが出るかもしれません）。

### Gemini モデルティアに関する注記

Google の価格ページでは Gemini 2.5 Pro が入力／出力トークンとも[「無料」](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-pro)であると記載されています。しかし実際には、無料枠の Pro リクエストは使用量が少なくても頻繁に `429 RESOURCE_EXHAUSTED` エラーに当たります。Google は無料枠の実際の RPD（1 日あたりリクエスト数）上限を公表していません。サードパーティの情報源では Pro は約 100 RPD に制限されているかもしれないと示唆されていますが、実際の数字はアカウントによって異なるようで、保証はありません。

**Richfolio はデフォルトで Gemini 2.5 Flash を使用しています**。Flash の方が寛大で信頼性の高い無料枠クォータを持つためです。金融分析テキストにおける品質の差は無視できます。

---

## Anthropic Claude — オプション
{: .text-yellow-200}

Claude（デフォルトでは Sonnet 4.6）で AI 買い推奨を提供します。認証方法は 2 通りあり、設定した方を Richfolio が使用します。

### オプション 1 — Claude Pro/Max サブスクリプション（トークン課金なし）

すでに Claude Pro または Max を契約している場合、API クレジットを購入する代わりに、既存のサブスクリプション枠で Richfolio を実行できます。

1. Claude Code をインストールし、サブスクリプションを持つアカウントでサインイン
2. ローカルで `claude setup-token` を実行し、出力されたトークンをコピー
3. GitHub Secret として追加 — 名前：`CLAUDE_CODE_OAUTH_TOKEN`、値：そのトークン

**これを使う場合は `ANTHROPIC_API_KEY` を未設定のままにしてください。** Claude Code の内部では API キーがサブスクリプショントークンより優先されるため、両方を設定すると気づかないうちに API アカウントに課金されてしまいます — まさにこのオプションが避けようとしている事態です。Richfolio はサブスクリプショントークンを優先し、サブプロセスから API キーを取り除きますが、最もクリーンな構成はどちらか一方だけを設定することです。

**有効期限：** 約 1 年で、自動更新はありません。Threads のトークンと違って更新ワークフローはないため、毎年 `claude setup-token` を再実行してください。期限が切れると Claude はその回の実行から外れます。マルチプロバイダ構成（Claude ＋ Gemini や Mistral）では、残りのプロバイダが続行し、ブリーフは失敗ではなく `⚠ n/n AI` と表示されます — ただしこのバッジはプロバイダが 2 つ以上設定されている場合にのみ表示されます。Claude だけを使っている場合、バッジを出す相手がいないため、ブリーフは黙ってギャップベースの推奨にフォールバックします。

### オプション 2 — API キー（従量課金）

1. [console.anthropic.com](https://console.anthropic.com) にアクセスしてサインアップ
2. **API Keys** → **Create Key** に移動し、名前を付けてキーをコピー
3. GitHub Secret として追加 — 名前：`ANTHROPIC_API_KEY`、値：先ほどコピーしたキー

**料金：** Anthropic には Gemini のような恒久的な無料枠はありませんが、新規アカウントには少額のスタータークレジットが付与されます。また、Richfolio のワークロードでの Sonnet 利用は通常 1 日あたり数セント程度です。コストを最小化するには `CLAUDE_MODEL=claude-haiku-4-5-20251001` を設定してください（Haiku ティアは大幅に安価ですが、このワークロードを十分にこなせます）。

---

## Mistral — オプション
{: .text-yellow-200}

Mistral Large（デフォルトでは `mistral-large-latest`）で AI 買い推奨を提供します。

1. [console.mistral.ai](https://console.mistral.ai) にアクセスしてサインアップ
2. **API Keys** → **Create new key** に移動し、キーをコピー
3. GitHub Secret として追加 — 名前：`MISTRAL_API_KEY`、値：先ほどコピーしたキー

**無料枠：** Experiment ティアは恒久的に無料で、月あたり約 10 億トークン。Richfolio のワークロードは月あたり約 700 万トークンです。クレジット制ではなくレート制限型なので、上限に当たった場合の症状は課金エラーではなく 429 であり、これは自動的にリトライされます。より余裕を持たせて実行を速くしたい場合は `MISTRAL_MODEL=mistral-medium-latest` を設定してください（品質はわずかに下がります）。

Mistral が 2 つ目のプロバイダとして適しているのは、Gemini とは系統の異なる独立したモデルだからです。全会一致ルールの下では、2 つ目のモデルは、その不一致がモデルの弱さではなくデータを反映している場合にのみ情報を追加します。

---

## マルチ AI モード

`GEMINI_API_KEY`、Claude（`CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY`）、`MISTRAL_API_KEY` のうち 2 つ以上が設定されている場合、Richfolio は分析ごとに該当プロバイダを並行実行し、結果を集約します：

- ティッカーごとの**コンセンサスアクション**を多数決で決定（同数の場合は確信度の合計で同点を解消）
- **平均化された確信度**を目立たせて表示し、その下にプロバイダごとのスコアを表示
- **STRONG BUY は全プロバイダの一致が必要** — どれか 1 つでも反対した場合、コンセンサスは BUY に上限が下がります
- アクションの隣に**合意ラベル**（unanimous／majority／split）をバッジで表示

実行中にあるプロバイダが失敗した場合（レート制限、クォータ枯渇、ネットワークエラー）、残りのプロバイダがそれなしで続行します。その回は**デグレード**として扱われ、すべての推奨にメールでは `⚠ 1/2 AI` のようなバッジ（Telegram ではタグ）が付き、STRONG BUY は BUY に上限が下がります。実際に応答したモデルだけでの全会一致は、バッジが示唆するようなクロスチェックにはならないためです。生き残ったプロバイダのアクションをそのまま使いたい場合は、`config.json` に `"ai": { "strongBuyRequiresAllProviders": false }` を設定してください — バッジはいずれの場合も表示されます。プロバイダを 1 つしか設定していない場合は該当しません。その構成はそもそも全会一致を約束していないからです。

### STRONG BUY 詳細分析ページを生成するプロバイダの選択

複数のプロバイダが有効な場合、STRONG BUY ごとの分析ページ（「More Details」リンク）は単一のプロバイダによって生成されます — デフォルトではレジストリ順で最初に利用可能なもの（Gemini、次に Claude、次に Mistral）。次の環境変数で上書きできます：

| 環境変数 | 値 | 効果 |
|---|---|---|
| `AI_DETAILED_PROVIDER` | `gemini` | 詳細分析を Gemini に強制（GEMINI_API_KEY の設定が必要） |
| `AI_DETAILED_PROVIDER` | `claude` | 詳細分析を Claude に強制（`CLAUDE_CODE_OAUTH_TOKEN` または `ANTHROPIC_API_KEY` の設定が必要） |
| `AI_DETAILED_PROVIDER` | `mistral` | 詳細分析を Mistral に強制（MISTRAL_API_KEY の設定が必要） |
| `MISTRAL_MODEL` | `mistral-medium-latest` | より安価で高速な Mistral モデル（デフォルト：`mistral-large-latest`） |
| `CLAUDE_MODEL` | 例：`claude-haiku-4-5-20251001` | Claude モデルを上書き（デフォルト：`claude-sonnet-4-6`） |

キーが設定されていないプロバイダ（または不明な名前）を `AI_DETAILED_PROVIDER` に指定した場合は、ログに記録された上で無視され、レジストリ順にフォールバックします。API キーのないプロバイダを固定すると、すべてのティッカーで失敗してしまうためです。

---

## Telegram ボット — オプション
{: .text-yellow-200}

Telegram アカウントに凝縮されたサマリーを配信します。

### ボットを作成

1. Telegram を開き、**@BotFather** を検索
2. `/newbot` を送信
3. 名前（例：「Richfolio Brief」）とユーザー名（`bot` で終わる必要があります、例：`richfolio_brief_bot`）を選択
4. BotFather がボットトークンを返信します — コピーしてください

### chat ID を取得

1. Telegram で **@userinfobot** を検索して起動
2. 数値のユーザー ID が返ってきます — これがあなたの chat ID です

**重要：** Richfolio を実行する前に、新しいボットに何かメッセージ（例：「hi」）を送ってください — ボットがあなたにメッセージを送れるようになる前に必要です。

両方を GitHub Secret として追加します：

- 名前：`TELEGRAM_BOT_TOKEN`、値：BotFather からのトークン
- 名前：`TELEGRAM_CHAT_ID`、値：あなたの数値ユーザー ID

**注意：** 未設定の場合、ブリーフは Telegram をスキップします。メッセージは凝縮されたサマリー（フル HTML ではない）です。1 メッセージあたり 4,096 文字の制限 — 必要に応じてニュースが切り詰められます。

---

## ソーシャル投稿 — オプション
{: .text-yellow-200}

Richfolio は汎用的な買いシグナルを X、Facebook、Threads、LinkedIn の公開アカウントに投稿できます。すべてのプラットフォームはオプションで、設定するまではオフのままです。プラットフォームごとに必要な Secret：

- **Facebook：** `FACEBOOK_PAGE_ID`、`FACEBOOK_PAGE_TOKEN`
- **Threads：** `THREADS_USER_ID`、`THREADS_ACCESS_TOKEN`（＋ 約 60 日のトークンを自動リフレッシュするためのオプションの `THREADS_TOKEN_PAT`）
- **LinkedIn：** `LINKEDIN_ACCESS_TOKEN`、`LINKEDIN_ORG_URN`
- **X/Twitter：** `X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_TOKEN_SECRET`

**注意：** 投稿は汎用的です — 保有や配分は一切開示されません。未設定の場合、ソーシャル投稿はスキップされます。各プラットフォームの手順ごとのセットアップは[ソーシャル投稿](social-setup)を参照してください。

---

## まとめ

| キー | 必須 | サービス |
|-----|----------|---------|
| `RESEND_API_KEY` | はい | メール配信 |
| `RECIPIENT_EMAIL` | はい | あなたのメールアドレス |
| `NEWS_API_KEY` | いいえ | ニュースヘッドライン |
| `GEMINI_API_KEY` | いいえ | AI プロバイダ（Google Gemini） |
| `CLAUDE_CODE_OAUTH_TOKEN` | いいえ | AI プロバイダ（Anthropic Claude、Pro/Max サブスクリプション経由） |
| `ANTHROPIC_API_KEY` | いいえ | AI プロバイダ（Anthropic Claude、従量課金 API キー経由） |
| `MISTRAL_API_KEY` | いいえ | AI プロバイダ（Mistral — 無料の Experiment ティア） |
| `TELEGRAM_BOT_TOKEN` | いいえ | Telegram 配信 |
| `TELEGRAM_CHAT_ID` | いいえ | Telegram 配信 |
| `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` | いいえ | Facebook ページ投稿 |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | いいえ | Threads 投稿 |
| `THREADS_TOKEN_PAT` | いいえ | Threads トークンの自動リフレッシュ（Secrets 書き込み権限を持つ PAT） |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` | いいえ | LinkedIn ページ投稿 |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | いいえ | X/Twitter 投稿 |
| `CLAUDE_MODEL` | いいえ | Claude モデルを上書き（デフォルト：`claude-sonnet-4-6`） |
| `MISTRAL_MODEL` | いいえ | Mistral モデルを上書き（デフォルト：`mistral-large-latest`） |
| `AI_DETAILED_PROVIDER` | いいえ | STRONG BUY 分析ページに `gemini`、`claude`、`mistral` のいずれかを強制 |
