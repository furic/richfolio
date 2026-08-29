---
title: 部署
layout: default
nav_order: 6
lang: zh-CN
permalink: /deployment.html
---

# 部署

Richfolio 运行在 GitHub Actions 上,由一个小巧的 Cloudflare Worker 负责调度 — 无需服务器。Fork 仓库、添加 Secret、配置好调度器,它就会每天早上自动运行。

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
| `GEMINI_API_KEY_CRYPTO` | **Secrets** | 可选 — 供加密工作流使用的第二个 Gemini 密钥,使其每天 8 次的排程拥有独立额度 |
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

配置好调度器后,工作流会自动运行:

- **每日** — 22:00 UTC（AEST 上午 8 点）
- **盘中** — 工作日 03:15 / 07:15 / 11:15 / 14:15 UTC（AEST 下午 1:15 / 5:15 / 9:15 / 次日凌晨 0:15）— 仅在信号增强时提醒
- **每周** — 周日 22:30 UTC（周一 AEST 上午 8:30）

如果你使用 `watchingCrypto`,还会有第二个工作流并行运行:

- **加密货币** — 每 3 小时一次（每天 8 次）,仅在跨币对信号相对当日锚点发生显著变化时提醒

它与 Portfolio Monitor 刻意分开:否则两者会共享 `state/` 缓存,加密货币的运行会覆盖股票的早间基线。

你随时可以手动触发任意模式:仓库 → **Actions** → **Portfolio Monitor**（或 **Crypto Monitor**）→ **Run workflow** → 选择模式。Crypto Monitor 还提供 `smoke` 模式,可在不发送任何内容的情况下检查 crypto.com API 的连通性。

### 配置调度器

**两个工作流都没有 `schedule:` 触发器。** 它们由 [`scheduler/`](https://github.com/furic/richfolio/tree/main/scheduler) 中的 Cloudflare Worker 通过 `repository_dispatch` 触发,因为 GitHub 自带的调度器已经不够准时,无法再依赖。

GitHub 文档写明,定时工作流「在高负载期间可能被延迟」,负载足够高时会被直接丢弃 — 这是被文档化的行为,因此永远不会出现在 githubstatus.com 上。GitHub 员工也在 [community discussion #196910](https://github.com/orgs/community/discussions/196910) 中承认漂移正在恶化,但没有给出修复时间表。在本仓库实测:2026 年 8 月,22:00 UTC 的每日简报从 **+30 分钟** 漂移到 **+5 至 8 小时**,并有一天完全没有运行。任务本身始终约 25 分钟 — 延迟完全来自 GitHub 的派发队列。

配置是免费的,约需五分钟 — 参见 [`scheduler/README.md`](https://github.com/furic/richfolio/blob/main/scheduler/README.md)。你需要一个 Cloudflare 账号（免费套餐即可:每天 10 万次请求、5 个 Cron Trigger）,以及一个具备 **Contents: read & write** 权限的 fine-grained GitHub PAT。

<details>
<summary><strong>备选方案:改回 GitHub cron（零配置,但时间不可靠）</strong></summary>

<br>

如果你不想配置 Cloudflare,并且能接受简报可能晚几个小时送达 — 或某天干脆不送达 — 可以在你 fork 的 `.github/workflows/portfolio-monitor.yml` 中加回 `schedule:` 块:

```yaml
on:
  schedule:
    - cron: "0 22 * * *"           # 每日 — AEST 上午 8 点
    - cron: "15 3,7,11,14 * * 1-5" # 盘中 — 工作日
  repository_dispatch:
    types: [daily, intraday, weekly]
  workflow_dispatch:
    # ... 保留现有的 inputs
```

同时需要把 "Determine mode" 步骤改回能从调度解析模式,因为它目前只读取 `github.event.action`:

```yaml
case "$EVENT_NAME" in
  repository_dispatch) MODE="$DISPATCH_TYPE" ;;
  workflow_dispatch)   MODE="$INPUT_MODE" ;;
  schedule)            [ "$CRON" = "0 22 * * *" ] && MODE="daily" || MODE="intraday" ;;
esac
```

并在该步骤的 `env:` 中加入 `CRON: ${{ github.event.schedule }}`。

注意:在 **GitHub** 的 cron 里 `1-5` 表示周一至周五。Cloudflare 采用相反的约定（`1` = 周日）,这正是 Worker 配置中把星期几拼写成英文缩写的原因。不要在两者之间复制星期几的数字。

> ⚠️ **切勿同时启用两者。** GitHub 最终仍会送达那个迟到的 cron,于是你会在 Worker 触发的几小时后收到第二份重复简报 — 如果配置了社交发布,还会重复发布公开内容。二选一。

这种配置下没有定时的每周报告:旧做法是向 runner 询问星期几（`date -u +%u`）并只在周日发送,而漂移悄悄破坏了它 — 周日 22:00 的 cron 若在周一 03:00 UTC 才送达,计算得到 day=1,于是跳过,且日志中毫无痕迹。请从 **Actions → Run workflow → weekly** 手动运行,或改用 Worker。

</details>

<details>
<summary><strong>修改调度或时区</strong></summary>

<br>

默认调度针对 AEST（UTC+10）。要修改,请同时编辑 `scheduler/wrangler.jsonc` 中的 `triggers.crons` **和** `scheduler/src/index.js` 中 `TRIGGERS` 映射的对应键 — 两者不一致时测试会让构建失败 — 然后用 `npx wrangler deploy` 重新部署。

Cron Trigger **始终使用 UTC**。请先把你想要的当地时间换算成 UTC:

| 你的当地时间 | UTC cron |
|-----------------|----------|
| AEST 上午 8 点 (UTC+10) | `0 22 * * *`（前一天） |
| EST 上午 8 点 (UTC-5) | `0 13 * * *` |
| PST 上午 8 点 (UTC-8) | `0 16 * * *` |
| GMT 上午 8 点 (UTC+0) | `0 8 * * *` |
| IST 上午 8 点 (UTC+5:30) | `0 2 * * *`（最接近） |
| JST 上午 9 点 (UTC+9) | `0 0 * * *` |
| CET 上午 8 点 (UTC+1) | `0 7 * * *` |

只需修改小时位（`0 22 * * *` 中的 `22`）— 其余部分控制分钟、日、月和星期。

**星期几要拼写,不要用数字。** Cloudflare 遵循 Quartz 约定:`1` = **周日**,`7` = 周六 — 与 Unix cron 的 `1` = 周一相反。因此数字 `1-5` 实际表示周日至周四,而 Cloudflare 会毫无提示地接受它:部署正常、周日照跑、周五被跳过。请使用 `MON-FRI` 和 `SUN`。

设置 `TIME_ZONE` Actions 变量（例如 `Australia/Sydney`）可控制邮件正文中的日期显示 — 这与运行时间无关。

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
