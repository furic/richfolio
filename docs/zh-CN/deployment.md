---
title: 部署
layout: default
nav_order: 6
lang: zh-CN
permalink: /deployment.html
---

# 部署

Richfolio 以 GitHub Actions 定时任务的形式运行 — 无需服务器。Fork 仓库、添加 Secret,它就会每天自动运行。

---

## Fork 仓库

如果还没 Fork,[请先 Fork richfolio](https://github.com/furic/richfolio/fork) 到你自己的 GitHub 账号。GitHub Actions 工作流只能在你自己的仓库中运行 — Fork 之后才能享受每日简报、盘中提醒和每周报告的自动化调度。

---

## 启用工作流

GitHub 默认会禁用新 Fork 仓库的 Actions。前往你的 Fork → **Actions** 标签页 → 点击 **"I understand my workflows, go ahead and enable them"**。

---

## 添加 Secret 和变量

在 Fork 的仓库:**Settings** → **Secrets and variables** → **Actions**。这里是部署端的"该放哪里"对照清单 — 至于如何获取各 API 密钥,请见 [API 密钥](api-keys)。

| 项目 | 标签页 | 备注 |
|---|---|---|
| `RESEND_API_KEY` | **Secrets** | 必需 |
| `NEWS_API_KEY` | **Secrets** | 可选 |
| `GEMINI_API_KEY` | **Secrets** | 可选 — AI 提供方(Google Gemini) |
| `CLAUDE_CODE_OAUTH_TOKEN` | **Secrets** | 可选 — AI 提供方(Anthropic Claude,通过 Pro/Max 订阅,不按 token 计费)。如果同时设置了 `ANTHROPIC_API_KEY`,此项会优先生效 — 请只设置其中一个 |
| `ANTHROPIC_API_KEY` | **Secrets** | 可选 — AI 提供方(Anthropic Claude,按用量付费)。与另一家同时配置可启用多 AI 模式 |
| `MISTRAL_API_KEY` | **Secrets** | 可选 — AI 提供方(Mistral,免费 Experiment 层)。与另一家同时配置可启用多 AI 模式 |
| `TELEGRAM_BOT_TOKEN` | **Secrets** | 可选 |
| `TELEGRAM_CHAT_ID` | **Secrets** | 可选 |
| `RECIPIENT_EMAIL` | **Variables** | 必需 — 可见方便日后直接编辑 |
| `CONFIG_JSON` | **Variables** | 必需 — 你的投资组合 JSON([格式](configuration)) |
| `CLAUDE_MODEL` | **Variables** | 可选 — 覆盖 Claude 模型(默认:`claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | **Variables** | 可选 — 覆盖 Mistral 模型(默认:`mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | **Variables** | 可选 — 在 STRONG BUY 分析页面强制使用 `gemini`、`claude` 或 `mistral` |
| `TIME_ZONE` | **Variables** | 可选 — 邮件中日期/时间格式所用的 IANA 时区(例如 `Australia/Sydney`、`America/New_York`、`Europe/London`)。默认:`UTC`。Workflow 会映射为 Node 原生的 `TZ` 环境变量 |

{: .important}
> **为什么 `CONFIG_JSON` 用 Variable 而不是 Secret:** Variable 在 GitHub UI 中是可见的,你可以直接在页面上修改持仓,不用每次都重新粘贴整段 JSON。代价是任何有仓库读取权限的人都会看到你的资产配置 — 私有 Fork 没问题,但如果以后想公开仓库就要留意。

---

## 调度

工作流会自动运行:

- **每日** — 每天 UTC 时间 22:00(AEST 上午 8:00)
- **盘中** — 工作日 AEST 上午 10 点、中午 12 点、下午 2 点和 4 点(只在信号增强时发出提醒)
- **每周** — 每周日 UTC 时间 22:00(周一 AEST 上午 8:00)

你也可以手动触发:仓库 → **Actions** → **Portfolio Monitor** → **Run workflow** → 选择 daily、intraday 或 weekly 模式。

<details>
<summary><strong>更改调度时间或时区</strong></summary>

<br>

默认时间是按 AEST(UTC+10)设置的。要更改,请编辑 Fork 中的 `.github/workflows/portfolio-monitor.yml`。

文件中包含三条 cron 条目 — 每种模式各一条:

```yaml
schedule:
  - cron: "0 22 * * *"    # 每天 UTC 22:00(AEST 上午 8 点)
  - cron: "0 0,2,4,6 * * 1-5"  # 盘中检查(工作日)
  - cron: "0 22 * * 0"    # 每周日 UTC 22:00
```

GitHub Actions 的 cron **始终使用 UTC 时间**。请先将你的本地时间换算为 UTC:

| 你的本地时间 | UTC Cron |
|--------------|----------|
| AEST 上午 8 点(UTC+10) | `0 22 * * *`(前一天) |
| EST 上午 8 点(UTC-5) | `0 13 * * *` |
| PST 上午 8 点(UTC-8) | `0 16 * * *` |
| GMT 上午 8 点(UTC+0) | `0 8 * * *` |
| IST 上午 8 点(UTC+5:30) | `0 2 * * *`(最接近) |
| JST 上午 9 点(UTC+9) | `0 0 * * *` |
| CET 上午 8 点(UTC+1) | `0 7 * * *` |

**提示:** 搜索 "UTC time converter" 查找适合你时区的 cron 值。只需修改小时位(`0 22 * * *` 中的 `22`)— 其余分别控制分钟、日、月和星期。

</details>

---

## 更新你的投资组合

当持仓发生变化时,在 GitHub 上更新 `CONFIG_JSON` 变量(Settings → Secrets and variables → Actions → Variables 标签页)。下一次定时运行就会使用更新后的数据。

---

## 同步上游更新

要从原始仓库获取新功能:

```bash
git remote add upstream https://github.com/furic/richfolio.git
git fetch upstream
git merge upstream/main
git push origin main
```

或者直接在你的 Fork 主页点击 GitHub 的 **Sync fork** 按钮。
