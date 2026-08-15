---
title: ローカル開発
layout: default
nav_order: 9
lang: ja
permalink: /local-development.html
---

# ローカル開発

コードをカスタマイズし、変更をテストし、手動で実行したい上級ユーザー向けです。ほとんどのユーザーには不要です — GitHub Actions がすべて自動的に処理します。

---

## 要件

- **Node.js 22+** — [ダウンロード](https://nodejs.org/)
- **npm** — Node.js に付属

---

## インストール

```bash
git clone https://github.com/YOUR_USERNAME/richfolio.git
cd richfolio
npm install
```

---

## 設定

### ポートフォリオ（`config.json`）

```bash
cp config.example.json config.json
```

`config.json` を編集し、目標配分と現在の保有を入力してください。フィールドの詳細は[設定](configuration)を参照してください。

### API キー（`.env`）

```bash
cp .env.example .env
```

API キーを入力します。最低限必要なのは `RESEND_API_KEY` と `RECIPIENT_EMAIL` です。各サービスの段階的な手順は [API キー](api-keys)を参照してください。

---

## 実行

```bash
# Daily brief — prices + news + AI analysis + email + Telegram
npm run dev

# Intraday alert check — compares vs morning baseline
npm run intraday

# Weekly rebalancing report — prices + allocation drift + email + Telegram
npm run weekly

# Re-analyze single ticker with after-hours price
npm run refresh -- SMH

# 暗号資産クロスペアのチェック（CRO→BTC/ETH 交換シグナル）
npm run crypto

# Type-check without emitting
npx tsc --noEmit
```

メールと Telegram で結果を確認してください。
