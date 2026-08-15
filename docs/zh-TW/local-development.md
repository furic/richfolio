---
title: 本機開發
layout: default
nav_order: 9
lang: zh-TW
permalink: /local-development.html
---

# 本機開發

針對想自訂程式碼、測試修改或手動觸發執行的進階使用者。多數使用者不需要這一步 — GitHub Actions 會自動處理一切。

---

## 環境需求

- **Node.js 22+** — [下載](https://nodejs.org/)
- **npm** — Node.js 附帶

---

## 安裝

```bash
git clone https://github.com/YOUR_USERNAME/richfolio.git
cd richfolio
npm install
```

---

## 設定

### 投資組合(`config.json`)

```bash
cp config.example.json config.json
```

編輯 `config.json`,填入目標配置與目前持倉。完整欄位參考請見[設定說明](configuration)。

### API 金鑰(`.env`)

```bash
cp .env.example .env
```

填入 API 金鑰。最少需要 `RESEND_API_KEY` 與 `RECIPIENT_EMAIL`。各項服務的分步說明請見 [API 金鑰](api-keys)。

---

## 執行

```bash
# 每日簡報 — 價格 + 新聞 + AI 分析 + 電子郵件 + Telegram
npm run dev

# 盤中警示檢查 — 與早盤基準比較
npm run intraday

# 每週再平衡報告 — 價格 + 配置漂移 + 電子郵件 + Telegram
npm run weekly

# 用盤後價格重新分析單一股票代碼
npm run refresh -- SMH

# 加密貨幣交叉盤檢查(CRO→BTC/ETH 換幣訊號)
npm run crypto

# 僅型別檢查不輸出檔案
npx tsc --noEmit
```

檢查信箱與 Telegram 取得結果。
