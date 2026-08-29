---
title: 部署
layout: default
nav_order: 6
lang: zh-TW
permalink: /deployment.html
---

# 部署

Richfolio 執行在 GitHub Actions 上,由一個輕巧的 Cloudflare Worker 負責排程 — 不需要伺服器。Fork 儲存庫、加入 Secret、設定好排程器,它就會每天早上自動執行。

---

## Fork 儲存庫

如果還沒 Fork,[請先 Fork richfolio](https://github.com/furic/richfolio/fork) 到你自己的 GitHub 帳號。GitHub Actions 工作流程只能在你自己的儲存庫執行 — Fork 之後才能享受每日簡報、盤中警示和每週報告的自動化排程。

---

## 啟用工作流程

GitHub 預設會停用新 Fork 儲存庫的 Actions。前往你的 Fork → **Actions** 分頁 → 點選 **"I understand my workflows, go ahead and enable them"**。

---

## 加入 Secret 與變數

在 Fork 的儲存庫:**Settings** → **Secrets and variables** → **Actions**。這裡是部署端的「該放哪裡」對照清單 — 至於如何取得每把 API 金鑰,請見 [API 金鑰](api-keys)。

| 項目 | 分頁 | 備註 |
|---|---|---|
| `RESEND_API_KEY` | **Secrets** | 必要 |
| `NEWS_API_KEY` | **Secrets** | 可選 |
| `GEMINI_API_KEY` | **Secrets** | 可選 — AI 提供者(Google Gemini) |
| `GEMINI_API_KEY_CRYPTO` | **Secrets** | 可選 — 供加密工作流程使用的第二把 Gemini 金鑰,讓其每天 8 次的排程擁有獨立額度 |
| `CLAUDE_CODE_OAUTH_TOKEN` | **Secrets** | 可選 — AI 提供者(Anthropic Claude,透過 Pro/Max 訂閱,不計 token 費用)。若同時設定了 `ANTHROPIC_API_KEY`,此項會優先生效 — 請只設定其中一個 |
| `ANTHROPIC_API_KEY` | **Secrets** | 可選 — AI 提供者(Anthropic Claude,按用量計費)。與另一家同時設定可啟用多 AI 模式 |
| `MISTRAL_API_KEY` | **Secrets** | 可選 — AI 提供者(Mistral,免費 Experiment 層)。與另一家同時設定可啟用多 AI 模式 |
| `TELEGRAM_BOT_TOKEN` | **Secrets** | 可選 |
| `TELEGRAM_CHAT_ID` | **Secrets** | 可選 |
| `RECIPIENT_EMAIL` | **Variables** | 必要 — 可見方便日後直接編輯 |
| `CONFIG_JSON` | **Variables** | 必要 — 你的投資組合 JSON([格式](configuration)) |
| `CLAUDE_MODEL` | **Variables** | 可選 — 覆寫 Claude 模型(預設:`claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | **Variables** | 可選 — 覆寫 Mistral 模型(預設:`mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | **Variables** | 可選 — 強制 STRONG BUY 分析頁面使用 `gemini`、`claude` 或 `mistral` |
| `TIME_ZONE` | **Variables** | 可選 — Email 中日期 / 時間格式所用的 IANA 時區(例如 `Australia/Sydney`、`America/New_York`、`Europe/London`)。預設:`UTC`。Workflow 會映射為 Node 原生的 `TZ` 環境變數 |

{: .important}
> **為什麼 `CONFIG_JSON` 用 Variable 而不是 Secret:** Variable 在 GitHub UI 中是可見的,你可以直接在頁面上修改持倉,不用每次都重新貼整段 JSON。代價是任何有儲存庫讀取權限的人都會看到你的資產配置 — 對私有 Fork 沒問題,但如果之後要公開儲存庫就要留意。

---

## 排程

設定好排程器後,工作流程會自動執行:

- **每日** — UTC 22:00（AEST 上午 8:00）
- **盤中** — 平日 UTC 03:15 / 07:15 / 11:15 / 14:15（AEST 下午 1:15 / 5:15 / 9:15 與隔日凌晨 0:15）— 僅在訊號轉強時才發出提醒
- **每週** — 週日 UTC 22:30（週一 AEST 上午 8:30）

若你有使用 `watchingCrypto`,還會有第二個工作流程並行執行:

- **加密貨幣** — 每 3 小時一次（每天 8 次）,僅在跨幣對訊號相對當日錨點出現顯著變化時才提醒

它與 Portfolio Monitor 刻意分開:否則兩者會共用 `state/` 快取,加密貨幣的執行會覆寫股票的早晨基準線。

你隨時可以手動觸發任一模式:儲存庫 → **Actions** → **Portfolio Monitor**（或 **Crypto Monitor**）→ **Run workflow** → 選擇模式。Crypto Monitor 另外提供 `smoke` 模式,可在不傳送任何內容的情況下檢查 crypto.com API 是否正常。

### 設定排程器

**兩個工作流程都沒有 `schedule:` 觸發器。** 它們改由 [`scheduler/`](https://github.com/furic/richfolio/tree/main/scheduler) 中的 Cloudflare Worker 透過 `repository_dispatch` 觸發,因為 GitHub 內建的排程器已經不夠準時,無法再依賴。

GitHub 官方文件寫明,排程工作流程「在高負載期間可能被延遲」,負載夠高時甚至會被直接捨棄 — 這是文件化的預期行為,因此永遠不會出現在 githubstatus.com 上。GitHub 員工也在 [community discussion #196910](https://github.com/orgs/community/discussions/196910) 中承認漂移正在惡化,但未給出修正時程。在本儲存庫實測:2026 年 8 月,UTC 22:00 的每日簡報從 **+30 分鐘** 漂移到 **+5 至 8 小時**,其中一天甚至完全沒有執行。工作本身自始至終都是約 25 分鐘 — 延遲全部來自 GitHub 的派送佇列。

設定完全免費,大約五分鐘 — 請參閱 [`scheduler/README.md`](https://github.com/furic/richfolio/blob/main/scheduler/README.md)。你需要一個 Cloudflare 帳號（免費方案就夠用:每天 10 萬次請求、5 個 Cron Trigger）,以及一組具備 **Contents: read & write** 權限的 fine-grained GitHub PAT。

<details>
<summary><strong>替代方案:改回 GitHub cron（免設定,但時間不可靠）</strong></summary>

<br>

如果你不想設定 Cloudflare,而且能接受簡報晚幾個小時才到 — 或某天根本沒到 — 可以在你 fork 的 `.github/workflows/portfolio-monitor.yml` 中把 `schedule:` 區塊加回去:

```yaml
on:
  schedule:
    - cron: "0 22 * * *"           # 每日 — AEST 上午 8:00
    - cron: "15 3,7,11,14 * * 1-5" # 盤中 — 平日
  repository_dispatch:
    types: [daily, intraday, weekly]
  workflow_dispatch:
    # ... 保留原有的 inputs
```

另外還要把 "Determine mode" 步驟改回能從排程判斷模式,因為它目前只讀取 `github.event.action`:

```yaml
case "$EVENT_NAME" in
  repository_dispatch) MODE="$DISPATCH_TYPE" ;;
  workflow_dispatch)   MODE="$INPUT_MODE" ;;
  schedule)            [ "$CRON" = "0 22 * * *" ] && MODE="daily" || MODE="intraday" ;;
esac
```

並在該步驟的 `env:` 中加上 `CRON: ${{ github.event.schedule }}`。

請注意,在 **GitHub** 的 cron 中 `1-5` 代表週一到週五；Cloudflare 採用相反的慣例（`1` = 週日）,這正是 Worker 設定中把星期幾以英文縮寫拼出的原因。切勿在兩者之間直接複製星期幾的數字。

> ⚠️ **絕對不要同時啟用兩者。** GitHub 最終仍會送出那個遲到的 cron,於是你會在 Worker 觸發的幾小時後收到第二份重複簡報 — 若你設定了社群發文,連公開貼文也會重複。請擇一使用。

這種設定下沒有排程的每週報告:舊做法是向 runner 詢問星期幾（`date -u +%u`）,只在週日發送,而漂移悄悄地讓它失效 — 週日 22:00 的 cron 若拖到週一 UTC 03:00 才送達,算出來是 day=1,於是直接跳過,而且記錄檔中不會留下任何線索。請從 **Actions → Run workflow → weekly** 手動執行,或改用 Worker。

</details>

<details>
<summary><strong>變更排程或時區</strong></summary>

<br>

預設排程是為 AEST（UTC+10）設計的。要變更,請同時修改 `scheduler/wrangler.jsonc` 中的 `triggers.crons` **以及** `scheduler/src/index.js` 中 `TRIGGERS` 對應的鍵 — 兩者若不一致,測試會讓建置失敗 — 然後執行 `npx wrangler deploy` 重新部署。

Cron Trigger **一律使用 UTC**。請先把你想要的當地時間換算成 UTC:

| 你的當地時間 | UTC cron |
|-----------------|----------|
| AEST 上午 8:00 (UTC+10) | `0 22 * * *`（前一天） |
| EST 上午 8:00 (UTC-5) | `0 13 * * *` |
| PST 上午 8:00 (UTC-8) | `0 16 * * *` |
| GMT 上午 8:00 (UTC+0) | `0 8 * * *` |
| IST 上午 8:00 (UTC+5:30) | `0 2 * * *`（最接近的值） |
| JST 上午 9:00 (UTC+9) | `0 0 * * *` |
| CET 上午 8:00 (UTC+1) | `0 7 * * *` |

只需要改小時的部分（`0 22 * * *` 中的 `22`）— 其餘欄位分別控制分、日、月與星期。

**星期幾要拼出來,不要用數字。** Cloudflare 採用 Quartz 慣例:`1` = **週日**,`7` = 週六 — 與 Unix cron 的 `1` = 週一恰好相反。因此數字 `1-5` 實際上是週日到週四,而 Cloudflare 會毫無提示地接受它:部署不會報錯、週日照跑、週五被跳過。請改用 `MON-FRI` 與 `SUN`。

若要調整信件內文中日期的顯示方式,請設定 `TIME_ZONE` Actions 變數（例如 `Australia/Sydney`）— 這與執行時間無關。

</details>

---

## 更新你的投資組合

當持倉變動時,在 GitHub 上以新的 JSON 內容更新 `CONFIG_JSON` 變數(Settings → Secrets and variables → Actions → Variables 分頁)。下一次排程執行就會使用更新後的資料。

---

## 同步上游更新

要從原始儲存庫取得新功能:

```bash
git remote add upstream https://github.com/furic/richfolio.git
git fetch upstream
git merge upstream/main
git push origin main
```

或者直接在 Fork 首頁點選 GitHub 的 **Sync fork** 按鈕。
