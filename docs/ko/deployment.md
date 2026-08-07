---
title: 배포
layout: default
nav_order: 6
lang: ko
permalink: /deployment.html
---

# 배포

Richfolio는 GitHub Actions cron 작업으로 실행됩니다 — 서버가 필요 없습니다. 저장소를 fork하고, Secret을 추가하면 매일 아침 자동으로 실행됩니다.

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
| `ANTHROPIC_API_KEY` | **Secrets** | 선택 — AI 제공자 (Anthropic Claude). 다른 제공자와 함께 설정하면 멀티 AI 모드 |
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

워크플로우는 자동으로 실행됩니다:

- **일일** — 매일 UTC 22:00 (AEST 오전 8시)
- **장중** — 평일 AEST 오전 10시, 12시, 오후 2시, 4시 (신호가 강해질 때만 알림)
- **주간** — 매주 일요일 UTC 22:00 (월요일 AEST 오전 8시)

수동으로도 트리거할 수 있습니다: 저장소 → **Actions** → **Portfolio Monitor** → **Run workflow** → daily, intraday, weekly 모드 중 선택.

<details>
<summary><strong>스케줄이나 시간대 변경하기</strong></summary>

<br>

기본 스케줄은 AEST (UTC+10)에 맞춰져 있습니다. 변경하려면 fork에서 `.github/workflows/portfolio-monitor.yml`을 편집하세요.

파일에는 세 개의 cron 항목이 있습니다 — 각 모드당 하나씩:

```yaml
schedule:
  - cron: "0 22 * * *"    # Daily at 10pm UTC (8am AEST)
  - cron: "0 0,2,4,6 * * 1-5"  # Intraday checks (weekdays)
  - cron: "0 22 * * 0"    # Weekly on Sunday 10pm UTC
```

GitHub Actions의 cron은 **항상 UTC**입니다. 원하는 현지 시간을 얻으려면 먼저 UTC로 변환하세요:

| 현지 시간 | UTC Cron |
|-----------|----------|
| AEST 오전 8시 (UTC+10) | `0 22 * * *` (전날) |
| EST 오전 8시 (UTC-5) | `0 13 * * *` |
| PST 오전 8시 (UTC-8) | `0 16 * * *` |
| GMT 오전 8시 (UTC+0) | `0 8 * * *` |
| IST 오전 8시 (UTC+5:30) | `0 2 * * *` (가장 근사) |
| JST 오전 9시 (UTC+9) | `0 0 * * *` |
| CET 오전 8시 (UTC+1) | `0 7 * * *` |
| KST 오전 8시 (UTC+9) | `0 23 * * *` (전날) |

**팁:** "UTC time converter"를 검색해 본인 시간대에 맞는 cron 값을 찾으세요. `0 22 * * *`에서 시(`22`)만 변경하면 됩니다 — 나머지는 분, 일, 월, 요일을 제어합니다.

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

