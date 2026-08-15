---
title: 設定說明
layout: default
nav_order: 4
lang: zh-TW
permalink: /configuration.html
---

# 設定說明

Richfolio 用一份 JSON 設定承載所有投資組合資料 — 你的組合資訊保持隱私。

---

## 設定步驟

進入你 Fork 的儲存庫 Settings → Secrets and variables → Actions → **Variables** 分頁 → 建立名為 `CONFIG_JSON` 的變數,內容為下方的 JSON。

## 範例

```json
{
  "targetPortfolio": {
    "VOO": 20,
    "QQQ": 15,
    "GLD": 10,
    "BSV": 20,
    "SMH": 5,
    "BTC": 1.5
  },
  "currentHoldings": {
    "AAPL": 30,
    "VOO": 1,
    "BTC": 0.0002
  },
  "watching": ["MSFT", "NVDA", "AMD"],
  "watchingCrypto": ["BTC/CRO", "ETH/CRO"],
  "totalPortfolioValue": 50000,
  "defaultCurrency": "USD",
  "intradayAlerts": {
    "enabled": true,
    "confidenceIncreaseThreshold": 10
  }
}
```

---

## 欄位參考

| 欄位 | 必填 | 描述 |
|------|------|------|
| `targetPortfolio` | 是 | 目標配置百分比。鍵為股票代碼,值為百分比,總和應約為 100%。 |
| `currentHoldings` | 是 | 你目前持有的股數。可以包含不在目標組合中的股票(例如 AAPL 用於 ETF 重疊偵測)。 |
| `watching` | 否 | 追蹤但**不在**目標投資組合中的股票代碼陣列。會被抓取、由 AI 評分,並在獨立的「Watch List」區塊呈現 — 不會干擾配置計算。詳見下方[觀察清單](#watch-list)。 |
| `totalPortfolioValue` | 是 | 你估計的投資組合總價值(以 `defaultCurrency` 為單位)。當實際持倉小於目標時,用於配置計算。 |
| `defaultCurrency` | 否 | ISO 4217 貨幣代碼(例如 `"USD"`、`"GBP"`、`"AUD"`)。預設值:`"USD"`。電子郵件/Telegram 中的金額皆以此貨幣呈現;不符的標的會透過 Yahoo Finance 即時匯率換算。 |
| `watchingCrypto` | 否 | 加密貨幣交叉盤陣列,格式為 `"BASE/QUOTE"`(例如 `["BTC/CRO", "ETH/CRO"]`)— 即「以 QUOTE 計價的 BASE 價格」。僅觀察的換幣訊號,價格來自 crypto.com 的免金鑰公開 API 而非 Yahoo。詳見下方[加密貨幣交叉盤](#加密貨幣交叉盤)。 |
| `intradayAlerts` | 否 | 盤中警示設定(見下)。省略時套用預設值。 |
| `cryptoAlerts` | 否 | `--crypto` 排程的警示設定。欄位與 `intradayAlerts` 完全相同,可獨立調整。 |

---

## 盤中警示

`intradayAlerts` 區段控制盤中檢查何時送出警示。所有欄位都可選 — 已備好合理的預設值。

警示僅在 STRONG BUY 相關變動時觸發:
1. **升級為 STRONG BUY** — 其他層級 → STRONG BUY
2. **從 STRONG BUY 降級** — STRONG BUY → 其他層級
3. **信心度變動** — 維持 STRONG BUY 期間信心度變動 ≥ 門檻

| 欄位 | 預設值 | 描述 |
|------|--------|------|
| `enabled` | `true` | 總開關。設為 `false` 可完全停用盤中警示。 |
| `confidenceIncreaseThreshold` | `10` | 觸發 STRONG BUY 股票警示所需的最小信心度變化(絕對值,百分點)。 |

---

## 重新分析

以最新價格(含盤後/盤前)重新分析單一股票代碼。會寄送電子郵件 + Telegram,並附上新的分析 URL。

Actions → Portfolio Monitor → **Run workflow** → mode: `refresh`、ticker: `SMH`。

可用時會使用 Yahoo Finance 的 `postMarketPrice` 與 `preMarketPrice`。盤後資料無法取得時會回退到一般市價。

---

## 觀察清單 (Watch List)
{: #watch-list }

可選的 `watching` 陣列用於追蹤你想**被評分並以訊號形式呈現**、但不想納入目標投資組合的標的。它們會跟組合內標的一起被抓取、送入提示詞、並由 AI 評分,但會繞過所有基於配置的規則。

**適合在以下情境使用:**

- 你還在研究某檔股票,尚未決定要給多少目標權重
- 你想看到目前未持有標的的建議(例如 *「現在是不是建立 NVDA 部位的好時機?」*)
- 你想取得某些標的的訊號,又不想讓投資組合總和超過 100%

### Watch 標的與組合標的的差異

| 行為 | 組合標的 | Watch 標的 |
|---|---|---|
| 計入配置百分比 | 是 | **否** |
| 計算配置缺口 | 是 | **否** |
| 需要 `缺口 ≥ 2%` 才能 STRONG BUY | 是 | **否** — STRONG BUY 改以訊號匯流為依據 |
| 套用超額部位守護 | 是 | **否** |
| 計入最多 2 個 STRONG BUY 上限 | 是 | **否** — 所有符合條件的 watch STRONG BUY 都會呈現 |
| 填入 `suggestedBuyValue` | 是(依缺口計算) | **永遠為 0** — 由你自行決定部位規模 |
| 出現在主要的「AI Buy Recommendations」區塊 | 是 | 否 — 在獨立的「Watch List」區塊 |
| 建議限價單價格 | 是 | 是(同樣邏輯) |
| 詳細 STRONG BUY 分析頁面 | 是 | 是 |

### Watch 標的的 STRONG BUY 標準

由於沒有配置缺口可作為錨點,watch 標的需要更強的訊號匯流才能達到 STRONG BUY:

- ≥ 1 個價位訊號(P/E 低於歷史均值、52 週位置 < 30%,或價格低於 200 日均線)
- ≥ 2 個動能訊號確認該價位訊號(RSI < 35、MACD 看漲交叉、布林通道 %B < 0.15、隨機指標 %K < 20、OBV 上升)
- 無重大紅旗
- 僅依訊號匯流即達信心度 ≥ 80%
- 價值評級 A 或 B(僅針對股票;ETF 與加密貨幣略過此條件)

### 範例

```json
{
  "targetPortfolio": { "VOO": 20, "GLD": 10, ... },
  "currentHoldings": { "VOO": 5, "AAPL": 30 },
  "watching": ["MSFT", "NVDA", "AMD", "AVGO"]
}
```

此投資組合持有 AAPL + VOO,並單純把 MSFT/NVDA/AMD/AVGO 當作研究訊號追蹤。Watch 標的在電子郵件/Telegram 中有自己的區塊,永遠不會讓組合總和超過 100%,也不會擠掉組合內的 STRONG BUY 名額。

---

## 加密貨幣交叉盤

選用的 `watchingCrypto` 陣列回答的是 Richfolio 其他部分不回答的問題:不是「我該用現金買進嗎?」,而是「我已經持有幣種 X — 現在是把其中一部分換成幣種 Y 的好時機嗎?」

```json
{
  "watchingCrypto": ["BTC/CRO", "ETH/CRO"]
}
```

### 寫法

`"BASE/QUOTE"` 表示**以 QUOTE 計價的 BASE 價格** — 也就是「你要買進的資產」除以「你要花掉的資產」。

因此 `"BTC/CRO"` 表示「1 顆 BTC 值多少 CRO」,而這正是你在把 CRO 換成 BTC 之前希望**越低越好**的數字。新增、移除或替換交易對都只需改設定:`"SOL/CRO"`、`"BTC/USDT"`、`"ETH/BTC"` 不需改動任何程式碼即可使用。

### 為什麼方向必須一致

交易所會依自己的習慣掛出市場的任一側。在 crypto.com 上,CRO 是 `CRO_BTC` 的基礎幣,卻是 `ETH_CRO` 的計價幣 — 若照原樣解讀,這兩個交易對方向**完全相反**:你會希望 `CRO_BTC` 高時把 CRO 換成 BTC,卻希望 `ETH_CRO` 低時把 CRO 換成 ETH。同一份簡報裡出現兩種極性極容易誤讀,而且每多加一個交易對就更糟。

Richfolio 把一切正規化為「以你要花掉的貨幣計價的、你要買進的資產」,因此**低 = 便宜 = 換幣的好時機**,始終如一。交易所究竟掛在哪一側,會依其自身的交易商品中繼資料自動判定,必要時對序列取倒數。

### 有什麼,缺什麼

| | |
|---|---|
| **價格來源** | crypto.com 交易所公開 API — 不需金鑰、不需註冊 |
| **計價單位** | 計價幣(例如 `1,313,198 CRO`),絕不換算成你的報表貨幣 |
| **技術指標** | 全套 — SMA50/200、RSI、MACD、布林通道、ATR、隨機指標、OBV、90 日百分位 |
| **52 週區間** | 由 365 根日線推導(加密貨幣每個日曆日都交易) |
| **P/E、基本面、股息、財報、分析師目標價** | 對幣對而言**根本不存在** — 已明確告知 AI,不會憑空捏造價值評等 |
| **配置目標 / 缺口** | 無 — 僅觀察,與 `watching` 清單一致 |
| **`suggestedBuyValue`** | 恆為 0(你是在換幣,沒有現金支出) |
| **公開發布到 X/Facebook 等** | 絕不發布,即使已啟用社群發文 |

由於不存在 P/E,交叉盤只有**兩個**價格層面的進場訊號(而非三個):52 週位置 < 30%,以及價格低於 200 日均線。提示詞中已明確告知 AI:缺少 P/E 不算未通過的檢查。

### 推送與頻率

交叉盤會出現在兩個地方:

1. **每日簡報的觀察清單**,與你的 `watching` 標的並列。
2. **它們自己每天 8 次的排程**(`.github/workflows/crypto-monitor.yml`,每 3 小時一次),僅在訊號發生實質變化時才寄送電子郵件/Telegram。

之所以值得提高頻率,是因為加密貨幣 7×24 小時交易,而股票盤中檢查大多在美股休市時觸發。本機執行請使用 `npm run crypto`。

請注意日線仍然每天只收一次盤,因此相隔三小時的兩次執行,*技術指標是完全相同的* — 沒有價格變動的動作翻轉只是評分雜訊,而非訊號。`cryptoAlerts.minPriceMovePctToAlert`(預設 `1.0`)會加以抑制。`cryptoAlerts` 的欄位與[`intradayAlerts`](#盤中警示)完全相同,可獨立調整:

```json
{
  "cryptoAlerts": {
    "enabled": true,
    "minConfidenceToAlert": 80,
    "minPriceMovePctToAlert": 1.0
  }
}
```

設為 `"enabled": false` 可保留每日簡報中的交叉盤,但停止獨立警示。

### 如何解讀訊號

交叉盤的建議是**換幣**訊號,因此動作詞要相應理解:

| 動作 | 含義 |
|---|---|
| STRONG BUY / BUY | 把計價幣換成基礎幣的有利時機 |
| HOLD / WAIT | 以計價幣衡量,基礎幣偏貴 — 繼續等待 |

有一點值得留意:兩條腿都會波動,因此有利的交叉盤價格可能來自基礎幣下跌,也可能來自計價幣上漲。資料允許時,AI 會被要求說明是哪一種。

---

## 股票代碼格式

| 類型 | 格式 | 範例 |
|------|------|------|
| 美股/ETF | 標準代碼 | `AAPL`、`VOO`、`QQQ`、`SMH` |
| 加密貨幣 | 簡稱 | `BTC`、`ETH`(自動轉為 `BTC-USD`、`ETH-USD`) |
| 國際市場 | Yahoo Finance 代碼 | `0700.HK`(騰訊)、`TM`(豐田) |

---

## 小提示

- **目標百分比**總和應為 100%。若不是,缺口計算仍能運作,但建議買進金額可能偏大或偏小。

- **目標之外的持倉**會用於 ETF 重疊偵測。例如,持有 AAPL 會降低包含 AAPL 的 ETF(如 VOO 或 QQQ)買進優先度。

- **支援零股** — 對加密貨幣(`"BTC": 0.000188`)或支援零股交易的券商很有用。

- **投資組合估值**取實際持倉價值與設定估值的較大者。即使你目前持倉還小於目標配置,缺口計算仍然有意義。

<details>
<summary><strong>最多可以加入多少個股票代碼?</strong></summary>

<br>

Richfolio 在聚焦的投資組合中表現最佳。雖然沒有硬性上限,但免費版 API 額度與簡報的可讀性給了實務上的界線。

**建議範圍:**

| 數量 | 評價 |
|------|------|
| **10-20** | 最佳區間 — 聚焦、可執行、所有免費額度都游刃有餘 |
| **20-30** | 仍然不錯 — 簡報好讀、額度尚有餘 |
| **30-50** | 技術上可行,但每日簡報會顯得雜亂 |
| **50+** | 不建議(見下) |

**為什麼不建議 50+:**

- **NewsAPI(每日 100 次)** — 新聞以每 5 個代碼為一批抓取。50 個代碼下,daily + intraday 約耗 22 次;100 個代碼約 42 次,留給 refresh 的額度很少。
- **AI 分析品質** — 一次評估太多選項時,Gemini 的建議會被稀釋。
- **簡報可讀性** — 信件變長,Telegram 在 4,096 字元處截斷,訊號雜訊比急遽下降。
- **執行時間** — 每個代碼都需要 Yahoo Finance 呼叫取得價格、技術指標與基本面,會拖慢 GitHub Actions 執行時間。

Gemini 的免費層現在是整個技術堆疊中最緊繃的限制:2026 年 8 月一次實際觸發的 429 錯誤顯示,`gemini-2.5-flash` 的請求配額約為每日 20 次,而 richfolio 的排程(1 次每日 + 5 次盤中執行)每天會用掉 13 次以上的請求 — 因此 Gemini 常會在額度用盡後,從後續執行中掉隊。Token 吞吐量並不是問題所在(即使 100 個代碼,每次執行在每分鐘 25 萬 token 的上限下也只會用約 5.3 萬 token)— 真正吃緊的是請求*次數*。其餘真正的限制是 NewsAPI 額度與資訊過載。

**結論 — 想在所有免費層都取得最佳體驗,建議控制在 30 個代碼以內。**

</details>

---

## 更新設定

當持倉變動時,在 GitHub 以新的 JSON 內容更新 `CONFIG_JSON` 變數(Settings → Secrets and variables → Actions → Variables 分頁)。
