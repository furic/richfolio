---
title: デプロイ
layout: default
nav_order: 6
lang: ja
permalink: /deployment.html
---

# デプロイ

Richfolio は GitHub Actions の cron ジョブとして動作します — サーバーは不要です。リポジトリを fork して Secret を追加すれば、毎朝自動的に実行されます。

---

## リポジトリを Fork

まだなら、[richfolio を fork](https://github.com/furic/richfolio/fork) して自分の GitHub アカウントにコピーしてください。GitHub Actions のワークフローは自分のリポジトリでしか動作しません — fork することで毎日のブリーフ、ザラ場アラート、週次レポートの自動スケジューリングが手に入ります。

---

## ワークフローを有効化

GitHub は新しく fork したリポジトリでデフォルトで Actions を無効にします。fork → **Actions** タブ → **"I understand my workflows, go ahead and enable them"** をクリックします。

---

## Secret と Variable を追加

fork したリポジトリで：**Settings** → **Secrets and variables** → **Actions**。これはデプロイ側の「何をどこに置くか」のチェックリストです — 各 API キーの取得方法については [API キー](api-keys)を参照してください。

| 項目 | タブ | 備考 |
|---|---|---|
| `RESEND_API_KEY` | **Secrets** | 必須 |
| `NEWS_API_KEY` | **Secrets** | オプション |
| `GEMINI_API_KEY` | **Secrets** | オプション — AI プロバイダ（Google Gemini） |
| `GEMINI_API_KEY_CRYPTO` | **Secrets** | オプション — 暗号資産ワークフロー用の 2 つ目の Gemini キー。1 日 8 回のスケジュールに独立したクォータを与えます |
| `CLAUDE_CODE_OAUTH_TOKEN` | **Secrets** | オプション — AI プロバイダ（Anthropic Claude、Pro/Max サブスクリプション経由、トークン課金なし）。両方設定した場合は `ANTHROPIC_API_KEY` より優先されます — どちらか一方のみを使用してください |
| `ANTHROPIC_API_KEY` | **Secrets** | オプション — AI プロバイダ（Anthropic Claude、従量課金）。他のプロバイダと併設するとマルチ AI モードになります |
| `MISTRAL_API_KEY` | **Secrets** | オプション — AI プロバイダ（Mistral、無料の Experiment ティア）。他のプロバイダと併設するとマルチ AI モードになります |
| `TELEGRAM_BOT_TOKEN` | **Secrets** | オプション |
| `TELEGRAM_CHAT_ID` | **Secrets** | オプション |
| `RECIPIENT_EMAIL` | **Variables** | 必須 — 編集を容易にするため可視 |
| `CONFIG_JSON` | **Variables** | 必須 — あなたのポートフォリオ JSON（[形式](configuration)） |
| `CLAUDE_MODEL` | **Variables** | オプション — Claude モデルを上書き（デフォルト：`claude-sonnet-4-6`） |
| `MISTRAL_MODEL` | **Variables** | オプション — Mistral モデルを上書き（デフォルト：`mistral-large-latest`） |
| `AI_DETAILED_PROVIDER` | **Variables** | オプション — STRONG BUY 分析ページで `gemini`、`claude`、`mistral` のいずれかを強制指定 |
| `TIME_ZONE` | **Variables** | オプション — Email 内の日付・時刻フォーマットに使う IANA タイムゾーン（例：`Australia/Sydney`、`America/New_York`、`Europe/London`）。デフォルト：`UTC`。Workflow が Node ネイティブの `TZ` 環境変数にマッピングします |

{: .important}
> **なぜ `CONFIG_JSON` は Secret ではなく Variable なのか：** Variable は GitHub UI で可読のままなので、毎回 JSON 全体を貼り直すことなく直接保有を編集できます。トレードオフは、リポジトリへの読み取りアクセス権を持つ人なら誰でも配分を見られることです — プライベートな fork なら問題ありませんが、公開する場合は考慮すべきポイントです。

---

## スケジュール

ワークフローは自動的に実行されます：

- **毎日** — 毎日 UTC 22:00（AEST 午前 8:00）
- **ザラ場** — 平日 AEST 午前 10 時、正午、午後 2 時、4 時（シグナルが強まったときのみアラート）
- **週次** — 毎週日曜 UTC 22:00（月曜 AEST 午前 8:00）

`watchingCrypto` を使う場合は、2 つ目のワークフローが並行して動きます。

- **暗号資産** — 3 時間ごと（1 日 8 回）。クロスペアのシグナルがその日のアンカーに対して実質的に変化したときのみアラートします

Portfolio Monitor とは意図的に分離しています。同じワークフローを共有すると、週次ジョブが 1 日 8 回余計に発火し、ザラ場の株式実行と誤認され、共有ステートキャッシュ内の株式用の朝のベースラインを暗号資産の実行が上書きしてしまうためです。

手動で実行することもできます：リポジトリ → **Actions** → **Portfolio Monitor**（または **Crypto Monitor**）→ **Run workflow** → モードを選択。Crypto Monitor には `smoke` モードもあり、何も送信せずに crypto.com API の疎通チェックだけを行えます。

<details>
<summary><strong>スケジュールやタイムゾーンを変更する</strong></summary>

<br>

デフォルトのスケジュールは AEST（UTC+10）向けに設定されています。変更するには、fork 内の `.github/workflows/portfolio-monitor.yml` を編集してください。

ファイルには 3 つの cron エントリがあります — 各モード 1 つずつ：

```yaml
schedule:
  - cron: "0 22 * * *"    # Daily at 10pm UTC (8am AEST)
  - cron: "0 0,2,4,6 * * 1-5"  # Intraday checks (weekdays)
  - cron: "0 22 * * 0"    # Weekly on Sunday 10pm UTC
```

GitHub Actions の cron は**常に UTC** です。希望のローカル時刻にするには、まず UTC に変換してください：

| あなたのローカル時刻 | UTC Cron |
|-----------------|----------|
| AEST 午前 8 時（UTC+10） | `0 22 * * *`（前日） |
| EST 午前 8 時（UTC-5） | `0 13 * * *` |
| PST 午前 8 時（UTC-8） | `0 16 * * *` |
| GMT 午前 8 時（UTC+0） | `0 8 * * *` |
| IST 午前 8 時（UTC+5:30） | `0 2 * * *`（最も近い） |
| JST 午前 9 時（UTC+9） | `0 0 * * *` |
| CET 午前 8 時（UTC+1） | `0 7 * * *` |

**Tip：** "UTC time converter" で検索して、自分のタイムゾーンに合う cron 値を見つけてください。時間部分（`0 22 * * *` の `22`）だけを変更してください — 残りは分、日、月、曜日を制御します。

</details>

---

## ポートフォリオの更新

保有が変わったら、GitHub 上で `CONFIG_JSON` 変数を更新してください（Settings → Secrets and variables → Actions → Variables タブ）。次回のスケジュール実行で更新後のデータが使われます。

---

## アップストリームの更新を取り込む

元のリポジトリから新機能を取り込むには：

```bash
git remote add upstream https://github.com/furic/richfolio.git
git fetch upstream
git merge upstream/main
git push origin main
```

または fork のメインページにある GitHub の **Sync fork** ボタンを使ってください。

