---
title: 運作原理
layout: default
nav_order: 7
lang: zh-TW
permalink: /how-it-works.html
---

# 運作原理

Richfolio 是一個單管線系統 — 沒有 API 伺服器、沒有資料庫、沒有儀表板。它執行一次,產出一份報告,然後結束。

---

## 資料管線

```
CONFIG_JSON 變數 + GitHub Secrets
  → fetchPrices(Yahoo Finance:價格、P/E、52 週區間、Beta、股息、ETF 持倉、基本面、財報行事曆)
  → fetchTechnicals(Yahoo Finance 圖表:SMA50、SMA200、RSI、MACD、布林通道、ATR、隨機指標、OBV、動能)
  → fetchNews(NewsAPI:每個標的的頭條新聞 + Gemini 情緒評分)
  → analyze(配置缺口、P/E 訊號、重疊扣減、組合指標)
  → aiAnalyze(Gemini 兩階段 Think/Plan:階段 1 Observe → 階段 2 Decide + 推理歷史)
  → guards(AI 後置驗證:財報守護、STRONG BUY 標準、債券上限、信心度/價值合理性)
  → email + telegram(投遞每日簡報,含價值評級、抄底訊號、技術指標、財報徽章)
```

每週模式(`--weekly`)略過新聞、技術指標與 AI,產出聚焦的再平衡報告。

盤中模式(`--intraday`)重新取得價格與技術指標,重新執行 AI(略過新聞),與早盤基準比較,只在訊號增強時發出警示。

加密模式(`--crypto`)完全略過投資組合流程。它從 crypto.com 取得 `watchingCrypto` 交叉盤的價格,對其執行同一套技術指標、AI 階段與守衛規則,並與當天的錨點(而非早盤基準)比較。

---

## 架構

```
src/
├── config.ts          # CONFIG_JSON 變數 + GitHub Secret 的型別化載入器
├── index.ts           # 進入點 — 解析 --weekly/--intraday 旗標、組裝各模組
├── fetchPrices.ts     # 透過 yahoo-finance2(實例化 v3 API)取得 Yahoo Finance 資料 + 基本面 + 財報行事曆
├── fetchTechnicals.ts # Yahoo Finance 圖表:SMA50、SMA200、RSI、MACD、布林通道、ATR、隨機指標、OBV
├── fetchNews.ts       # NewsAPI 搭配標的-公司名對應 + Gemini 情緒評分
├── analyze.ts         # 核心分析:缺口、P/E 訊號、重疊、組合指標
├── aiAnalysis.ts      # 兩階段 Gemini Think/Plan 提示詞建構器 + JSON 回應解析 + 重試邏輯
├── guards.ts          # AI 後置驗證管線:6 項順序安全檢查
├── detailedAnalysis.ts# Gemini 2.5 Flash:STRONG BUY 標的的詳細買進論點 + 風險分析
├── analysisUrl.ts     # 將分析資料壓縮為 URL hash,供 GitHub Pages 分析頁使用
├── state.ts           # 盤中比較所需的早盤基準儲存/載入 + 7 天推理歷史
├── intradayCompare.ts # 目前 AI 建議與早盤基準的比較
├── email.ts           # 每日 HTML 信件範本 + Resend 投遞
├── intradayEmail.ts   # 盤中警示信件範本 + Resend 投遞
├── weeklyEmail.ts     # 每週再平衡信件範本 + Resend 投遞
└── telegram.ts        # Telegram Bot API 投遞(daily + intraday + weekly 三種格式器)
```

每個模組都是獨立的 — 它們透過型別化介面通訊(`QuoteData`、`TechnicalData`、`AllocationItem`、`AllocationReport`、`AIBuyRecommendation`、`IntradayAlert`、`TickerObservation`)。`QuoteData` 包含來自 Yahoo `financialData` 模組的基本面資料(ROE、負債權益、FCF、利潤率、成長)以及財報行事曆資料(下次財報日、距離財報天數)。`TechnicalData` 包含 MACD(交叉 + 柱狀圖)、布林通道(%B、頻寬、收縮)、ATR(波動)、隨機指標(%K/%D)、OBV 趨勢(吸籌/派發)以及成交量變化(7 日 vs 30 日)以支援抄底偵測。`TickerObservation` 是 Think 階段的中介產物,含結構化訊號、風險旗標與摘要。

---

## 分析邏輯

### 配置缺口

對目標投資組合中的每個標的:

1. **目前價值** = 持股 × 目前價
2. **目前占比** = 目前價值 / 投資組合價值 × 100
3. **缺口 %** = 目標占比 − 目前占比
4. **建議買進** = 缺口 % × 投資組合價值(僅當低配時)

投資組合價值取實際持倉價值與設定中 `totalPortfolioValue` 的較大者。

系統支援以下任一貨幣計價的投資組合:USD、GBP、EUR、AUD、CAD、JPY、CHF、HKD、SGD、NZD。在設定中將 `defaultCurrency` 設為你偏好的顯示貨幣。以其他貨幣報價的標的(例如以 GBp 報價的英國 LSE 股票)會被自動偵測、單位修正(LSE 便士 ÷ 100),並透過 Yahoo Finance 進行匯率換算後顯示。

### 動態 P/E 訊號

Yahoo Finance 透過 `earningsHistory` 提供季度 EPS 資料。Richfolio 計算流程:

1. 過濾為正的季度 EPS(至少 2 季)
2. 平均季度 EPS → 年化(× 4)
3. **均值 P/E** = 目前價 / 年化 EPS
4. 將滾動 P/E 與此均值比較:
   - **低於均值** → 潛在價值機會
   - **高於均值** → 潛在高估

ETF 與加密貨幣略過此訊號(無財報資料)。

### ETF 重疊偵測

對每個目標 ETF,Yahoo Finance 會回傳其前約 10 個持倉與權重。Richfolio 檢查你是否直接持有其中任何一檔:

1. 對每個對應到 `currentHoldings` 中股票的 ETF 持倉:
   - **ETF 曝險** = 持倉權重 × ETF 的建議買進金額
   - **你的曝險** = 持股 × 股價
   - **重疊** = min(ETF 曝險, 你的曝險)
2. 將該 ETF 的所有重疊加總
3. 用總重疊扣減 ETF 的建議買進金額

**範例:** VOO 包含約 7% 的 AAPL。若你持有 $8,000 的 AAPL 且 VOO 的建議買進為 $10,000,則 AAPL 的重疊為 min(7% × $10,000, $8,000) = $700。VOO 的買進建議降到 $9,300。

### 52 週區間評分

每個標的的價格在 52 週區間內的位置:

- **0-20%** → 接近 52 週低位(買進機會訊號)
- **20-80%** → 區間中段(中性)
- **80-100%** → 接近 52 週高位(謹慎訊號)

### 技術指標

Richfolio 透過 `yahooFinance.chart()` 取得約 250 日的日 OHLCV 資料,並計算:

1. **SMA50** — 最近 50 個收盤價的簡單移動平均
2. **SMA200** — 最近 200 個收盤價的簡單移動平均(資料點 < 200 時為 null)
3. **RSI(14)** — 標準相對強弱指數,使用 14 日均漲/均跌
4. **MACD** — EMA(12) − EMA(26),訊號線 = MACD 線的 EMA(9)。報告柱狀圖(MACD − 訊號,正值 = 看漲動能),並依最近 2 個交易日偵測看漲/看跌交叉。需 35+ 個資料點。最適合用來確認趨勢方向
5. **布林通道** — SMA(20) ± 2 個標準差。報告 %B(0 = 下軌、1 = 上軌)、頻寬(波動度)以及收縮偵測(頻寬位於 120 日範圍底部 20%,預示突破即將到來)。需 20+ 個資料點。最適合震盪盤
6. **動能訊號**:
   - **看漲** — 價 > SMA50、SMA50 > SMA200、RSI > 40
   - **看跌** — 價 < SMA50、SMA50 < SMA200、RSI < 60
   - **中性** — 訊號混合
7. **ATR(14)** — Wilder 平滑的平均真實區間。報告絕對值與占價格百分比。ATR% > 3% = 高波動(放寬限價單)、ATR% < 1% = 低波動(收緊限價單)。需 15+ 資料點
8. **隨機指標** — %K(14) 與 3 日 SMA 平滑的 %D。%K < 20 = 超賣確認(納入 STRONG BUY 的動能條件),%K > 80 = 超買。需 16+ 資料點
9. **OBV 趨勢** — 能量潮搭配以平均成交量正規化的 10 日線性迴歸斜率。報告方向:上升(吸籌)、下降(派發)或走平。OBV 絕對值跨標的沒有意義。需 11+ 資料點
10. **黃金交叉/死亡交叉** — SMA50 上穿(黃金)或下穿(死亡)SMA200
11. **近期低點** — 最近 7 日與 30 日的最低價(支撐位)
12. **成交量變化** — 7 日均量 vs 之前 30 日均量(被抄底模型用來辨識賣壓衰竭)

資料點不足 50 的標的會被優雅地略過。所有指標都從既有圖表資料計算 — 不產生額外 API 呼叫。

### AI 評分(兩階段 Think/Plan)

Richfolio 使用一個兩階段 AI 框架,靈感來自 [OpenAlice](https://github.com/TraderAlice/OpenAlice) 的認知架構:

**階段 1 — Observe(Think):** Gemini 提示詞接收每個標的的全部資料點 — 價格、P/E 比、52 週位置、配置缺口、股息率、Beta、ETF 重疊、技術指標(均線、RSI、MACD、布林通道、ATR、隨機指標、OBV、動能、成交量變化)、基本面(ROE、負債權益、FCF、利潤率、成長、分析師目標價)、財報行事曆、總體環境,以及帶情緒評分的近期頭條。AI 擷取結構化觀察:有哪些價位訊號、哪些動能訊號生效、風險旗標、摘要與新聞情緒。此階段不產生動作建議。

**階段 2 — Decide(Plan):** 另一次 Gemini 呼叫接收階段 1 的結構化觀察、決策規則、缺口金額、總體上下文與 7 天推理歷史。因為它處理的是預先消化過的觀察(而非原始數字),STRONG BUY 標準會被一致地套用。AI 回傳:

- **動作**:STRONG BUY、BUY、HOLD 或 WAIT
- **信心度**:0-100%
- **理由**:1-2 句解釋
- **建議金額**:投入的美元金額
- **限價單價格**:基於最近支撐(均線、近期低點、整數價位)略低於市價的建議價格
- **限價依據**:1 句話解釋支撐位
- **價值評級**:個股的 A/B/C/D(ETF 與加密貨幣留空)
- **抄底訊號**:超賣/吸籌區描述(若無指標命中則留空)

#### 價值投資框架(僅個股)

AI 依五項基本面標準為每檔個股評級 A-D:ROE > 15%、負債權益 < 50%、FCF/營運現金流 > 80%、正向盈餘成長以及價格低於分析師目標價。此評級會調整 AI 的信心度(A 加約 10 分、D 減約 10 分)。基本面資料來自 Yahoo 的 `financialData` 模組 — 被併入既有的 `quoteSummary` 呼叫,零額外 API 負擔。

#### 抄底模型(所有標的)

AI 對每個標的(股票、ETF 與加密貨幣)評估四項抄底指標:RSI < 30、成交量萎縮 > 20%、價格低於 200 日均線與死亡交叉。加密貨幣 2 項以上即觸發抄底訊號;股票與 ETF 需 3 項以上(更嚴格的門檻以避免單次回檔造成的誤報)。成交量變化基於既有圖表資料計算 — 不產生額外 API 呼叫。

技術指標會進一步細化 AI 的信心度 — 看漲動能訊號搭配超賣 RSI 會強化買進論點,而看跌訊號或超買 RSI 則削弱。AI 遵循明確的**指標衝突解決層級**:趨勢盤信 MACD、震盪盤信布林通道。兩者一致時(例如 MACD 看漲交叉 + 在布林通道下軌反彈)信心度加 5-10 分。布林通道收縮搭配同時的 MACD 交叉視為最強進場訊號(信心度加 10-15 分)。當兩者衝突時(例如 MACD 看漲但 %B 接近上軌)信心度降低以避免追高。

AI 回傳建議後,**守護驗證管線**(`guards.ts`)會執行 6 項順序檢查:債券 ETF 上限、財報臨近、STRONG BUY 標準強制、最多 2 個 STRONG BUY、信心度合理性以及買進金額合理性。守護用於攔截 AI 忽略提示指令的情況,作為程式化的安全網。

若 Gemini 不可用,系統會回退到基於缺口的排序(配置缺口最大優先)。對 Gemini 的暫時性錯誤(503/429),會自動以 5s/10s 退避重試最多 2 次,然後才回退。

### STRONG BUY 詳細分析頁

對每個 **STRONG BUY** 標的,會有另一次 Gemini 2.5 Flash 呼叫產生深入買進論點(3-4 段)與 3-4 項具體風險因子。這份詳細分析連同所有指標與技術資料透過 zlib 壓縮並以 base64url 編碼成 URL hash 片段。

電子郵件與 Telegram 訊息中的**"詳細分析"**連結指向 GitHub Pages 上的靜態分析頁(`docs/analysis/index.html`)。頁面在用戶端以 pako 解碼 URL hash,並渲染:

- **互動式 TradingView 圖表** — 6 個月的 K 線圖,疊加 SMA50、SMA200 與 RSI
- **關鍵指標網格** — 價格、P/E、52 週位置、RSI、移動均線、動能
- **買進論點** — Gemini Flash 產出的多段詳細分析
- **風險分析** — 需要關注的具體風險因子
- **基本面** — ROE、負債權益、利潤率、成長、分析師目標(僅股票)
- **訊號** — 黃金/死亡交叉、抄底訊號(加密貨幣)
- **動作摘要** — 建議投入金額、限價單價格與理由
- **52 週區間條** — 在年度區間內的視覺化位置

無需伺服器端邏輯 — 所有資料都內嵌在 URL 中。頁面一次載入後可離線運作。URL 通常在 1,000-1,500 字元之間,遠在電子郵件用戶端的限制以內。

![STRONG BUY 分析](../screenshots/strong-buy-analysis.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## 四種模式

| | 每日 | 盤中 | 每週 | 加密 |
|---|---|---|---|---|
| 價格與基本面 | 是 | 是 | 是 | 僅 crypto.com |
| 技術指標 | 是 | 是 | 否 | 是 |
| 新聞頭條 | 是 | 否 | 否 | 否 |
| AI 建議 | 是 | 是 | 否 | 是 |
| 限價單價格 | 是 | 是 | 否 | 是(以計價幣) |
| 價值評級(股票) | 是 | 是 | 否 | 不適用 — 無基本面 |
| 抄底訊號(加密) | 是 | 是 | 否 | 是 |
| 配置分析 | 是 | 是 | 是 | 不適用 — 僅觀察 |
| 基準比較 | 儲存基準 | 與早盤比較 | 否 | 與當天錨點比較 |
| 信件範本 | 完整簡報 | 警示(僅觸發時) | 再平衡表 | 警示(僅觸發時) |
| Telegram 格式 | AI 建議 + 新聞 | 警示(僅觸發時) | BUY/TRIM 動作 | 警示(僅觸發時) |
| 排程 | 每天 1 次 | 平日每天 4 次 | 每週日 | 每天 8 次(獨立工作流程) |

第五種模式重新整理(`--refresh TICKER`)可依需求以最新價格重新分析單一標的。

![每日簡報](../screenshots/morning-debrief.png){: style="max-width: 260px; display: inline-block;" }
![盤中警示](../screenshots/intraday-alert.png){: style="max-width: 260px; display: inline-block;" }
![每週再平衡](../screenshots/weekly-rebalance.png){: style="max-width: 260px; display: inline-block;" }
