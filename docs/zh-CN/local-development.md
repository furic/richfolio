---
title: 本地开发
layout: default
nav_order: 9
lang: zh-CN
permalink: /local-development.html
---

# 本地开发

面向希望自定义代码、测试改动或手动触发运行的进阶用户。大多数用户无需这一步 — GitHub Actions 会自动处理一切。

---

## 环境要求

- **Node.js 22+** — [下载](https://nodejs.org/)
- **npm** — Node.js 自带

---

## 安装

```bash
git clone https://github.com/YOUR_USERNAME/richfolio.git
cd richfolio
npm install
```

---

## 配置

### 投资组合(`config.json`)

```bash
cp config.example.json config.json
```

编辑 `config.json`,填入你的目标配置和当前持仓。完整字段参考请见[配置说明](configuration)。

### API 密钥(`.env`)

```bash
cp .env.example .env
```

填入你的 API 密钥。至少需要 `RESEND_API_KEY` 和 `RECIPIENT_EMAIL`。每项服务的分步说明请见 [API 密钥](api-keys)。

---

## 运行

```bash
# 每日简报 — 价格 + 新闻 + AI 分析 + 邮件 + Telegram
npm run dev

# 盘中提醒检查 — 与早间基线对比
npm run intraday

# 每周再平衡报告 — 价格 + 配置漂移 + 邮件 + Telegram
npm run weekly

# 用盘后价格重新分析单个股票代码
npm run refresh -- SMH

# 加密货币交叉盘检查(CRO→BTC/ETH 换币信号)
npm run crypto

# 仅类型检查不输出文件
npx tsc --noEmit
```

检查邮件和 Telegram 即可获取运行结果。
