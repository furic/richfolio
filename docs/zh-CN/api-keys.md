---
title: API 密钥
layout: default
nav_order: 5
lang: zh-CN
permalink: /api-keys.html
---

# API 密钥

Richfolio 最多使用 5 个外部服务,全都有慷慨的免费额度。只有 Resend 和接收邮箱是必需的 — 其它都是可选。

将每个密钥添加为仓库 Secret:Settings → Secrets and variables → Actions → **Secrets** 标签页。`RECIPIENT_EMAIL` 改为添加为**变量**(便于查看和编辑)。

![GitHub Actions Secret](../screenshots/github_actions_secrets.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## Resend(邮件)— 必需
{: .text-green-200}

Resend 负责投递 HTML 邮件报告。

1. 进入 [resend.com](https://resend.com) 并注册
2. 在控制台找到 **API Keys**
3. 点击 **Create API Key**、起个名字并复制密钥
4. 将其添加为 GitHub Secret — 名称:`RESEND_API_KEY`,值:刚才复制的密钥

**免费额度:** 每月 3,000 封邮件。默认从 `onboarding@resend.dev` 发件。除非你验证了自定义域名,否则只能发送给**你的账号注册邮箱**(Dashboard → Domains → Add Domain → 添加 DNS 记录)。

---

## 接收邮箱 — 必需
{: .text-green-200}

添加为 GitHub **变量**(不是 Secret):名称:`RECIPIENT_EMAIL`,值:你的邮箱地址。

除非验证了自定义域名,否则必须与 Resend 账号邮箱一致。

---

## NewsAPI(新闻头条)— 可选
{: .text-yellow-200}

为每日简报提供每个股票代码的头条新闻。

1. 进入 [newsapi.org](https://newsapi.org) 并注册
2. 控制台会立即显示你的 API 密钥
3. 添加为 GitHub Secret — 名称:`NEWS_API_KEY`,值:控制台中的密钥

**免费额度:** 每日 100 次请求。Richfolio 每次运行通过批量请求只用约 4 次。仅返回最近 24 小时的头条。若未设置,简报会跳过新闻部分。

---

## AI 服务商 — 启用 AI 建议至少需要一个

Richfolio 支持三家 AI 服务商:**Google Gemini**、**Anthropic Claude** 和 **Mistral**。至少设置其中一个即可启用 AI 买入建议。**设置两个或更多**则会并行运行 — 分数取平均,并在每条建议旁显示每家 AI 的详细拆解。一个都不设置时,Richfolio 会回退到基于缺口的建议(不使用 AI)。

| 模式 | 配置 | 输出 |
|---|---|---|
| **不使用 AI** | 一个密钥都没设置 | 仅基于缺口的建议 |
| **单 AI** | 设置其中一个 | 与现状一致 — 每个标的一组操作 + 置信度 |
| **多 AI** | 设置两个或更多 | 每个标的取共识操作 + 平均置信度;每条建议下显示每家 AI 的拆解;STRONG BUY 按异议距离设上限 |

---

## Google Gemini — 可选
{: .text-yellow-200}

由 Gemini 2.5 Flash 驱动的 AI 买入建议。

1. 进入 [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. 点击 **Create API Key**,选择一个 Google Cloud 项目(或新建一个)
3. 复制密钥并添加为 GitHub Secret — 名称:`GEMINI_API_KEY`,值:刚才复制的密钥

**免费额度:** 截至 2026 年 8 月,一次真实的 429 报错显示 `gemini-2.5-flash` 的额度为**每日约 20 次请求**(此前这里记录的是每日 250 次 — Google 会在不预先通知的情况下调整限额,请以 [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit) 为准)。Richfolio 每次运行使用 2 次请求(Stage 1 Observe + Stage 2 Decide),每个 STRONG BUY 标的的详细分析额外增加 1 次,每日新闻相关性过滤再增加 1 次。按每日完整的 6 次运行(1 次 daily + 5 次 intraday)计算,即使是清淡的一天也会用掉 13 次以上请求,因此 Gemini 经常会在当天较晚的运行中耗尽额度并掉线 — 简报仍会照常发送,并带上标记降级服务商的 `⚠ n/n AI` 徽章。新密钥的额度可能需要几分钟才能激活(你可能会先看到 429 错误)。

### 关于 Gemini 模型层级的说明

Google 的定价页面声明 Gemini 2.5 Pro 对输入和输出 token 都是["免费"](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-pro)。实际使用中,免费层的 Pro 请求经常碰到 `429 RESOURCE_EXHAUSTED` — 即使用量很低也会。Google 没有公布免费层的实际 RPD(每日请求数)上限;第三方资料估计 Pro 大约限制在 100 RPD,但实际数字似乎因账号而异且无保证。

**Richfolio 默认使用 Gemini 2.5 Flash**,因为 Flash 的免费额度更慷慨且更稳定。对金融分析文本来说,质量差异可以忽略。

---

## Anthropic Claude — 可选
{: .text-yellow-200}

由 Claude(默认 Sonnet 4.6)驱动的 AI 买入建议。有两种认证方式,Richfolio 会使用你配置的那一种。

### 方式一 — Claude Pro/Max 订阅(不按 token 计费)

如果你已经在付费使用 Claude Pro 或 Max,Richfolio 可以直接用你现有的订阅额度运行,而不用另外购买 API 额度。

1. 安装 Claude Code 并用拥有该订阅的账号登录
2. 在本地运行 `claude setup-token`,复制它打印出的 token
3. 将其添加为 GitHub Secret — 名称:`CLAUDE_CODE_OAUTH_TOKEN`,值:该 token

**使用此方式时,请让 `ANTHROPIC_API_KEY` 保持未设置。** 在 Claude Code 内部,API key 的优先级高于订阅 token,所以两者都设置会在你毫无察觉的情况下从 API 账户计费 — 而这正是本方式想要避免的情况。Richfolio 会优先使用订阅 token 并从子进程中剥离 API key,但最干净的做法还是只设置其中一个。

**有效期:** 大约一年,不会自动刷新。与 Threads 令牌不同,它没有自动刷新流程 — 需要每年重新运行一次 `claude setup-token`。过期后 Claude 会从运行中掉线。在多服务商配置下(Claude 加上 Gemini 和/或 Mistral),其余服务商会继续工作,简报会被标记为 `⚠ n/n AI`,而不是直接失败 — 但这个徽章只在配置了 2 个及以上服务商时才会出现。如果 Claude 是你唯一的服务商,就没有"幸存者"可以触发徽章:简报会悄悄回退到基于缺口的建议。

### 方式二 — API key(按用量付费)

1. 进入 [console.anthropic.com](https://console.anthropic.com) 并注册
2. 进入 **API Keys** → **Create Key**,起个名字并复制密钥
3. 添加为 GitHub Secret — 名称:`ANTHROPIC_API_KEY`,值:刚才复制的密钥

**价格:** Anthropic 没有像 Gemini 那样的长期免费额度,但新账号会获得少量起始信用额度,对于 Richfolio 这种工作量来说,Sonnet 通常每天只花几美分。如需进一步降低成本,可设置 `CLAUDE_MODEL=claude-haiku-4-5-20251001`(Haiku 层价格显著更低,处理此工作量仍然绰绰有余)。

---

## Mistral — 可选
{: .text-yellow-200}

使用 Mistral Large(默认 `mistral-large-latest`)生成 AI 买入建议。

1. 访问 [console.mistral.ai](https://console.mistral.ai) 并注册
2. 进入 **API Keys** → **Create new key**,复制密钥
3. 添加为 GitHub Secret — 名称:`MISTRAL_API_KEY`,值:刚才复制的密钥

**免费额度:** Experiment 层长期免费 — 每月约 10 亿 tokens,而 Richfolio 的工作量约为每月 700 万。它按速率限制而非信用额度计费,所以触到上限时看到的是 429(而不是计费失败),这类错误会自动重试。想要更多余量、运行更快,可设置 `MISTRAL_MODEL=mistral-medium-latest`(质量略有下降)。

Mistral 适合作为第二家服务商,正是因为它与 Gemini 属于彼此独立的模型谱系:第二个模型只有当它的分歧反映的是数据而不是自身能力较弱时,才真正带来新信息。

---

## 多 AI 模式

如果 `GEMINI_API_KEY`、Claude(`CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY`)与 `MISTRAL_API_KEY` 中设置了两个或更多,Richfolio 每次分析都会并发运行这些服务商并聚合结果:

- 每个标的的**共识操作**通过多数表决决定(置信度之和作为平票时的判定依据)
- **平均置信度**显著展示;每家 AI 的分数显示在下方
- **STRONG BUY 按异议距离设上限** — 只要持异议的服务商都在一档之内(异议为 `BUY` 表示方向一致),STRONG BUY 就保留;一旦有服务商更远(`HOLD`／`WAIT`),就压到 BUY。`SB + SB + BUY` 保留;`SB + SB + HOLD` 压到 BUY
- **一致性标签**(unanimous / majority / split)作为徽章显示在操作旁

聚合后的操作是摘要,不是闸门。每家服务商的操作、置信度与理由都会显示在它的正下方;只要有任一服务商判定为 STRONG BUY,该标的就会保留详细分析页、"More Details" 链接、限价以及技术指标行 — 无论最终是否被压到 BUY。你看到全部投票,由你决定。

若想改为要求全体一致(任何异议都把 STRONG BUY 降为 BUY),请在 `config.json` 中设置 `"ai": { "strongBuyRequiresAllProviders": true }`。

如果某家服务商在运行中失败(限流、额度用尽、网络错误),其余服务商会在没有它的情况下继续。该次运行会被标记为**降级**:每条建议在邮件中带上类似 `⚠ 1/2 AI` 的徽章(Telegram 中为标签),因为单一服务商的判断不该看起来像经过交叉验证。默认不改动操作本身 — 没有作答的服务商在任何距离上都不算异议。只有开启 `strongBuyRequiresAllProviders` 时,降级运行中的 STRONG BUY 才会一并被压到 BUY。只配置了一家服务商时不适用:那种配置本来就没有承诺比较。

### 选择由哪家服务商生成 STRONG BUY 详细分析页

多家服务商都启用时,每个 STRONG BUY 的详细分析页(即"More Details"链接)由单一服务商生成 — 默认按注册顺序选择首个可用的(先 Gemini,再 Claude,再 Mistral)。可通过以下方式覆盖:

| 环境变量 | 取值 | 效果 |
|---|---|---|
| `AI_DETAILED_PROVIDER` | `gemini` | 强制使用 Gemini 生成详细分析(必须已设置 GEMINI_API_KEY) |
| `AI_DETAILED_PROVIDER` | `claude` | 强制使用 Claude 生成详细分析(必须已设置 `CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY`) |
| `AI_DETAILED_PROVIDER` | `mistral` | 强制使用 Mistral 生成详细分析(必须已设置 MISTRAL_API_KEY) |
| `MISTRAL_MODEL` | `mistral-medium-latest` | 更便宜、更快的 Mistral 模型(默认:`mistral-large-latest`) |
| `CLAUDE_MODEL` | 例如 `claude-haiku-4-5-20251001` | 覆盖 Claude 模型(默认:`claude-sonnet-4-6`) |

如果 `AI_DETAILED_PROVIDER` 指定了一家没有设置密钥的服务商(或一个未知名称),该设置会被记录日志并忽略,回退到注册顺序 — 否则固定到一家没有 API key 的服务商会导致每个标的都失败。

---

## Telegram 机器人 — 可选
{: .text-yellow-200}

把精简后的摘要发送到你的 Telegram。

### 创建机器人

1. 打开 Telegram,搜索 **@BotFather**
2. 发送 `/newbot`
3. 起一个名字(例如 "Richfolio Brief")和用户名(必须以 `bot` 结尾,例如 `richfolio_brief_bot`)
4. BotFather 会回复你的机器人 token — 复制下来

### 获取你的 chat ID

1. 在 Telegram 中搜索 **@userinfobot** 并启动
2. 它会回复你的数字用户 ID — 这就是你的 chat ID

**重要:** 在运行 Richfolio 之前,先给新创建的机器人发送任意消息(例如 "hi") — 这一步必须先做,机器人才能给你发送消息。

将以下两项都添加为 GitHub Secret:

- 名称:`TELEGRAM_BOT_TOKEN`,值:BotFather 给的 token
- 名称:`TELEGRAM_CHAT_ID`,值:你的数字用户 ID

**注意:** 未设置时,简报会跳过 Telegram。消息是精简后的摘要(不是完整 HTML)。单条消息有 4,096 字符上限,新闻部分必要时会被截断。

---

## 社交发布 — 可选
{: .text-yellow-200}

Richfolio 可以把通用的买入信号发布到 X、Facebook、Threads 和 LinkedIn 的公开账号。每个平台都是可选的,在配置之前保持关闭。各平台所需的 Secret:

- **Facebook:** `FACEBOOK_PAGE_ID`、`FACEBOOK_PAGE_TOKEN`
- **Threads:** `THREADS_USER_ID`、`THREADS_ACCESS_TOKEN`(+ 可选的 `THREADS_TOKEN_PAT`,用于自动刷新约 60 天过期的令牌)
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN`、`LINKEDIN_ORG_URN`
- **X/Twitter:** `X_API_KEY`、`X_API_SECRET`、`X_ACCESS_TOKEN`、`X_ACCESS_TOKEN_SECRET`

**注意:** 发布内容是通用的 — 不会泄露任何持仓或配置。若未设置,社交发布会被跳过。各平台的逐步设置详见 [社交发布](social-setup)。

---

## 汇总

| 密钥 | 必填 | 服务 |
|------|------|------|
| `RESEND_API_KEY` | 是 | 邮件投递 |
| `RECIPIENT_EMAIL` | 是 | 你的邮箱地址 |
| `NEWS_API_KEY` | 否 | 新闻头条 |
| `GEMINI_API_KEY` | 否 | AI 服务商(Google Gemini) |
| `CLAUDE_CODE_OAUTH_TOKEN` | 否 | AI 服务商(Anthropic Claude,通过 Pro/Max 订阅) |
| `ANTHROPIC_API_KEY` | 否 | AI 服务商(Anthropic Claude,通过按用量付费的 API key) |
| `MISTRAL_API_KEY` | 否 | AI 服务商(Mistral — 免费 Experiment 层) |
| `TELEGRAM_BOT_TOKEN` | 否 | Telegram 投递 |
| `TELEGRAM_CHAT_ID` | 否 | Telegram 投递 |
| `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` | 否 | Facebook 主页发布 |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | 否 | Threads 发布 |
| `THREADS_TOKEN_PAT` | 否 | 自动刷新 Threads 令牌(带 Secrets 写权限的 PAT) |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` | 否 | LinkedIn 主页发布 |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | 否 | X/Twitter 发布 |
| `CLAUDE_MODEL` | 否 | 覆盖 Claude 模型(默认:`claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | 否 | 覆盖 Mistral 模型(默认:`mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | 否 | 强制使用 `gemini`、`claude` 或 `mistral` 生成 STRONG BUY 详细分析页 |
