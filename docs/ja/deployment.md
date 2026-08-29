---
title: デプロイ
layout: default
nav_order: 6
lang: ja
permalink: /deployment.html
---

# デプロイ

Richfolio は GitHub Actions 上で動作し、小さな Cloudflare Worker がスケジュールを担います — サーバーは不要です。リポジトリを fork し、Secret を追加してスケジューラを設定すれば、毎朝自動的に実行されます。

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

スケジューラを設定すると、ワークフローは自動的に実行されます：

- **デイリー** — 22:00 UTC（AEST 午前 8 時）
- **イントラデイ** — 平日の 03:15 / 07:15 / 11:15 / 14:15 UTC（AEST 午後 1:15 / 5:15 / 9:15 / 深夜 0:15）— シグナルが強まったときのみ通知
- **ウィークリー** — 日曜 22:30 UTC（月曜 AEST 午前 8:30）

`watchingCrypto` を使う場合、もう 1 つのワークフローが並行して動きます：

- **クリプト** — 3 時間ごと（1 日 8 回）。その日のアンカーに対してクロスペアのシグナルが有意に変化したときのみ通知します

Portfolio Monitor とは意図的に分離しています。同居させると `state/` キャッシュを共有してしまい、クリプトの実行が株式のモーニングベースラインを上書きするためです。

任意のモードはいつでも手動実行できます：リポジトリ → **Actions** → **Portfolio Monitor**（または **Crypto Monitor**）→ **Run workflow** → モードを選択。Crypto Monitor には、何も送信せずに crypto.com API を疎通確認する `smoke` モードもあります。

### スケジューラのセットアップ

**どちらのワークフローにも `schedule:` トリガーはありません。** [`scheduler/`](https://github.com/furic/richfolio/tree/main/scheduler) にある Cloudflare Worker が `repository_dispatch` で起動します。GitHub 自身のスケジューラが、もはや実用に耐える精度で動かなくなったためです。

GitHub のドキュメントは、スケジュールされたワークフローが「高負荷時には遅延することがある」、負荷が十分高ければ破棄されると明記しています。仕様として文書化された挙動なので、githubstatus.com には決して現れません。GitHub のスタッフも [community discussion #196910](https://github.com/orgs/community/discussions/196910) でドリフトの悪化を認めていますが、修正時期の約束はありません。このリポジトリで実測したところ、2026 年 8 月の 22:00 UTC のデイリーブリーフは **+30 分** から **+5〜8 時間** までドリフトし、ある日は完全に実行されませんでした。ジョブ自体は一貫して約 25 分で、遅延はすべて GitHub のディスパッチキューによるものです。

セットアップは無料で 5 分ほどです — [`scheduler/README.md`](https://github.com/furic/richfolio/blob/main/scheduler/README.md) を参照してください。Cloudflare アカウント（無料プランで十分：1 日 10 万リクエスト、Cron Trigger 5 個）と、**Contents: read & write** 権限を持つ fine-grained GitHub PAT が必要です。

<details>
<summary><strong>代替案：GitHub cron に戻す（設定不要、ただし時刻は不正確）</strong></summary>

<br>

Cloudflare を設定したくなく、ブリーフが数時間遅れる — あるいはその日は届かない — ことを許容できるなら、fork した `.github/workflows/portfolio-monitor.yml` に `schedule:` ブロックを戻します：

```yaml
on:
  schedule:
    - cron: "0 22 * * *"           # デイリー — AEST 午前 8 時
    - cron: "15 3,7,11,14 * * 1-5" # イントラデイ — 平日
  repository_dispatch:
    types: [daily, intraday, weekly]
  workflow_dispatch:
    # ... 既存の inputs はそのまま
```

さらに "Determine mode" ステップを、スケジュールからモードを解決するように戻す必要があります（現在は `github.event.action` しか読みません）：

```yaml
case "$EVENT_NAME" in
  repository_dispatch) MODE="$DISPATCH_TYPE" ;;
  workflow_dispatch)   MODE="$INPUT_MODE" ;;
  schedule)            [ "$CRON" = "0 22 * * *" ] && MODE="daily" || MODE="intraday" ;;
esac
```

そのステップの `env:` に `CRON: ${{ github.event.schedule }}` を追加してください。

なお **GitHub** の cron では `1-5` は月〜金を意味します。Cloudflare は逆の規約（`1` = 日曜）なので、Worker の設定では曜日を英字で綴っています。両者の間で曜日の数値をコピーしないでください。

> ⚠️ **両方を同時に動かさないでください。** GitHub は遅れた cron を最終的には配信するため、Worker の数時間後に 2 通目の重複ブリーフが届きます。SNS 投稿を設定している場合は、公開投稿まで重複します。どちらか一方を選んでください。

この構成にスケジュールされたウィークリーはありません。従来はランナーに曜日を尋ね（`date -u +%u`）日曜のみ送信していましたが、ドリフトがこれを静かに壊しました — 日曜 22:00 の cron が月曜 03:00 UTC に配信されると day=1 と計算され、ログには何も残さずスキップされます。**Actions → Run workflow → weekly** から手動実行するか、Worker を使ってください。

</details>

<details>
<summary><strong>スケジュールやタイムゾーンの変更</strong></summary>

<br>

既定のスケジュールは AEST（UTC+10）向けです。変更するには `scheduler/wrangler.jsonc` の `triggers.crons` と、`scheduler/src/index.js` の `TRIGGERS` マップの対応するキーの**両方**を編集し（両者がずれるとテストがビルドを失敗させます）、`npx wrangler deploy` で再デプロイしてください。

Cron Trigger は**常に UTC** です。希望する現地時刻を UTC に変換してください：

| 現地時刻 | UTC cron |
|-----------------|----------|
| AEST 午前 8 時 (UTC+10) | `0 22 * * *`（前日） |
| EST 午前 8 時 (UTC-5) | `0 13 * * *` |
| PST 午前 8 時 (UTC-8) | `0 16 * * *` |
| GMT 午前 8 時 (UTC+0) | `0 8 * * *` |
| IST 午前 8 時 (UTC+5:30) | `0 2 * * *`（最も近い値） |
| JST 午前 9 時 (UTC+9) | `0 0 * * *` |
| CET 午前 8 時 (UTC+1) | `0 7 * * *` |

変更するのは時（`0 22 * * *` の `22`）だけで十分です — 残りは分・日・月・曜日を制御します。

**曜日は数値ではなく英字で綴ってください。** Cloudflare は Quartz 方式に従い、`1` = **日曜**、`7` = 土曜です — Unix cron の `1` = 月曜とは逆です。したがって数値の `1-5` は日〜木を意味しますが、Cloudflare はこれを黙って受け入れます。エラーなくデプロイされ、日曜に実行され、金曜をスキップします。`MON-FRI` と `SUN` を使ってください。

メール本文の日付表示を制御するには `TIME_ZONE` Actions Variable（例：`Australia/Sydney`）を設定します。これは実行タイミングとは独立しています。

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

