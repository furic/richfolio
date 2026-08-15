---
title: 工作原理
layout: default
nav_order: 7
lang: zh-CN
permalink: /how-it-works.html
---

# 工作原理

Richfolio 是一个单管道系统 — 没有 API 服务器、没有数据库、没有仪表盘。它运行一次,产出一份报告,然后退出。

---

## 数据管道

```
CONFIG_JSON 变量 + GitHub Secrets
  → fetchPrices(Yahoo Finance:价格、P/E、52 周区间、Beta、股息、ETF 持仓、基本面、财报日历)
  → fetchTechnicals(Yahoo Finance 图表:SMA50、SMA200、RSI、MACD、布林带、ATR、随机指标、OBV、动量)
  → fetchNews(NewsAPI:每个标的的头条新闻 + Gemini 情绪评分)
  → analyze(配置缺口、P/E 信号、重叠扣减、组合指标)
  → aiAnalyze(Gemini 两阶段 Think/Plan:阶段 1 Observe → 阶段 2 Decide + 推理历史)
  → guards(AI 后置验证:财报守护、STRONG BUY 标准、债券上限、置信度/价值合理性)
  → email + telegram(投递每日简报,包含价值评级、抄底信号、技术指标、财报徽章)
```

每周模式(`--weekly`)跳过新闻、技术指标和 AI,产出聚焦的再平衡报告。

盘中模式(`--intraday`)重新获取价格和技术指标,重新运行 AI(跳过新闻),与早间基线对比,只在信号增强时发出提醒。

加密模式(`--crypto`)完全跳过投资组合流程。它从 crypto.com 获取 `watchingCrypto` 交叉盘的价格,对其运行同一套技术指标、AI 阶段与守卫规则,并与当天的锚点(而非早间基线)对比。

---

## 架构

```
src/
├── config.ts          # CONFIG_JSON 变量 + GitHub Secret 的强类型加载器
├── index.ts           # 入口 — 解析 --weekly/--intraday 标志、组装各模块
├── fetchPrices.ts     # 通过 yahoo-finance2(实例化 v3 API)获取 Yahoo Finance 数据 + 基本面 + 财报日历
├── fetchTechnicals.ts # Yahoo Finance 图表:SMA50、SMA200、RSI、MACD、布林带、ATR、随机指标、OBV
├── fetchNews.ts       # NewsAPI 配合标的-公司名映射 + Gemini 情绪评分
├── analyze.ts         # 核心分析:缺口、P/E 信号、重叠、组合指标
├── aiAnalysis.ts      # 两阶段 Gemini Think/Plan 提示词构造器 + JSON 响应解析 + 重试逻辑
├── guards.ts          # AI 后置验证管道:6 项顺序安全检查
├── detailedAnalysis.ts# Gemini 2.5 Flash:STRONG BUY 标的的详细买入论点 + 风险分析
├── analysisUrl.ts     # 把分析数据压缩为 URL hash,供 GitHub Pages 分析页使用
├── state.ts           # 盘中对比所需的早间基线保存/加载 + 7 天推理历史
├── intradayCompare.ts # 当前 AI 建议与早间基线的对比
├── email.ts           # 每日 HTML 邮件模板 + Resend 投递
├── intradayEmail.ts   # 盘中提醒邮件模板 + Resend 投递
├── weeklyEmail.ts     # 每周再平衡邮件模板 + Resend 投递
└── telegram.ts        # Telegram Bot API 投递(daily + intraday + weekly 三种格式化)
```

每个模块都是独立的 — 它们通过类型化接口通信(`QuoteData`、`TechnicalData`、`AllocationItem`、`AllocationReport`、`AIBuyRecommendation`、`IntradayAlert`、`TickerObservation`)。`QuoteData` 包含来自 Yahoo `financialData` 模块的基本面数据(ROE、负债权益、FCF、利润率、增长)以及财报日历数据(下次财报日、距离财报天数)。`TechnicalData` 包含 MACD(交叉 + 柱状图)、布林带(%B、带宽、收敛)、ATR(波动)、随机指标(%K/%D)、OBV 趋势(吸筹/派发)以及成交量变化(7 日 vs 30 日)以支撑抄底检测。`TickerObservation` 是 Think 阶段的中间产物,含结构化信号、风险标记和摘要。

---

## 分析逻辑

### 配置缺口

对目标投资组合中的每个标的:

1. **当前价值** = 持股 × 当前价
2. **当前占比** = 当前价值 / 投资组合价值 × 100
3. **缺口 %** = 目标占比 − 当前占比
4. **建议买入** = 缺口 % × 投资组合价值(仅当低配时)

投资组合价值取实际持仓价值与配置中 `totalPortfolioValue` 的较大者。

系统支持以下任一货币计价的投资组合:USD、GBP、EUR、AUD、CAD、JPY、CHF、HKD、SGD、NZD。在配置中设置 `defaultCurrency` 为你偏好的展示货币。以其它货币报价的标的(例如以 GBp 报价的英国 LSE 股票)会被自动检测、单位修正(LSE 便士 ÷ 100),并通过 Yahoo Finance 进行汇率换算后展示。

### 动态 P/E 信号

Yahoo Finance 通过 `earningsHistory` 提供季度 EPS 数据。Richfolio 计算流程:

1. 过滤为正的季度 EPS(至少 2 个季度)
2. 平均季度 EPS → 年化(× 4)
3. **均值 P/E** = 当前价 / 年化 EPS
4. 将滚动 P/E 与该均值比较:
   - **低于均值** → 潜在价值机会
   - **高于均值** → 潜在高估

ETF 和加密货币跳过此信号(无财报数据)。

### ETF 重叠检测

对每个目标 ETF,Yahoo Finance 会返回其前约 10 个持仓及权重。Richfolio 检查你是否直接持有其中任何一只:

1. 对每个匹配到 `currentHoldings` 中股票的 ETF 持仓:
   - **ETF 暴露** = 持仓权重 × ETF 的建议买入金额
   - **你的暴露** = 持股 × 股价
   - **重叠** = min(ETF 暴露, 你的暴露)
2. 把该 ETF 的所有重叠加总
3. 用总重叠扣减 ETF 的建议买入金额

**示例:** VOO 包含约 7% 的 AAPL。若你持有 $8,000 的 AAPL 且 VOO 的建议买入为 $10,000,则 AAPL 的重叠为 min(7% × $10,000, $8,000) = $700。VOO 的买入建议降至 $9,300。

### 52 周区间评分

每个标的的价格在其 52 周区间内的位置:

- **0-20%** → 接近 52 周低位(买入机会信号)
- **20-80%** → 区间中部(中性)
- **80-100%** → 接近 52 周高位(谨慎信号)

### 技术指标

Richfolio 通过 `yahooFinance.chart()` 获取约 250 日的日 OHLCV 数据,并计算:

1. **SMA50** — 最近 50 个收盘价的简单移动平均
2. **SMA200** — 最近 200 个收盘价的简单移动平均(数据点 < 200 时为 null)
3. **RSI(14)** — 标准的相对强弱指数,使用 14 日均涨/均跌
4. **MACD** — EMA(12) − EMA(26),信号线 = MACD 线的 EMA(9)。报告柱状图(MACD − 信号,正值 = 看涨动量),并根据最近 2 个交易日检测看涨/看跌交叉。需要 35+ 个数据点。最适合用来确认趋势方向
5. **布林带** — SMA(20) ± 2 个标准差。报告 %B(0 = 下轨、1 = 上轨)、带宽(波动度量)以及收敛检测(带宽位于 120 日范围底部 20%,预示突破临近)。需要 20+ 个数据点。最适合震荡行情
6. **动量信号**:
   - **看涨** — 价 > SMA50、SMA50 > SMA200、RSI > 40
   - **看跌** — 价 < SMA50、SMA50 < SMA200、RSI < 60
   - **中性** — 信号混合
7. **ATR(14)** — Wilder 平滑的平均真实波幅。报告绝对值和占价格百分比。ATR% > 3% = 高波动(放宽限价单),ATR% < 1% = 低波动(收紧限价单)。需要 15+ 数据点
8. **随机指标** — %K(14) 与 3 日 SMA 平滑的 %D。%K < 20 = 超卖确认(并入 STRONG BUY 的动量条件),%K > 80 = 超买。需要 16+ 数据点
9. **OBV 趋势** — 能量潮配合以平均成交量归一化的 10 日线性回归斜率。报告方向:上升(吸筹)、下降(派发)或走平。OBV 绝对值跨标的没有意义。需要 11+ 数据点
10. **金叉/死叉** — SMA50 上穿(金叉)或下穿(死叉)SMA200
11. **近期低点** — 最近 7 日和 30 日的最低价(支撑位)
12. **成交量变化** — 7 日均量 vs 之前 30 日均量(被抄底模型用来识别卖压衰竭)

数据点不足 50 的标的会被优雅跳过。所有指标都从既有图表数据计算 — 不产生额外 API 调用。

### AI 评分(两阶段 Think/Plan)

Richfolio 使用一个两阶段 AI 框架,灵感来自 [OpenAlice](https://github.com/TraderAlice/OpenAlice) 的认知架构:

**阶段 1 — Observe(Think):** Gemini 提示词接收每个标的的全部数据点 — 价格、P/E 比、52 周位置、配置缺口、股息率、Beta、ETF 重叠、技术指标(均线、RSI、MACD、布林带、ATR、随机指标、OBV、动量、成交量变化)、基本面(ROE、负债权益、FCF、利润率、增长、分析师目标价)、财报日历、宏观环境,以及带情绪评分的近期头条。AI 提取结构化观察:有哪些价位信号、哪些动量信号生效、风险标记、摘要和新闻情绪。该阶段不产生动作建议。

**阶段 2 — Decide(Plan):** 另一次 Gemini 调用接收阶段 1 的结构化观察、决策规则、缺口金额、宏观上下文和 7 天推理历史。因为它处理的是预先消化过的观察(而非原始数字),STRONG BUY 标准应用得更一致。AI 返回:

- **动作**:STRONG BUY、BUY、HOLD 或 WAIT
- **置信度**:0-100%
- **理由**:1-2 句解释
- **建议金额**:投入的美元金额
- **限价单价格**:基于最近支撑(均线、近期低点、整数关口)的略低于市价的建议价格
- **限价依据**:1 句话解释支撑位
- **价值评级**:个股的 A/B/C/D(ETF 和加密货币为空)
- **抄底信号**:超卖/吸筹区域描述(若无指标命中则为空)

#### 价值投资框架(仅个股)

AI 基于五项基本面标准为每只个股评级 A-D:ROE > 15%、负债权益 < 50%、FCF/经营性现金流 > 80%、盈利同比正增长以及价格低于分析师目标价。该评级会调整 AI 的置信度(A 加约 10 分,D 减约 10 分)。基本面数据来自 Yahoo 的 `financialData` 模块 — 被并入既有的 `quoteSummary` 调用,零额外 API 开销。

#### 抄底模型(所有标的)

AI 对每个标的(股票、ETF 和加密货币)评估四项抄底指标:RSI < 30、成交量萎缩 > 20%、价格低于 200 日均线和死叉。加密货币 2 项以上即触发抄底信号;股票和 ETF 需要 3 项以上(更严格的阈值以避免单次回调造成的误报)。成交量变化基于既有图表数据计算 — 不产生额外 API 调用。

技术指标会进一步细化 AI 的置信度 — 看涨动量信号配合超卖 RSI 会增强买入论据,而看跌信号或超买 RSI 会削弱。AI 遵循明确的**指标冲突解决层级**:趋势行情信 MACD,震荡行情信布林带。两者一致时(例如 MACD 看涨交叉 + 在布林带下轨反弹)置信度加 5-10 分。布林带收敛叠加同时的 MACD 交叉被视为最强入场信号(置信度加 10-15 分)。当二者冲突时(例如 MACD 看涨但 %B 接近上轨)置信度降低以避免追高。

AI 返回建议后,**守护验证管道**(`guards.ts`)运行 6 项顺序检查:债券 ETF 上限、财报临近、STRONG BUY 标准强制、最多 2 个 STRONG BUY、置信度合理性以及买入金额合理性。守护用于捕捉 AI 忽视提示指令的情况,作为程序化的安全网。

若 Gemini 不可用,系统会回退到基于缺口的排序(配置缺口最大优先)。对 Gemini 的临时错误(503/429),会自动重试最多 2 次,采用 5s/10s 退避,然后才回退。

### STRONG BUY 详细分析页

对每个 **STRONG BUY** 标的,会有另一次 Gemini 2.5 Flash 调用生成深入买入论点(3-4 段)和 3-4 项具体风险因子。这份详细分析连同所有指标和技术数据通过 zlib 压缩并以 base64url 编码为 URL hash 片段。

邮件和 Telegram 消息中的**"详细分析"**链接指向 GitHub Pages 上的静态分析页(`docs/analysis/index.html`)。页面在客户端用 pako 解码 URL hash,并渲染:

- **交互式 TradingView 图表** — 6 个月的蜡烛图,叠加 SMA50、SMA200 和 RSI
- **关键指标网格** — 价格、P/E、52 周位置、RSI、移动均线、动量
- **买入论点** — Gemini Flash 输出的多段详细分析
- **风险分析** — 需要关注的具体风险因子
- **基本面** — ROE、负债权益、利润率、增长、分析师目标(仅股票)
- **信号** — 金叉/死叉、抄底信号(加密货币)
- **动作摘要** — 建议投入金额、限价单价格及理由
- **52 周区间条** — 在年度区间内的可视化位置

无需服务端逻辑 — 所有数据都内嵌在 URL 中。页面一次加载后可离线工作。URL 通常在 1,000-1,500 字符之间,远在邮件客户端的限制以内。

![STRONG BUY 分析](../screenshots/strong-buy-analysis.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## 四种模式

| | 每日 | 盘中 | 每周 | 加密 |
|---|---|---|---|---|
| 价格与基本面 | 是 | 是 | 是 | 仅 crypto.com |
| 技术指标 | 是 | 是 | 否 | 是 |
| 新闻头条 | 是 | 否 | 否 | 否 |
| AI 建议 | 是 | 是 | 否 | 是 |
| 限价单价格 | 是 | 是 | 否 | 是(以计价币) |
| 价值评级(股票) | 是 | 是 | 否 | 不适用 — 无基本面 |
| 抄底信号(加密) | 是 | 是 | 否 | 是 |
| 配置分析 | 是 | 是 | 是 | 不适用 — 仅观察 |
| 基线对比 | 保存基线 | 与早间对比 | 否 | 与当天锚点对比 |
| 邮件模板 | 完整简报 | 提醒(仅触发时) | 再平衡表 | 提醒(仅触发时) |
| Telegram 格式 | AI 建议 + 新闻 | 提醒(仅触发时) | BUY/TRIM 动作 | 提醒(仅触发时) |
| 排程 | 每天 1 次 | 工作日每天 4 次 | 每周日 | 每天 8 次(独立工作流) |

第五种模式刷新(`--refresh TICKER`)可按需以最新价格重新分析单个标的。

![每日简报](../screenshots/morning-debrief.png){: style="max-width: 260px; display: inline-block;" }
![盘中提醒](../screenshots/intraday-alert.png){: style="max-width: 260px; display: inline-block;" }
![每周再平衡](../screenshots/weekly-rebalance.png){: style="max-width: 260px; display: inline-block;" }
