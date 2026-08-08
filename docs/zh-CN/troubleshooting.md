---
title: 故障排查
layout: default
nav_order: 8
lang: zh-CN
permalink: /troubleshooting.html
---

# 故障排查

常见问题及解决方法。

---

## "Can only send testing emails to your own email address"

**原因:** Resend 免费版的限制。

**解决:** 将 `RECIPIENT_EMAIL` 设为你注册 Resend 时所用的邮箱;或者在 Resend 上验证一个自定义域名(Dashboard → Domains → Add Domain → 添加 DNS 记录)。

---

## "GEMINI_API_KEY quota: limit 0"

**原因:** 新创建的 Gemini API 密钥需要几分钟才能激活。部分密钥在未启用计费和 API 之前完全不可用。

**解决:** 依次尝试以下步骤:

1. **等待 5-10 分钟** — 新密钥有时只需要一点时间来激活
2. **启用 Generative Language API** — 进入 [Google Cloud Console](https://console.cloud.google.com/apis/library) → 搜索 "Generative Language API" → 在关联了你 API 密钥的项目里点击 **Enable**
3. **添加账单信息** — 进入 [Google AI Studio](https://aistudio.google.com) → Settings → Billing 添加账单信息。你仍然可以选择**免费层** — 添加账单只是为了激活密钥,在超出免费额度之前不会被扣费

在此期间,Richfolio 会自动回退到基于缺口的建议 — 简报仍会发送,只是没有 AI 分析。如果你同时设置了 Claude(`CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY`)或 `MISTRAL_API_KEY`,在 Gemini 恢复期间,那家服务商会单独继续提供分析 — 该次运行会被标记为降级(`⚠ 1/2 AI` 徽章),并且 STRONG BUY 会被压到 BUY。

---

## Claude 在简报中悄悄消失

**原因:** `CLAUDE_CODE_OAUTH_TOKEN` 过期或缺失,表现出的症状与缺少 `ANTHROPIC_API_KEY` 完全一样 — Claude 就是不在了。如果 Claude 是唯一的 AI 服务商,简报会悄悄回退到基于缺口的建议;在多 AI 模式下,其余服务商会继续工作,该次运行会被标记为降级(`⚠ 1/2 AI` 徽章,STRONG BUY 被压到 BUY)。不会有明显报错 — 需要查看 GitHub Actions 的运行日志,确认 Claude 服务商是否出现认证失败。

**解决:** 订阅 token 的有效期约为一年,不会自动刷新。请在本地重新运行 `claude setup-token` 生成新 token,并更新 `CLAUDE_CODE_OAUTH_TOKEN` 这个 Secret。如果你更想改用按用量付费的方式,设置 `ANTHROPIC_API_KEY` 并让 `CLAUDE_CODE_OAUTH_TOKEN` 保持未设置即可。

---

## 某个股票代码出现 "fetch failed — internal-error"

**原因:** Yahoo Finance 对某些股票代码偶尔会出问题(尤其是 BIPC 这类不常见的代码)。

**解决:** 无需处理。该代码会被跳过,其余流程正常继续。这是 Yahoo Finance 的间歇性问题。

---

## GitHub Actions 显示 Secret 为空

**原因:** Secret 添加的层级不对。

**解决:** 确保 Secret 是在**仓库**级别添加的:Settings → Secrets and variables → Actions → Repository secrets。而不是在环境级别。

---

## 没有返回新闻

**原因:** NewsAPI 免费版只返回最近 24 小时内的文章。某些股票代码(尤其是 ETF 和小盘股)很少出现在新闻头条中。

**解决:** 这是正常行为。对这些代码,简报仍然能正常运行,只是没有新闻。AI 分析会在建议中标注 "无近期新闻"。

---

## 没收到 Telegram 消息

**原因:** 你还没有主动与你的机器人开启对话。

**解决:** 打开 Telegram,按用户名搜索你的机器人,给它发送任意消息(例如 "hi")。Telegram Bot API 要求用户先主动发起对话,机器人才能向你发送消息。之后重新运行 Richfolio 即可。

---

## "Missing config.json" 错误

**原因:** 项目根目录下不存在 `config.json`。

**解决:**
- **GitHub Actions:** 确保 `CONFIG_JSON` 变量存在并包含有效的 JSON 内容(Settings → Secrets and variables → Actions → **Variables** 标签页)。
- **本地:** 运行 `cp config.example.json config.json` 并填入你的投资组合数据。

---

## 简报能跑通但邮件为空或缺少部分内容

**原因:** 一个或多个 API 密钥缺失或无效。

**解决:** 检查 `.env` 文件(本地)或 GitHub Secret(Actions)。简报会根据可用密钥自适应:
- 缺少 `NEWS_API_KEY` → 无新闻部分
- `GEMINI_API_KEY`、Claude(`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`)与 `MISTRAL_API_KEY` 都没有设置 → 使用基于缺口的建议替代 AI
- 只配置了其中一个 AI 密钥 → 单 AI 模式(目前的默认行为)
- 配置了两个或更多 AI 密钥 → 多 AI 模式:分数取平均,每条建议下方显示各 AI 的分项,STRONG BUY 需要全体一致同意
- 缺少 `TELEGRAM_BOT_TOKEN` → 仅邮件(无 Telegram)

所有组合都是合法的 — 只有 `RESEND_API_KEY` 和 `RECIPIENT_EMAIL` 是必需的。
