---
title: API 金鑰
layout: default
nav_order: 5
lang: zh-TW
permalink: /api-keys.html
---

# API 金鑰

Richfolio 最多使用 5 個外部服務,全部都有寬裕的免費額度。只有 Resend 與收件信箱是必要的 — 其餘皆為可選。

將每個金鑰加入為儲存庫 Secret:Settings → Secrets and variables → Actions → **Secrets** 分頁。`RECIPIENT_EMAIL` 改為加入為**變數**(更方便檢視與編輯)。

![GitHub Actions Secret](../screenshots/github_actions_secrets.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## Resend(電子郵件)— 必要
{: .text-green-200}

Resend 負責投遞 HTML 信件報告。

1. 前往 [resend.com](https://resend.com) 並註冊
2. 在主控台找到 **API Keys**
3. 點選 **Create API Key**、命名並複製金鑰
4. 加入為 GitHub Secret — 名稱:`RESEND_API_KEY`,值:剛複製的金鑰

**免費額度:** 每月 3,000 封。預設由 `onboarding@resend.dev` 寄送。除非驗證自訂網域,否則只能寄到**你的帳號擁有者信箱**(Dashboard → Domains → Add Domain → 加入 DNS 紀錄)。

---

## 收件信箱 — 必要
{: .text-green-200}

加入為 GitHub **變數**(不是 Secret):名稱:`RECIPIENT_EMAIL`,值:你的電子郵件信箱。

除非驗證了自訂網域,否則必須與 Resend 帳號信箱相同。

---

## NewsAPI(新聞頭條)— 可選
{: .text-yellow-200}

為每日簡報提供每個股票代碼的頭條新聞。

1. 前往 [newsapi.org](https://newsapi.org) 並註冊
2. 主控台會立即顯示你的 API 金鑰
3. 加入為 GitHub Secret — 名稱:`NEWS_API_KEY`,值:主控台中的金鑰

**免費額度:** 每日 100 次請求。Richfolio 每次執行透過批次請求只用約 4 次。僅回傳最近 24 小時的頭條。若未設定,簡報會略過新聞。

---

## AI 服務商 — 若要使用 AI 建議,至少需設定一個

Richfolio 支援三家 AI 服務商:**Google Gemini**、**Anthropic Claude** 與 **Mistral**。若要啟用 AI 驅動的建議,至少需設定其一。**設定兩家以上**則會並行執行 — 分數會被平均,並在每則建議旁顯示各 AI 的細項。若一家都未設定,Richfolio 會回退為基於缺口的建議(不使用 AI)。

| 模式 | 設定 | 輸出 |
|---|---|---|
| **不使用 AI** | 一個金鑰都未設定 | 僅基於缺口的建議 |
| **單 AI** | 設定其中一個金鑰 | 與目前相同 — 每個標的一組行動 + 信心度 |
| **多 AI** | 設定兩個以上金鑰 | 各標的的共識行動 + 平均信心度;每則建議下方顯示各 AI 細項;STRONG BUY 需所有 AI 一致同意 |

---

## Google Gemini — 可選
{: .text-yellow-200}

由 Gemini 2.5 Flash 驅動的 AI 買進建議。

1. 前往 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. 點選 **Create API Key**,選擇一個 Google Cloud 專案(或新增一個)
3. 複製金鑰並加入為 GitHub Secret — 名稱:`GEMINI_API_KEY`,值:剛複製的金鑰

**免費額度:** 截至 2026 年 8 月,`gemini-2.5-flash` 實際觸發的 429 錯誤顯示配額約為**每日 20 次請求**(此處先前記載為每日 250 次 — Google 會在未事先通知的情況下調整這些限制,因此請以 [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) 為準)。Richfolio 每次執行使用 2 次請求(Stage 1 Observe + Stage 2 Decide),每個 STRONG BUY 標的再額外使用 1 次做詳細分析,另加 1 次用於每日新聞相關性篩選。以完整的每日 6 次排程(1 次每日 + 5 次盤中)來算,平常日就會用掉 13 次以上的請求,因此 Gemini 常會在額度用盡後從後續執行中掉隊 — 簡報仍會照常送出,並以 `⚠ n/n AI` 徽章標示該服務商已降級。新金鑰可能需要幾分鐘額度才會啟用(你可能先看到 429 錯誤)。

### 關於 Gemini 模型層級的說明

Google 的定價頁面聲明 Gemini 2.5 Pro 對輸入與輸出 token 都是["免費"](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-pro)。實務上,免費層的 Pro 請求經常遇到 `429 RESOURCE_EXHAUSTED` — 即使用量很低也會。Google 沒有公布免費層的實際 RPD(每日請求數)上限;第三方資料推測 Pro 大約限制在 100 RPD,但實際數字會因帳號而異,且無任何保證。

**Richfolio 預設使用 Gemini 2.5 Flash**,因為 Flash 的免費額度更寬裕且更穩定。對金融分析文字而言,品質差異可忽略。

---

## Anthropic Claude — 可選
{: .text-yellow-200}

由 Claude(預設使用 Sonnet 4.6)驅動的 AI 買進建議。有兩種驗證方式,Richfolio 會採用你設定的那一種。

### 選項一 — Claude Pro/Max 訂閱(不計 token 費用)

若你已經在付費使用 Claude Pro 或 Max,Richfolio 可以直接沿用你現有的訂閱額度,而不需另外購買 API 額度。

1. 安裝 Claude Code,並以擁有你訂閱的帳號登入
2. 在本機執行 `claude setup-token`,複製它印出的 token
3. 加入為 GitHub Secret — 名稱:`CLAUDE_CODE_OAUTH_TOKEN`,值:該 token

**使用此選項時請務必不要設定 `ANTHROPIC_API_KEY`。** 在 Claude Code 內部,API 金鑰的優先權高於訂閱 token,因此兩者都設定的話,會在你不知情的情況下向 API 帳戶計費 —— 這正是此選項要避免的狀況。Richfolio 會優先採用訂閱 token,並在子程序中移除 API 金鑰,但最乾淨的做法還是只設定其中一個。

**有效期限:** 約一年,且不會自動更新。與 Threads token 不同,這裡沒有自動更新流程 —— 需要每年重新執行一次 `claude setup-token`。token 過期後,Claude 會從該次執行中掉隊。在多服務商設定下(Claude 搭配 Gemini 及/或 Mistral),其餘服務商會繼續運作,簡報會被標記為 `⚠ n/n AI`,而不是直接失敗 —— 但這個徽章只有在設定了 2 個以上服務商時才會出現。若 Claude 是你唯一的服務商,就沒有其他存活的服務商可以觸發徽章:簡報會直接靜默回退為基於缺口的建議。

### 選項二 — API 金鑰(按用量計費)

1. 前往 [console.anthropic.com](https://console.anthropic.com) 並註冊
2. 進入 **API Keys** → **Create Key**、命名並複製金鑰
3. 加入為 GitHub Secret — 名稱:`ANTHROPIC_API_KEY`,值:剛複製的金鑰

**定價:** Anthropic 沒有像 Gemini 那樣的永久免費層,但新帳號會獲得少量起始額度,Sonnet 用於 Richfolio 工作量的成本通常每日只需幾美分。若要將成本壓到最低,可設定 `CLAUDE_MODEL=claude-haiku-4-5-20251001`(Haiku 層級便宜許多,且仍能良好處理此工作量)。

---

## Mistral — 選用
{: .text-yellow-200}

以 Mistral Large(預設 `mistral-large-latest`)產生 AI 買進建議。

1. 前往 [console.mistral.ai](https://console.mistral.ai) 並註冊
2. 進入 **API Keys** → **Create new key**,複製金鑰
3. 加入為 GitHub Secret — 名稱:`MISTRAL_API_KEY`,值:剛複製的金鑰

**免費層:** Experiment 層永久免費 — 每月約 10 億 tokens,而 Richfolio 的工作量約為每月 700 萬。它採速率限制而非額度制,因此推到上限時出現的是 429(而非計費失敗),這類錯誤會自動重試。若想要更多餘裕、執行更快,可設定 `MISTRAL_MODEL=mistral-medium-latest`(品質略降)。

Mistral 適合作為第二家服務商,正是因為它與 Gemini 屬於彼此獨立的模型脈絡:在一致同意規則下,第二個模型唯有在其分歧反映的是資料、而非模型本身較弱時,才真正提供新資訊。

---

## 多 AI 模式

若 `GEMINI_API_KEY`、Claude(`CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY`)與 `MISTRAL_API_KEY` 之中設定了兩個以上,Richfolio 會在每次分析時同時執行這些服務商,並彙整結果:

- 各標的的**共識行動**透過多數決決定(以信心度加總作為平手時的判斷)
- **平均信心度**顯著呈現;各 AI 的個別分數顯示於下方
- **STRONG BUY 需所有 AI 一致同意** — 任一服務商持不同意見時,共識結果最高只能到 BUY
- **一致性標籤**(unanimous / majority / split)以徽章形式顯示於行動旁

若某家服務商在執行中失敗(觸發速率限制、額度用盡、網路錯誤),其餘服務商會在沒有它的情況下繼續。該次執行會被標記為**降級**:每則建議在 email 中會帶有類似 `⚠ 1/2 AI` 的徽章(Telegram 中為標籤),且 STRONG BUY 會被壓到 BUY — 因為僅在實際回應的模型之間取得一致,並不是徽章所暗示的那種交叉驗證。若想保留存活服務商原本的行動,可在 `config.json` 設定 `"ai": { "strongBuyRequiresAllProviders": false }` — 兩種情況下徽章都會顯示。只設定一家服務商時不適用:那樣的設定本來就沒有承諾一致同意。

### 選擇由哪家服務商產生 STRONG BUY 詳細分析頁

多家服務商皆啟用時,每個 STRONG BUY 的詳細分析頁(「More Details」連結)由單一服務商產生 — 預設使用註冊順序中第一個可用的(先 Gemini,再 Claude,再 Mistral)。可透過以下方式覆寫:

| 環境變數 | 值 | 效果 |
|---|---|---|
| `AI_DETAILED_PROVIDER` | `gemini` | 強制使用 Gemini 產生詳細分析(必須已設定 GEMINI_API_KEY) |
| `AI_DETAILED_PROVIDER` | `claude` | 強制使用 Claude 產生詳細分析(必須已設定 `CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY`) |
| `AI_DETAILED_PROVIDER` | `mistral` | 強制使用 Mistral 產生詳細分析(必須已設定 MISTRAL_API_KEY) |
| `MISTRAL_MODEL` | `mistral-medium-latest` | 更便宜、更快的 Mistral 模型(預設:`mistral-large-latest`) |
| `CLAUDE_MODEL` | 例如 `claude-haiku-4-5-20251001` | 覆寫 Claude 模型(預設:`claude-sonnet-4-6`) |

若 `AI_DETAILED_PROVIDER` 指定了尚未設定金鑰的服務商(或未知名稱),該設定會被記錄並忽略,回退為註冊順序 — 否則釘選一家沒有 API key 的服務商會導致每個標的都失敗。

---

## Telegram 機器人 — 可選
{: .text-yellow-200}

將精簡摘要傳送到你的 Telegram。

### 建立機器人

1. 開啟 Telegram、搜尋 **@BotFather**
2. 傳送 `/newbot`
3. 命名(例如 "Richfolio Brief")並指定使用者名稱(必須以 `bot` 結尾,例如 `richfolio_brief_bot`)
4. BotFather 會回傳你的機器人 token — 複製下來

### 取得你的 chat ID

1. 在 Telegram 搜尋 **@userinfobot** 並啟動它
2. 它會回傳你的數字使用者 ID — 這就是你的 chat ID

**重要:** 在執行 Richfolio 之前,先給新建立的機器人傳送任意訊息(例如 "hi") — 必須先完成這一步,機器人才能傳送訊息給你。

把兩個值都加入為 GitHub Secret:

- 名稱:`TELEGRAM_BOT_TOKEN`,值:BotFather 提供的 token
- 名稱:`TELEGRAM_CHAT_ID`,值:你的數字使用者 ID

**注意:** 未設定時,簡報會略過 Telegram。訊息為精簡摘要(不是完整 HTML)。單則訊息上限 4,096 字元,新聞區段必要時會被截斷。

---

## 社群發文 — 可選
{: .text-yellow-200}

Richfolio 可將通用的買進訊號發布到 X、Facebook、Threads 與 LinkedIn 的公開頁面。每個平台皆為可選,在設定完成前都保持關閉。各平台所需的 Secret:

- **Facebook:** `FACEBOOK_PAGE_ID`、`FACEBOOK_PAGE_TOKEN`
- **Threads:** `THREADS_USER_ID`、`THREADS_ACCESS_TOKEN`(+ 可選的 `THREADS_TOKEN_PAT` 以自動更新約 60 天的 token)
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN`、`LINKEDIN_ORG_URN`
- **X/Twitter:** `X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_TOKEN_SECRET`

**注意:** 貼文為通用內容 — 不會揭露任何持倉或配置。未設定時,社群發文會被略過。各平台的逐步設定詳見[社群發文](social-setup)。

---

## 彙整

| 金鑰 | 必填 | 服務 |
|------|------|------|
| `RESEND_API_KEY` | 是 | 信件投遞 |
| `RECIPIENT_EMAIL` | 是 | 你的電子郵件信箱 |
| `NEWS_API_KEY` | 否 | 新聞頭條 |
| `GEMINI_API_KEY` | 否 | AI 服務商(Google Gemini) |
| `CLAUDE_CODE_OAUTH_TOKEN` | 否 | AI 服務商(Anthropic Claude,透過 Pro/Max 訂閱) |
| `ANTHROPIC_API_KEY` | 否 | AI 服務商(Anthropic Claude,透過按用量計費的 API 金鑰) |
| `MISTRAL_API_KEY` | 否 | AI 服務商(Mistral — 免費 Experiment 層) |
| `TELEGRAM_BOT_TOKEN` | 否 | Telegram 投遞 |
| `TELEGRAM_CHAT_ID` | 否 | Telegram 投遞 |
| `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` | 否 | Facebook 粉絲專頁發文 |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | 否 | Threads 發文 |
| `THREADS_TOKEN_PAT` | 否 | 自動更新 Threads token(具備 Secrets 寫入權限的 PAT) |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` | 否 | LinkedIn 頁面發文 |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | 否 | X/Twitter 發文 |
| `CLAUDE_MODEL` | 否 | 覆寫 Claude 模型(預設:`claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | 否 | 覆寫 Mistral 模型(預設:`mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | 否 | 強制使用 `gemini`、`claude` 或 `mistral` 產生 STRONG BUY 詳細分析頁 |
