---
title: 首頁
layout: home
nav_order: 1
lang: zh-TW
permalink: /
---

# Richfolio

零維護的投資組合監控系統。一次設定目標配置後,即可每日收到投資組合配置缺口、AI 驅動的買進訊號以及相關新聞的簡報 — 透過電子郵件和 Telegram 自動送達,完全由 GitHub Actions 託管執行。

**全部基於免費額度運作。不需要伺服器、不需要儀表板、沒有持續成本。**

---

## 你會得到什麼

每天清晨,Richfolio 會抓取即時市場資料、執行配置分析、產生 AI 買進建議,並將一份精美的報告送到你的收件匣和 Telegram。

![每日簡報](../screenshots/morning-debrief.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

| 元件 | 服務 | 費用 |
|------|------|------|
| 價格與基本面 | Yahoo Finance | 免費 |
| 加密貨幣交叉盤 | crypto.com 公開 API | 免費(不需金鑰) |
| 新聞 | NewsAPI.org | 免費(每日 100 次請求) |
| AI 分析 | Google Gemini 2.5 Flash | 免費(每日約 20 次請求) |
| 電子郵件 | Resend.com | 免費(每月 3,000 封) |
| Telegram | Telegram Bot API | 免費 |
| 排程 | GitHub Actions | 免費(cron 定時) |

---

## 適合誰使用

Richfolio **不會替你挑選股票**。你應該已經擁有自己信任的股票、ETF 或加密貨幣投資組合。

Richfolio 的作用是**每日監控你的投資組合**,協助你決定**什麼時候**買進 — 追蹤價格、技術指標、新聞情緒和配置缺口,然後透過 AI 凸顯最佳的進場時機。

- **由你提供組合** — 在簡單的 JSON 設定中一次設定目標配置
- **Richfolio 提供訊號** — 買進建議、限價單價格和詳細分析
- **由你做最終決定** — 每一次買進都是你的決定,工具只負責建議

**不需要寫程式。** Fork 儲存庫,花約 10 分鐘註冊免費 API 帳號,把金鑰貼到 GitHub 設定中,就完成了。所有內容都透過 GitHub Actions 自動執行,每月 $0 成本。

---

## 文件

| 頁面 | 描述 |
|------|------|
| [功能特性](features) | Richfolio 的功能 — 全部 10 項能力詳解 |
| [快速開始](getting-started) | Fork、設定、部署四步驟 |
| [設定說明](configuration) | `CONFIG_JSON` 欄位參考、代碼格式、技巧 |
| [API 金鑰](api-keys) | Resend、NewsAPI、Gemini、Telegram 分步設定 |
| [部署](deployment) | GitHub Actions、Secret、排程自訂 |
| [運作原理](how-it-works) | 架構、資料管線、分析邏輯 |
| [本機開發](local-development) | 進階使用者 — 本機執行以便自訂或手動觸發 |
| [疑難排解](troubleshooting) | 常見錯誤與修正 |
| [參考資料](references) | 設計靈感與先前作品 |
