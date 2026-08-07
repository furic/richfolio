---
title: 部署
layout: default
nav_order: 6
lang: zh-TW
permalink: /deployment.html
---

# 部署

Richfolio 以 GitHub Actions 排程任務的形式執行 — 不需要伺服器。Fork 儲存庫、加入 Secret,它就會每天自動執行。

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
| `ANTHROPIC_API_KEY` | **Secrets** | 可選 — AI 提供者(Anthropic Claude)。與另一家同時設定可啟用多 AI 模式 |
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

工作流程會自動執行:

- **每日** — 每天 UTC 22:00(AEST 上午 8:00)
- **盤中** — 平日 AEST 上午 10 點、中午 12 點、下午 2 點、4 點(僅在訊號增強時發出警示)
- **每週** — 每週日 UTC 22:00(週一 AEST 上午 8:00)

也可以手動觸發:儲存庫 → **Actions** → **Portfolio Monitor** → **Run workflow** → 選擇 daily、intraday 或 weekly 模式。

<details>
<summary><strong>變更排程或時區</strong></summary>

<br>

預設排程是依 AEST(UTC+10)設定。若要變更,請編輯你 Fork 中的 `.github/workflows/portfolio-monitor.yml`。

該檔案包含三條 cron 條目 — 每種模式一條:

```yaml
schedule:
  - cron: "0 22 * * *"    # 每日 UTC 22:00(AEST 上午 8 點)
  - cron: "0 0,2,4,6 * * 1-5"  # 盤中檢查(平日)
  - cron: "0 22 * * 0"    # 每週日 UTC 22:00
```

GitHub Actions 的 cron **永遠使用 UTC**。請先把你的當地時間換算成 UTC:

| 當地時間 | UTC Cron |
|----------|----------|
| AEST 上午 8 點(UTC+10) | `0 22 * * *`(前一天) |
| EST 上午 8 點(UTC-5) | `0 13 * * *` |
| PST 上午 8 點(UTC-8) | `0 16 * * *` |
| GMT 上午 8 點(UTC+0) | `0 8 * * *` |
| IST 上午 8 點(UTC+5:30) | `0 2 * * *`(最接近) |
| JST 上午 9 點(UTC+9) | `0 0 * * *` |
| CET 上午 8 點(UTC+1) | `0 7 * * *` |

**提示:** 搜尋 "UTC time converter" 找到適合你時區的 cron 值。只需要改小時位(`0 22 * * *` 中的 `22`)— 其餘分別控制分鐘、日、月與週幾。

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
