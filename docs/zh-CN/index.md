---
title: 首页
layout: home
nav_order: 1
lang: zh-CN
permalink: /
---

# Richfolio

零维护的投资组合监控系统。一次性设置目标配置后,即可每日收到投资组合配置缺口、AI 驱动的买入信号以及相关新闻的简报 — 通过邮件和 Telegram 自动送达,完全由 GitHub Actions 托管运行。

**全部基于免费额度运行。无需服务器、无需仪表盘、无持续成本。**

---

## 你将获得什么

每天清晨,Richfolio 会获取实时市场数据,运行配置分析,生成 AI 买入建议,并将一份精美的报告送达你的收件箱和 Telegram。

![每日简报](../screenshots/morning-debrief.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

| 组件 | 服务 | 成本 |
|------|------|------|
| 价格与基本面 | Yahoo Finance | 免费 |
| 新闻 | NewsAPI.org | 免费(每日 100 次请求) |
| AI 分析 | Google Gemini 2.5 Flash | 免费(每日约 20 次请求) |
| 邮件 | Resend.com | 免费(每月 3,000 封) |
| Telegram | Telegram Bot API | 免费 |
| 调度 | GitHub Actions | 免费(cron 定时) |

---

## 适合谁使用

Richfolio **不会替你挑选股票**。你应该已经拥有自己信任的股票、ETF 或加密货币投资组合。

Richfolio 的作用是**每日监控你的投资组合**,帮你决定**何时**买入 — 跟踪价格、技术指标、新闻情绪和配置缺口,然后通过 AI 突出最佳的入场时机。

- **你提供组合** — 在简单的 JSON 配置中一次性设定目标配置
- **Richfolio 提供信号** — 买入建议、限价单价格和详细分析
- **你做最终决定** — 每一次买入都是你的决定,工具仅提供建议

**无需编程。** Fork 仓库,花约 10 分钟注册免费 API 账号,把密钥粘贴到 GitHub 设置中,然后就完成了。所有内容都通过 GitHub Actions 自动运行,每月 $0 成本。

---

## 文档

| 页面 | 描述 |
|------|------|
| [功能特性](features) | Richfolio 的功能 — 全部 10 项能力详细说明 |
| [快速开始](getting-started) | Fork、配置、部署四步走 |
| [配置说明](configuration) | `CONFIG_JSON` 字段参考、代码格式、技巧 |
| [API 密钥](api-keys) | Resend、NewsAPI、Gemini、Telegram 分步设置指南 |
| [部署](deployment) | GitHub Actions、Secret、定时任务自定义 |
| [工作原理](how-it-works) | 架构、数据管道、分析逻辑 |
| [本地开发](local-development) | 进阶用户 — 本地运行以便自定义或手动触发 |
| [故障排查](troubleshooting) | 常见错误及解决方案 |
| [参考资料](references) | 设计灵感与先验项目 |
