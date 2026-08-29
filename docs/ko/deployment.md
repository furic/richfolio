---
title: 배포
layout: default
nav_order: 6
lang: ko
permalink: /deployment.html
---

# 배포

Richfolio는 GitHub Actions에서 실행되며, 작은 Cloudflare Worker가 스케줄을 담당합니다 — 서버가 필요 없습니다. 저장소를 fork하고 Secret을 추가한 뒤 스케줄러를 설정하면 매일 아침 자동으로 실행됩니다.

---

## 저장소 Fork

아직 하지 않았다면 [richfolio를 fork](https://github.com/furic/richfolio/fork)해서 본인 GitHub 계정으로 가져오세요. GitHub Actions 워크플로우는 본인의 저장소에서만 실행됩니다 — fork를 해야 일일 브리핑, 장중 알림, 주간 리포트의 자동 스케줄링을 누릴 수 있습니다.

---

## 워크플로우 활성화

GitHub는 새로 fork된 저장소에서 기본적으로 Actions를 비활성화합니다. fork한 저장소 → **Actions** 탭 → **"I understand my workflows, go ahead and enable them"**을 클릭하세요.

---

## Secret 및 Variable 추가

Fork한 저장소에서: **Settings** → **Secrets and variables** → **Actions**. 여기는 "어디에 무엇을 두는가"에 대한 배포 측 체크리스트입니다 — 각 API 키를 어떻게 얻는지는 [API 키](api-keys)를 참고하세요.

| 항목 | 탭 | 비고 |
|---|---|---|
| `RESEND_API_KEY` | **Secrets** | 필수 |
| `NEWS_API_KEY` | **Secrets** | 선택 |
| `GEMINI_API_KEY` | **Secrets** | 선택 — AI 제공자 (Google Gemini) |
| `GEMINI_API_KEY_CRYPTO` | **Secrets** | 선택 — 암호화폐 워크플로용 두 번째 Gemini 키. 하루 8회 스케줄에 독립적인 할당량을 부여합니다 |
| `CLAUDE_CODE_OAUTH_TOKEN` | **Secrets** | 선택 — AI 제공자 (Anthropic Claude, Pro/Max 구독 이용, 토큰당 비용 없음). 둘 다 설정된 경우 `ANTHROPIC_API_KEY`보다 우선 적용됨 — 둘 중 하나만 사용하세요 |
| `ANTHROPIC_API_KEY` | **Secrets** | 선택 — AI 제공자 (Anthropic Claude, 사용량 기반 과금). 다른 제공자와 함께 설정하면 멀티 AI 모드 |
| `MISTRAL_API_KEY` | **Secrets** | 선택 — AI 제공자 (Mistral, 무료 Experiment 계층). 다른 제공자와 함께 설정하면 멀티 AI 모드 |
| `TELEGRAM_BOT_TOKEN` | **Secrets** | 선택 |
| `TELEGRAM_CHAT_ID` | **Secrets** | 선택 |
| `RECIPIENT_EMAIL` | **Variables** | 필수 — 쉽게 편집할 수 있도록 보이는 상태 유지 |
| `CONFIG_JSON` | **Variables** | 필수 — 포트폴리오 JSON ([형식](configuration)) |
| `CLAUDE_MODEL` | **Variables** | 선택 — Claude 모델 재정의 (기본값: `claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | **Variables** | 선택 — Mistral 모델 재정의 (기본값: `mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | **Variables** | 선택 — STRONG BUY 분석 페이지에 `gemini`, `claude`, `mistral` 중 하나 강제 지정 |
| `TIME_ZONE` | **Variables** | 선택 — 이메일의 날짜·시간 형식에 사용할 IANA 타임존(예: `Australia/Sydney`, `America/New_York`, `Europe/London`). 기본값: `UTC`. Workflow가 Node 네이티브 `TZ` 환경 변수로 매핑합니다 |

{: .important}
> **왜 `CONFIG_JSON`을 Secret이 아닌 Variable로 두는가:** Variable은 GitHub UI에서 읽을 수 있어, 매번 전체 JSON을 다시 붙여넣지 않고도 보유 종목을 직접 편집할 수 있습니다. 단점은 저장소 읽기 권한이 있는 사람이 자산 배분을 볼 수 있다는 점입니다 — 비공개 fork라면 괜찮지만, 나중에 공개로 전환할 계획이라면 고려할 사항입니다.

---

## 스케줄

스케줄러를 설정하면 워크플로우가 자동으로 실행됩니다:

- **매일** — 22:00 UTC (AEST 오전 8시)
- **장중** — 평일 03:15 / 07:15 / 11:15 / 14:15 UTC (AEST 오후 1:15 / 5:15 / 9:15, 다음 날 오전 0:15) — 신호가 강해질 때만 알립니다
- **매주** — 일요일 22:30 UTC (월요일 AEST 오전 8:30)

`watchingCrypto`를 사용한다면 두 번째 워크플로우가 함께 실행됩니다:

- **크립토** — 3시간마다 (하루 8회). 교차 페어 신호가 그날의 기준점 대비 유의미하게 바뀔 때만 알립니다

Portfolio Monitor와 의도적으로 분리해 두었습니다. 합쳐 두면 `state/` 캐시를 공유하게 되어, 크립토 실행이 주식의 아침 기준선을 덮어쓰기 때문입니다.

원할 때 언제든 수동으로 실행할 수 있습니다: 저장소 → **Actions** → **Portfolio Monitor** (또는 **Crypto Monitor**) → **Run workflow** → 모드 선택. Crypto Monitor에는 아무것도 전송하지 않고 crypto.com API 연결만 확인하는 `smoke` 모드도 있습니다.

### 스케줄러 설정하기

**두 워크플로우 모두 `schedule:` 트리거가 없습니다.** [`scheduler/`](https://github.com/furic/richfolio/tree/main/scheduler)의 Cloudflare Worker가 `repository_dispatch`로 실행시킵니다. GitHub 자체 스케줄러가 더 이상 믿고 쓸 만큼 정확하지 않기 때문입니다.

GitHub 문서는 예약된 워크플로우가 "높은 부하 시 지연될 수 있으며", 부하가 충분히 높으면 아예 폐기된다고 명시하고 있습니다. 문서화된 동작이므로 githubstatus.com에는 결코 나타나지 않습니다. GitHub 직원도 [community discussion #196910](https://github.com/orgs/community/discussions/196910)에서 드리프트가 악화되고 있음을 인정했지만, 수정 시점은 약속하지 않았습니다. 이 저장소에서 실측한 결과, 2026년 8월 22:00 UTC 데일리 브리프는 **+30분**에서 **+5~8시간**까지 밀렸고, 어느 날은 아예 실행되지 않았습니다. 작업 자체는 내내 약 25분이었으므로, 지연은 전적으로 GitHub의 디스패치 큐 때문입니다.

설정은 무료이고 5분 정도 걸립니다 — [`scheduler/README.md`](https://github.com/furic/richfolio/blob/main/scheduler/README.md)를 참고하세요. Cloudflare 계정(무료 플랜으로 충분합니다: 하루 10만 요청, Cron Trigger 5개)과 **Contents: read & write** 권한을 가진 fine-grained GitHub PAT가 필요합니다.

<details>
<summary><strong>대안: GitHub cron으로 되돌리기 (설정 불필요, 다만 시간이 부정확)</strong></summary>

<br>

Cloudflare를 설정하고 싶지 않고, 브리프가 몇 시간 늦게 도착하거나 어떤 날은 아예 오지 않아도 괜찮다면, fork한 `.github/workflows/portfolio-monitor.yml`에 `schedule:` 블록을 다시 넣으면 됩니다:

```yaml
on:
  schedule:
    - cron: "0 22 * * *"           # 매일 — AEST 오전 8시
    - cron: "15 3,7,11,14 * * 1-5" # 장중 — 평일
  repository_dispatch:
    types: [daily, intraday, weekly]
  workflow_dispatch:
    # ... 기존 inputs는 그대로 둡니다
```

또한 "Determine mode" 스텝이 다시 스케줄에서 모드를 판별하도록 되돌려야 합니다. 현재는 `github.event.action`만 읽습니다:

```yaml
case "$EVENT_NAME" in
  repository_dispatch) MODE="$DISPATCH_TYPE" ;;
  workflow_dispatch)   MODE="$INPUT_MODE" ;;
  schedule)            [ "$CRON" = "0 22 * * *" ] && MODE="daily" || MODE="intraday" ;;
esac
```

그리고 해당 스텝의 `env:`에 `CRON: ${{ github.event.schedule }}`를 추가하세요.

**GitHub** cron에서 `1-5`는 월~금을 뜻합니다. Cloudflare는 반대 규칙(`1` = 일요일)을 쓰기 때문에 Worker 설정에서는 요일을 영문 약자로 적어 둡니다. 두 시스템 사이에서 요일 숫자를 그대로 복사하지 마세요.

> ⚠️ **둘을 동시에 켜지 마세요.** GitHub은 늦은 cron이라도 결국 전달하므로, Worker가 보낸 몇 시간 뒤에 두 번째 중복 브리프가 도착합니다. 소셜 게시를 설정해 두었다면 공개 게시물까지 중복됩니다. 반드시 하나만 고르세요.

이 구성에는 예약된 주간 리포트가 없습니다. 예전 방식은 runner에게 요일을 물어(`date -u +%u`) 일요일에만 보냈는데, 드리프트가 이를 조용히 망가뜨렸습니다 — 일요일 22:00 cron이 월요일 03:00 UTC에 전달되면 day=1로 계산되어, 로그에 아무 흔적도 남기지 않고 건너뜁니다. **Actions → Run workflow → weekly**로 수동 실행하거나 Worker를 쓰세요.

</details>

<details>
<summary><strong>스케줄 또는 시간대 변경하기</strong></summary>

<br>

기본 스케줄은 AEST(UTC+10) 기준입니다. 변경하려면 `scheduler/wrangler.jsonc`의 `triggers.crons`와 `scheduler/src/index.js`의 `TRIGGERS` 맵에 있는 대응 키를 **함께** 수정한 뒤(둘이 어긋나면 테스트가 빌드를 실패시킵니다), `npx wrangler deploy`로 재배포하세요.

Cron Trigger는 **항상 UTC**입니다. 원하는 현지 시각을 먼저 UTC로 변환하세요:

| 현지 시각 | UTC cron |
|-----------------|----------|
| AEST 오전 8시 (UTC+10) | `0 22 * * *` (전날) |
| EST 오전 8시 (UTC-5) | `0 13 * * *` |
| PST 오전 8시 (UTC-8) | `0 16 * * *` |
| GMT 오전 8시 (UTC+0) | `0 8 * * *` |
| IST 오전 8시 (UTC+5:30) | `0 2 * * *` (가장 근접) |
| JST 오전 9시 (UTC+9) | `0 0 * * *` |
| CET 오전 8시 (UTC+1) | `0 7 * * *` |

시(`0 22 * * *`의 `22`)만 바꾸면 됩니다 — 나머지는 분, 일, 월, 요일을 제어합니다.

**요일은 숫자가 아니라 문자로 적으세요.** Cloudflare는 Quartz 방식을 따라 `1` = **일요일**, `7` = 토요일입니다 — Unix cron의 `1` = 월요일과 정반대입니다. 따라서 숫자 `1-5`는 일~목을 뜻하는데, Cloudflare는 이를 아무 경고 없이 받아들입니다. 배포는 깨끗하게 되고, 일요일에 실행되며, 금요일을 건너뜁니다. `MON-FRI`와 `SUN`을 쓰세요.

메일 본문의 날짜 표기를 바꾸려면 `TIME_ZONE` Actions Variable(예: `Australia/Sydney`)을 설정하세요 — 실행 시각과는 무관합니다.

</details>

---

## 포트폴리오 업데이트

보유 종목이 변경될 때는 GitHub에서 `CONFIG_JSON` 변수를 업데이트하세요 (Settings → Secrets and variables → Actions → Variables 탭). 다음 예정된 실행이 업데이트된 데이터를 사용합니다.

---

## 업스트림 업데이트 가져오기

원본 저장소의 새로운 기능을 가져오려면:

```bash
git remote add upstream https://github.com/furic/richfolio.git
git fetch upstream
git merge upstream/main
git push origin main
```

또는 fork의 메인 페이지에서 GitHub의 **Sync fork** 버튼을 사용하세요.

