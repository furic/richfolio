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
| `intradayAlerts` | 否 | 盤中警示設定(見下)。省略時套用預設值。 |

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
