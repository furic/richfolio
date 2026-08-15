---
title: 仕組み
layout: default
nav_order: 7
lang: ja
permalink: /how-it-works.html
---

# 仕組み

Richfolio は単一パイプラインのシステムです — API サーバーもデータベースもダッシュボードもありません。一度実行し、レポートを生成して終了します。

---

## データパイプライン

```
CONFIG_JSON variable + GitHub Secrets
  → fetchPrices (Yahoo Finance: prices, P/E, 52w range, beta, dividends, ETF holdings, fundamentals, earnings calendar)
  → fetchTechnicals (Yahoo Finance chart: SMA50, SMA200, RSI, MACD, Bollinger Bands, ATR, Stochastic, OBV, momentum)
  → fetchNews (NewsAPI: top headlines per ticker + Gemini sentiment scoring)
  → analyze (allocation gaps, P/E signals, overlap discounts, portfolio metrics)
  → aiAnalyze (Gemini two-stage Think/Plan: Stage 1 Observe → Stage 2 Decide + reasoning history)
  → guards (post-AI validation: earnings guard, STRONG BUY criteria, bond cap, confidence/value sanity)
  → email + telegram (deliver daily brief with value ratings, bottom signals, technicals, earnings badges)
```

週次モード（`--weekly`）はニュース、テクニカル、AI をスキップし、リバランスに集中したレポートを生成します。

ザラ場モード（`--intraday`）は価格とテクニカルを再取得し、AI を再実行し（ニュースはスキップ）、朝のベースラインと比較し、シグナルが強まったときのみアラートを出します。

暗号資産モード（`--crypto`）はポートフォリオのパイプラインを完全にスキップします。`watchingCrypto` のクロスペアを crypto.com から取得し、同じテクニカル指標・AI ステージ・ガードを適用したうえで、朝のベースラインではなくその日のアンカーと比較します。

---

## アーキテクチャ

```
src/
├── config.ts          # Typed loader for CONFIG_JSON variable + GitHub Secrets
├── index.ts           # Entry point — parses --weekly/--intraday flags, wires modules
├── fetchPrices.ts     # Yahoo Finance via yahoo-finance2 (instance-based v3 API) + fundamentals + earnings calendar
├── fetchTechnicals.ts # Yahoo Finance chart: SMA50, SMA200, RSI, MACD, Bollinger Bands, ATR, Stochastic, OBV
├── fetchNews.ts       # NewsAPI with ticker-to-company-name mapping + Gemini sentiment scoring
├── analyze.ts         # Core analysis: gaps, P/E signals, overlap, portfolio metrics
├── aiAnalysis.ts      # Two-stage Gemini Think/Plan prompt builder + JSON response parser + retry logic
├── guards.ts          # Post-AI validation pipeline: 6 sequential safety checks
├── detailedAnalysis.ts# Gemini 2.5 Flash: detailed buy thesis + risk analysis for STRONG BUY tickers
├── analysisUrl.ts     # Compress analysis data into URL hash for the GitHub Pages analysis page
├── state.ts           # Morning baseline save/load for intraday comparison + 7-day reasoning history
├── intradayCompare.ts # Compare current AI recs vs morning baseline
├── email.ts           # Daily HTML email template + Resend delivery
├── intradayEmail.ts   # Intraday alert email template + Resend delivery
├── weeklyEmail.ts     # Weekly rebalancing email template + Resend delivery
└── telegram.ts        # Telegram Bot API delivery (daily + intraday + weekly formatters)
```

各モジュールは独立しており、型付きインターフェース（`QuoteData`、`TechnicalData`、`AllocationItem`、`AllocationReport`、`AIBuyRecommendation`、`IntradayAlert`、`TickerObservation`）を介して通信します。`QuoteData` には Yahoo の `financialData` モジュール由来のファンダメンタルデータ（ROE、D/E、FCF、利益率、成長率）と決算カレンダーのデータ（次回決算日、決算までの日数）が含まれます。`TechnicalData` には MACD（クロスオーバー＋ヒストグラム）、ボリンジャーバンド（%B、バンド幅、スクイーズ）、ATR（ボラティリティ）、ストキャスティクス（%K/%D）、OBV トレンド（蓄積／分配）、底値拾い検出のための出来高変化（7 日対 30 日）が含まれます。`TickerObservation` は Think ステージの中間出力であり、構造化されたシグナル、リスクフラグ、サマリーを含みます。

---

## 分析ロジック

### 配分ギャップ

目標ポートフォリオ内の各ティッカーについて：

1. **現在価値** = 保有株数 × 現在価格
2. **現在比率** = 現在価値 / ポートフォリオ価値 × 100
3. **ギャップ %** = 目標 % − 現在 %
4. **推奨買い金額** = ギャップ % × ポートフォリオ価値（アンダーウェイト時のみ）

ポートフォリオ価値は、実際の保有価値と設定上の `totalPortfolioValue` の大きい方を使います。

システムは次のいずれかの通貨建てのポートフォリオをサポートします：USD、GBP、EUR、AUD、CAD、JPY、CHF、HKD、SGD、NZD。設定の `defaultCurrency` を表示したい通貨に設定してください。他通貨で建てられているティッカー（例：GBp 建ての英国 LSE 株式）は自動検出され、単位修正され（LSE のペンスは ÷ 100）、表示用に Yahoo Finance 経由で為替換算されます。

### 動的 P/E シグナル

Yahoo Finance は `earningsHistory` 経由で四半期 EPS データを提供します。Richfolio は次のように計算します：

1. 正の四半期 EPS をフィルタ（少なくとも 2 四半期が必要）
2. 四半期 EPS を平均 → 年換算（× 4）
3. **平均 P/E** = 現在価格 / 年換算 EPS
4. トレーリング P/E をこの平均と比較：
   - **平均以下** → 潜在的なバリュー機会
   - **平均以上** → 潜在的に割高

ETF と暗号資産はこのシグナルをスキップします（決算データなし）。

### ETF 重複検出

各目標 ETF について、Yahoo Finance はその上位約 10 銘柄を構成比率付きで返します。Richfolio はその銘柄をあなたが直接保有しているかどうかを確認します：

1. `currentHoldings` の銘柄に一致する ETF 構成銘柄ごとに：
   - **ETF エクスポージャ** = 構成比率 × ETF の推奨買い金額
   - **あなたのエクスポージャ** = 保有株数 × 株価
   - **重複** = min(ETF エクスポージャ, あなたのエクスポージャ)
2. ETF のすべての重複を合計
3. ETF の推奨買い金額を合計重複分だけ減算

**例：** VOO は約 7% を AAPL で構成しています。AAPL を $8,000 分保有していて VOO の推奨買い金額が $10,000 の場合、AAPL の重複は min(7% × $10,000, $8,000) = $700 です。VOO の買い推奨は $9,300 に下がります。

### 52 週レンジスコアリング

各ティッカーの価格は 52 週レンジ内に位置付けられます：

- **0〜20%** → 52 週安値付近（買い機会シグナル）
- **20〜80%** → 中間レンジ（中立）
- **80〜100%** → 52 週高値付近（注意シグナル）

### テクニカル指標

Richfolio は `yahooFinance.chart()` で約 250 日分の日次 OHLCV データを取得し、次を計算します：

1. **SMA50** — 直近 50 終値の単純移動平均
2. **SMA200** — 直近 200 終値の単純移動平均（データ点が 200 未満の場合は null）
3. **RSI(14)** — 14 日平均上昇／下落を用いた標準的な相対力指数
4. **MACD** — EMA(12) − EMA(26)、シグナルライン = MACD ラインの EMA(9)。ヒストグラム（MACD − シグナル、正の値 = 強気モメンタム）を報告し、直近 2 営業日から強気／弱気のクロスオーバーを検出。35 以上のデータ点が必要。トレンド方向の確認に最適
5. **ボリンジャーバンド** — SMA(20) ± 2σ。%B（0 = 下限バンド、1 = 上限バンド）、バンド幅（ボラティリティ尺度）、スクイーズ検出（バンド幅が 120 日レンジの下位 20% に入るとブレイクアウトの近づきを示唆）を報告。20 以上のデータ点が必要。レンジ相場に最適
6. **モメンタムシグナル**：
   - **強気** — 価格 > SMA50、SMA50 > SMA200、RSI > 40
   - **弱気** — 価格 < SMA50、SMA50 < SMA200、RSI < 60
   - **中立** — シグナル混在
7. **ATR(14)** — Wilder スムージングの平均トゥルーレンジ。絶対値と価格比のパーセントを報告。ATR% > 3% = 高ボラ（指値を広げる）、ATR% < 1% = 低ボラ（指値を狭める）。15 以上のデータ点が必要
8. **ストキャスティクスオシレータ** — %K(14) と 3 日 SMA 平滑の %D。%K < 20 = 売られすぎ確認（STRONG BUY 基準のモメンタムシグナルに加算）、%K > 80 = 買われすぎ。16 以上のデータ点が必要
9. **OBV トレンド** — 平均出来高で正規化した 10 日線形回帰の傾きを使用するオンバランスボリューム。方向を報告：上昇（蓄積）、下降（分配）、横ばい。OBV の絶対値はティッカー間で意味を持ちません。11 以上のデータ点が必要
10. **ゴールデンクロス／デッドクロス** — SMA50 が SMA200 を上抜け（ゴールデン）または下抜け（デッド）
11. **直近安値** — 直近 7 取引日および 30 取引日の最安値（サポートレベル）
12. **出来高変化** — 直近 7 日の平均出来高と前 30 日の平均出来高の比較（売り疲れを検出する底値拾いモデルで使用）

データ点が 50 未満のティッカーは穏やかにスキップされます。すべての指標は既存のチャートデータから計算され、追加 API 呼び出しはゼロです。

### AI スコアリング（2 段階 Think/Plan）

Richfolio は [OpenAlice](https://github.com/TraderAlice/OpenAlice) の認知アーキテクチャに着想を得た 2 段階の AI フレームワークを使います：

**ステージ 1 — Observe（Think）：** Gemini プロンプトは各ティッカーのすべてのデータポイントを受け取ります — 価格、P/E、52 週ポジション、配分ギャップ、配当利回り、Beta、ETF 重複、テクニカル指標（MA、RSI、MACD、ボリンジャー、ATR、ストキャスティクス、OBV、モメンタム、出来高変化）、ファンダメンタルデータ（ROE、D/E、FCF、利益率、成長率、アナリスト目標）、決算カレンダー、マクロ環境、センチメントスコア付きの最近のニュースヘッドラインです。AI は構造化された観察結果を抽出します：どの価格レベルシグナルが揃っているか、どのモメンタムシグナルが有効か、リスクフラグ、サマリー、ニュースセンチメント。このステージではアクション推奨は出しません。

**ステージ 2 — Decide（Plan）：** 別の Gemini 呼び出しがステージ 1 の構造化観察結果、意思決定ルール、ギャップ金額、マクロコンテキスト、7 日の推論履歴を受け取ります。あらかじめ消化された観察結果（生の数値ではなく）を扱うため、STRONG BUY 基準をより一貫して適用します。AI は次を返します：

- **アクション**：STRONG BUY、BUY、HOLD、WAIT
- **信頼度**：0〜100%
- **理由**：1〜2 文の説明
- **推奨金額**：投資する USD 金額
- **指値価格**：最寄りのサポート（MA、直近安値、キリ番）に基づく市場価格を下回る推奨価格
- **指値の理由**：サポートレベルを 1 文で説明
- **バリュー評価**：個別株の A/B/C/D（ETF と暗号資産は空）
- **底値シグナル**：売られすぎ／蓄積ゾーンの説明（指標が揃わなければ空）

#### バリュー投資フレームワーク（株式のみ）

AI は 5 つのファンダメンタル基準で各個別株を A〜D に評価します：ROE > 15%、D/E < 50%、FCF/営業 CF > 80%、増益、株価がアナリスト目標を下回る。評価は AI の信頼度スコアを調整します（A で約 10 ポイント加算、D で約 10 ポイント減算）。ファンダメンタルデータは Yahoo の `financialData` モジュールから取得 — 既存の `quoteSummary` 呼び出しに相乗りするため、追加 API オーバーヘッドはゼロです。

#### 底値拾いモデル（全ティッカー）

AI はすべてのティッカー（株式、ETF、暗号資産）について 4 つの底値指標を評価します：RSI < 30、出来高減少 > 20%、価格が 200 日 MA 以下、デッドクロス。暗号資産は 2 つ以上の指標で底値シグナル。株式と ETF は 3 つ以上が必要（単一の押し目による誤シグナルを避けるための厳しめの閾値）。出来高変化は既存のチャートデータから計算され、追加 API 呼び出しはありません。

テクニカル指標はさらに AI の信頼度を精緻化します — 強気モメンタムシグナルと売られすぎ RSI の組み合わせは買いの根拠を強め、弱気シグナルや買われすぎ RSI は弱めます。AI は明示的な**指標矛盾解消の階層**に従います：トレンド相場では MACD、レンジ相場ではボリンジャーバンドを信頼。両方が一致するとき（例：強気 MACD クロスオーバー＋下限ボリンジャーバンドからの反発）、信頼度は 5〜10 ポイント加算されます。ボリンジャーのスクイーズと同時の MACD クロスオーバーは最強のエントリーシグナルとして扱われます（信頼度 10〜15 ポイント加算）。両者が食い違うとき（例：強気 MACD だが %B が上限バンド付近）、行き過ぎたエントリーを避けるため信頼度は引き下げられます。

AI が推奨を返した後、**ガード検証パイプライン**（`guards.ts`）が 6 つの逐次チェックを実行します：債券 ETF キャップ、決算近接、STRONG BUY 基準の強制、STRONG BUY は最大 2 件、信頼度の妥当性、買い金額の妥当性。ガードは AI がプロンプト指示を無視するケースを捕捉し、プログラム的なセーフティネットとして機能します。

Gemini が利用できない場合、システムはギャップベースのランキング（配分ギャップが大きい順）にフォールバックします。Gemini の一時的なエラー（503/429）は 5 秒／10 秒のバックオフで最大 2 回まで自動リトライされてから、フォールバックします。

### 詳細分析ページ（STRONG BUY のみ）

**STRONG BUY** のティッカーごとに、別の Gemini 2.5 Flash 呼び出しが詳しい買いの根拠（3〜4 段落）と 3〜4 個の具体的なリスク要因を生成します。この詳細分析は、すべての指標およびテクニカルデータと共に zlib で圧縮され、base64url で URL ハッシュフラグメントとしてエンコードされます。

メールと Telegram のメッセージには、GitHub Pages（`docs/analysis/index.html`）にホストされている静的分析ページを指す **「詳細分析」** リンクが含まれます。ページは pako を使って URL ハッシュをクライアントサイドでデコードし、次をレンダリングします：

- **インタラクティブな TradingView チャート** — 6 ヶ月のローソク足、SMA50、SMA200、RSI のオーバーレイ付き
- **主要指標グリッド** — 価格、P/E、52 週ポジション、RSI、移動平均線、モメンタム
- **買いの根拠** — Gemini Flash による複数段落の詳細分析
- **リスク分析** — 注視すべき具体的なリスク要因
- **ファンダメンタル** — ROE、D/E、利益率、成長率、アナリスト目標（株式のみ）
- **シグナル** — ゴールデン／デッドクロス、底値シグナル（暗号資産）
- **アクションサマリー** — 推奨投資金額、指値価格とその理由
- **52 週レンジバー** — 年間レンジ内の可視ポジション

サーバーサイドのロジックは不要 — すべてのデータが URL に埋め込まれています。ページは一度ロードされればオフラインでも動作します。URL は通常 1,000〜1,500 文字程度で、メールクライアントの制限内に余裕で収まります。

![STRONG BUY 分析](../screenshots/strong-buy-analysis.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## 4 つのモード

| | 毎日 | ザラ場 | 週次 | 暗号資産 |
|---|---|---|---|---|
| 価格＆ファンダメンタル | はい | はい | はい | crypto.com のみ |
| テクニカル指標 | はい | はい | いいえ | はい |
| ニュースヘッドライン | はい | いいえ | いいえ | いいえ |
| AI 推奨 | はい | はい | いいえ | はい |
| 指値価格 | はい | はい | いいえ | はい（決済通貨建て） |
| バリュー評価（株式） | はい | はい | いいえ | 該当なし — ファンダメンタルなし |
| 底値シグナル（暗号資産） | はい | はい | いいえ | はい |
| 配分分析 | はい | はい | はい | 該当なし — ウォッチ専用 |
| ベースライン比較 | ベースライン保存 | 朝と比較 | いいえ | その日のアンカーと比較 |
| メールテンプレート | フルブリーフ | アラート（発火時のみ） | リバランス表 | アラート（発火時のみ） |
| Telegram フォーマット | AI 推奨＋ニュース | アラート（発火時のみ） | BUY/TRIM アクション | アラート（発火時のみ） |
| スケジュール | 1 日 1 回 | 平日 1 日 4 回 | 毎週日曜 | 1 日 8 回（専用ワークフロー） |

5 つ目のモードであるリフレッシュ（`--refresh TICKER`）は、最新価格で単一ティッカーをオンデマンドに再分析します。

![毎日のブリーフ](../screenshots/morning-debrief.png){: style="max-width: 260px; display: inline-block;" }
![ザラ場アラート](../screenshots/intraday-alert.png){: style="max-width: 260px; display: inline-block;" }
![週次リバランス](../screenshots/weekly-rebalance.png){: style="max-width: 260px; display: inline-block;" }
