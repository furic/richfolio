---
title: 疑難排解
layout: default
nav_order: 8
lang: zh-TW
permalink: /troubleshooting.html
---

# 疑難排解

常見問題與修正方式。

---

## "Can only send testing emails to your own email address"

**原因:** Resend 免費版的限制。

**修正:** 將 `RECIPIENT_EMAIL` 設為你註冊 Resend 時所用的信箱;或是在 Resend 上驗證一個自訂網域(Dashboard → Domains → Add Domain → 加入 DNS 紀錄)。

---

## "GEMINI_API_KEY quota: limit 0"

**原因:** 新建立的 Gemini API 金鑰需要幾分鐘才會啟用。部分金鑰在未啟用帳單與 API 之前完全無法使用。

**修正:** 依序嘗試以下步驟:

1. **等候 5-10 分鐘** — 新金鑰有時只需要一點時間就會啟用
2. **啟用 Generative Language API** — 進入 [Google Cloud Console](https://console.cloud.google.com/apis/library) → 搜尋 "Generative Language API" → 在綁定你 API 金鑰的專案中點選 **Enable**
3. **加入帳單資訊** — 進入 [Google AI Studio](https://aistudio.google.com) → Settings → Billing 加入帳單資訊。你仍然可以選擇**免費層** — 加入帳單只是為了啟用金鑰,在超出免費額度之前不會被扣款

在此期間,Richfolio 會自動回退到基於缺口的建議 — 簡報仍會送出,只是沒有 AI 分析。如果你也設定了 Claude(`CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY`)或 `MISTRAL_API_KEY`,該服務商會在 Gemini 恢復前單獨繼續執行 — 該次執行會被標記為降級(`⚠ 1/2 AI` 徽章),以免單一服務商的判斷看起來像經過交叉驗證。

---

## "gemini-2.5-flash is no longer available to new users"

**原因:** Google 會先對**新**API 金鑰停用舊模型。新建立的金鑰在 `gemini-2.5-flash` 上會收到 `404`,而同一模型下的舊金鑰仍能正常運作 — 因此這個問題通常出現在你新增第二把 Gemini 金鑰之後,而非初次設定時。

```
404 ... models/gemini-2.5-flash is no longer available to new users.
```

**解法:** 把 `GEMINI_MODEL` 環境變數設為目前可用的模型。`gemini-flash-latest` 是永遠指向最新 Flash 的別名,下次 Google 輪換模型時也不會再次失效:

```yaml
GEMINI_MODEL: gemini-flash-latest
```

預設值刻意維持 `gemini-2.5-flash`,以免在你不知情的情況下把正常運作的金鑰換到別的模型。加密工作流程已自動設定此項。若你的主金鑰某天也遇到相同錯誤,把 `GEMINI_MODEL` 新增為儲存庫**變數(Variable)**即可,不需改動程式碼。

---

## 加密貨幣交叉盤未出現在簡報中

**原因:** 通常是以下三者之一,依可能性排序。

**解法:**

1. **未設定** — `watchingCrypto` 需要寫進你的 `CONFIG_JSON` 變數,而不只是本機的 `config.json`。每一項必須是 `"BASE/QUOTE"` 字串;格式錯誤的項目會被略過並發出警告,而不會中斷整次執行。
2. **交易對不存在** — 記錄會列出它嘗試過的兩個代號(例如 `no tradable spot market for NOPE_CRO or CRO_NOPE`)。crypto.com 必須以*某一個*方向掛出該交易對;若只存在反向,Richfolio 會自動取倒數。
3. **網路或地區封鎖** — 記錄會把 `403`/`451` 標註為疑似地區封鎖。crypto.com 對美國居民限制的是*交易*,目前未觀察到 GitHub runner 的行情資料被封鎖。可透過 儲存庫 → **Actions** → **Crypto Monitor** → **Run workflow** → 模式選 `smoke` 驗證,它會對該 API 做契約檢查並印出實際失敗的步驟。

---

## Claude 悄悄從簡報中消失

**原因:** `CLAUDE_CODE_OAUTH_TOKEN` 過期或缺少時,症狀與缺少 `ANTHROPIC_API_KEY` 完全相同 — Claude 就是不在裡面。若你只用 Claude 一家服務商,簡報會悄悄回退為基於缺口的建議;若是多 AI 模式,其餘服務商會繼續運作,該次執行會被標記為降級(`⚠ 1/2 AI` 徽章)。過程中不會有明顯的錯誤 — 請查看 GitHub Actions 的執行紀錄,確認是否出現 Claude 服務商的驗證失敗訊息。

**修正:** 訂閱 token 的有效期約一年,且不會自動更新。請在本機重新執行 `claude setup-token` 產生新 token,並更新 `CLAUDE_CODE_OAUTH_TOKEN` 這個 secret。若你想改用按用量計費,則設定 `ANTHROPIC_API_KEY` 並保持 `CLAUDE_CODE_OAUTH_TOKEN` 未設定。

---

## 某個股票代碼出現 "fetch failed — internal-error"

**原因:** Yahoo Finance 偶爾對特定代碼會有問題(尤其是 BIPC 這類較不常見的代碼)。

**修正:** 不必處理。該代碼會被跳過,其餘流程正常繼續。這是 Yahoo Finance 的間歇性問題。

---

## GitHub Actions 顯示 Secret 為空

**原因:** Secret 加在了錯誤的層級。

**修正:** 確認 Secret 是加在**儲存庫**層級:Settings → Secrets and variables → Actions → Repository secrets。而不是 Environment 層級。

---

## 沒有回傳新聞

**原因:** NewsAPI 免費版只回傳最近 24 小時內的文章。部分代碼(尤其是 ETF 和小型股)很少出現在新聞頭條中。

**修正:** 這是正常行為。對這些代碼,簡報仍能正常執行,只是少了新聞。AI 分析會在建議中標註 "無近期新聞"。

---

## 沒收到 Telegram 訊息

**原因:** 你還沒有主動與機器人開啟對話。

**修正:** 開啟 Telegram、依使用者名稱搜尋機器人、傳送任意訊息(例如 "hi")給它。Telegram Bot API 要求使用者先主動發起對話,機器人才能傳送訊息給你。完成後重新執行 Richfolio。

---

## "Missing config.json" 錯誤

**原因:** 專案根目錄沒有 `config.json`。

**修正:**
- **GitHub Actions:** 確認 `CONFIG_JSON` 變數存在且內容是有效的 JSON(Settings → Secrets and variables → Actions → **Variables** 分頁)。
- **本機:** 執行 `cp config.example.json config.json` 並填入你的投資組合資料。

---

## 簡報能跑但信件空白或缺少區段

**原因:** 一或多個 API 金鑰缺少或無效。

**修正:** 檢查 `.env` 檔案(本機)或 GitHub Secret(Actions)。簡報會依據可用的金鑰自我調整:
- 沒有 `NEWS_API_KEY` → 無新聞區段
- `GEMINI_API_KEY`、Claude(`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`)與 `MISTRAL_API_KEY` 都沒有 → 改用基於缺口的建議取代 AI
- 只有其中一把 AI 金鑰 → 單 AI 模式(目前的預設行為)
- 設定兩把以上 AI 金鑰 → 多 AI 模式:分數取平均,每則建議下方顯示各 AI 拆解,STRONG BUY 依異議距離設上限(異議為 BUY 則維持,出現 HOLD／WAIT 則壓到 BUY)
- 沒有 `TELEGRAM_BOT_TOKEN` → 僅寄送電子郵件(無 Telegram)

所有組合都是合法的 — 只有 `RESEND_API_KEY` 與 `RECIPIENT_EMAIL` 是必要的。
