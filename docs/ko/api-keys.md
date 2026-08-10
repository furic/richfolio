---
title: API 키
layout: default
nav_order: 5
lang: ko
permalink: /api-keys.html
---

# API 키

Richfolio는 최대 5개의 외부 서비스를 사용하며, 모두 넉넉한 무료 플랜이 있습니다. Resend와 수신 이메일만 필수이고 — 나머지는 모두 선택 사항입니다.

각 키는 저장소 Secret으로 추가하세요: Settings → Secrets and variables → Actions → **Secrets** 탭. `RECIPIENT_EMAIL`은 **Variable**로 추가하는 것이 좋습니다 (보기/편집이 더 쉽습니다).

![GitHub Actions Secrets](../screenshots/github_actions_secrets.png){: style="max-width: 500px; display: block; margin: 16px auto;" }

---

## Resend (이메일) — 필수
{: .text-green-200}

Resend가 HTML 이메일 리포트를 전달합니다.

1. [resend.com](https://resend.com)으로 이동하여 가입
2. 대시보드에서 **API Keys**로 이동
3. **Create API Key**를 클릭하고 이름을 지정한 뒤 키를 복사
4. GitHub Secret으로 추가 — 이름: `RESEND_API_KEY`, 값: 방금 복사한 키

**무료 플랜:** 월 3,000건 이메일. 기본 발신자는 `onboarding@resend.dev`. 사용자 도메인을 인증하지 않은 경우 **계정 소유자 이메일**로만 발송할 수 있습니다 (Dashboard → Domains → Add Domain → DNS 레코드 추가).

---

## 수신 이메일 — 필수
{: .text-green-200}

GitHub **Variable**로 추가 (Secret이 아님): 이름: `RECIPIENT_EMAIL`, 값: 본인 이메일 주소.

사용자 도메인을 인증하지 않은 경우 Resend 계정 이메일과 일치해야 합니다.

---

## NewsAPI (헤드라인) — 선택
{: .text-yellow-200}

일일 브리핑에 종목별 톱 헤드라인을 제공합니다.

1. [newsapi.org](https://newsapi.org)로 이동하여 가입
2. API 키가 대시보드에 바로 표시됩니다
3. GitHub Secret으로 추가 — 이름: `NEWS_API_KEY`, 값: 대시보드의 키

**무료 플랜:** 1일 100건 요청. Richfolio는 배칭을 통해 실행당 약 4건만 사용합니다. 최근 24시간 헤드라인만 반환됩니다. 설정하지 않으면 브리핑이 뉴스 없이 실행됩니다.

---

## AI 제공사 — AI 추천을 사용하려면 최소 하나 필요

Richfolio는 세 가지 AI 제공사를 지원합니다: **Google Gemini**, **Anthropic Claude**, **Mistral**. AI 기반 추천을 사용하려면 최소 하나를 설정하세요. **둘 이상** 설정하면 병렬로 실행되며 — 점수가 평균되고 각 추천 옆에 AI별 분석이 표시됩니다. 하나도 설정하지 않으면 Richfolio는 격차 기반 추천으로 폴백합니다 (AI 없음).

| 모드 | 설정 | 출력 |
|---|---|---|
| **AI 없음** | 키가 하나도 없음 | 격차 기반 추천만 |
| **단일 AI** | 한 개 키 설정 | 기존과 동일 — 종목당 하나의 액션 + 신뢰도 |
| **멀티 AI** | 두 개 이상의 키 설정 | 종목별 합의 액션 + 평균 신뢰도; 각 추천 아래에 AI별 분석 표시; STRONG BUY는 반대 거리로 제한 판단 |

---

## Google Gemini — 선택
{: .text-yellow-200}

Gemini 2.5 Flash로 AI 매수 추천을 구동합니다.

1. [aistudio.google.com/apikey](https://aistudio.google.com/apikey)로 이동
2. **Create API Key**를 클릭하고 Google Cloud 프로젝트를 선택(또는 새로 생성)
3. 키를 복사하고 GitHub Secret으로 추가 — 이름: `GEMINI_API_KEY`, 값: 방금 복사한 키

**무료 플랜:** 2026년 8월 기준, `gemini-2.5-flash`에 대한 실제 429 오류는 **1일 약 20건**의 할당량을 알렸습니다 (이전에는 여기에 1일 250건으로 문서화되어 있었지만 — Google이 예고 없이 이 한도를 바꾸므로, [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit)를 정본으로 취급하세요). Richfolio는 실행당 2건의 요청을 사용하며 (Stage 1 Observe + Stage 2 Decide), STRONG BUY 종목당 상세 분석을 위해 1건, 일일 뉴스 관련성 필터를 위해 1건이 추가됩니다. 하루 전체 6회 스케줄(일일 1회 + 장중 5회)을 통틀면 조용한 날에도 13건 이상이 사용되므로, Gemini는 종종 할당량을 소진하고 이후 실행에서 빠지게 됩니다 — 그래도 브리핑은 계속 발송되며, 성능이 저하된 제공사를 나타내는 `⚠ n/n AI` 배지가 표시됩니다. 새 키는 할당량 활성화에 몇 분이 걸릴 수 있습니다 (처음에는 429 오류가 보일 수 있음).

### Gemini 모델 계층에 대한 참고

Google의 가격 페이지는 Gemini 2.5 Pro가 입력 및 출력 토큰 모두에 대해 ["무료"](https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-pro)라고 명시합니다. 하지만 실제로는 무료 플랜의 Pro 요청이 사용량이 적어도 `429 RESOURCE_EXHAUSTED` 오류에 자주 부딪힙니다. Google은 무료 플랜의 실제 RPD(requests per day) 한도를 공개하지 않으며; 제3자 자료에 따르면 Pro는 약 100 RPD로 제한되는 것으로 보이지만 실제 수치는 계정에 따라 다른 듯하며 보장되지 않습니다.

**Richfolio는 기본적으로 Gemini 2.5 Flash를 사용합니다.** Flash가 더 넉넉하고 안정적인 무료 플랜 할당량을 가지고 있기 때문입니다. 금융 분석 텍스트에서의 품질 차이는 무시할 만합니다.

---

## Anthropic Claude — 선택
{: .text-yellow-200}

Claude (기본값 Sonnet 4.6)로 AI 매수 추천을 구동합니다. 인증 방식은 두 가지이며, Richfolio는 설정된 쪽을 사용합니다.

### 옵션 1 — Claude Pro/Max 구독 (토큰당 비용 없음)

이미 Claude Pro나 Max를 구독 중이라면, Richfolio는 API 크레딧을 구매하는 대신 기존 구독 할당량으로 실행될 수 있습니다.

1. Claude Code를 설치하고 구독을 보유한 계정으로 로그인
2. 로컬에서 `claude setup-token`을 실행하고 출력된 토큰을 복사
3. GitHub Secret으로 추가 — 이름: `CLAUDE_CODE_OAUTH_TOKEN`, 값: 해당 토큰

**이 옵션을 사용할 때는 `ANTHROPIC_API_KEY`를 설정하지 마세요.** Claude Code 내부에서는 API 키가 구독 토큰보다 우선하므로, 둘 다 설정하면 조용히 API 계정에 요금이 청구됩니다 — 바로 이 옵션이 막고자 하는 상황입니다. Richfolio는 구독 토큰을 우선시하고 하위 프로세스에서 API 키를 제거하지만, 가장 깔끔한 구성은 둘 중 하나만 두는 것입니다.

**유효 기간:** 약 1년이며 자동 갱신되지 않습니다. Threads 토큰과 달리 갱신 워크플로우가 없으므로 — 매년 `claude setup-token`을 다시 실행하세요. 만료되면 Claude가 실행에서 빠집니다. 멀티 제공사 구성(Claude와 Gemini 및/또는 Mistral)에서는 나머지 제공사가 계속 동작하며 브리핑은 실패 대신 `⚠ n/n AI`로 표시됩니다 — 다만 이 배지는 제공사가 2개 이상 설정된 경우에만 나타납니다. Claude만 유일한 제공사라면 배지를 띄울 생존 제공사가 없으므로: 브리핑은 조용히 격차 기반 추천으로 폴백합니다.

### 옵션 2 — API 키 (사용량 기반 과금)

1. [console.anthropic.com](https://console.anthropic.com)으로 이동하여 가입
2. **API Keys** → **Create Key**로 이동하여 이름을 지정하고 키를 복사
3. GitHub Secret으로 추가 — 이름: `ANTHROPIC_API_KEY`, 값: 방금 복사한 키

**가격:** Anthropic은 Gemini와 같은 영구 무료 플랜은 없지만 신규 계정에 소액의 스타터 크레딧이 제공되며, Richfolio 워크로드에서 Sonnet 사용 비용은 일반적으로 하루 몇 센트 수준입니다. 비용을 최소화하려면 `CLAUDE_MODEL=claude-haiku-4-5-20251001`을 설정하세요 (Haiku 계층은 훨씬 저렴하면서도 이 워크로드를 충분히 처리합니다).

---

## Mistral — 선택 사항
{: .text-yellow-200}

Mistral Large (기본값 `mistral-large-latest`)로 AI 매수 추천을 생성합니다.

1. [console.mistral.ai](https://console.mistral.ai)에 접속해 가입
2. **API Keys** → **Create new key**로 이동해 키 복사
3. GitHub Secret으로 추가 — 이름: `MISTRAL_API_KEY`, 값: 방금 복사한 키

**무료 플랜:** Experiment 계층은 영구 무료이며 월 약 10억 토큰을 제공합니다. Richfolio의 워크로드는 월 약 700만 토큰입니다. 크레딧 방식이 아니라 요청 한도 방식이므로, 한도에 부딪히면 과금 오류가 아니라 429가 발생하며 이는 자동으로 재시도됩니다. 여유를 더 확보하고 실행을 빠르게 하려면 `MISTRAL_MODEL=mistral-medium-latest`를 설정하세요 (품질은 약간 낮아집니다).

Mistral이 두 번째 제공사로 적합한 이유는 Gemini와 계보가 다른 독립적인 모델이기 때문입니다. 두 번째 모델은 그 불일치가 모델의 약함이 아니라 데이터를 반영할 때에만 정보를 더합니다.

---

## 멀티 AI 모드

`GEMINI_API_KEY`, Claude (`CLAUDE_CODE_OAUTH_TOKEN` 또는 `ANTHROPIC_API_KEY`), `MISTRAL_API_KEY` 중 둘 이상이 설정되면 Richfolio는 모든 분석에서 해당 제공사들을 동시에 실행하고 결과를 집계합니다:

- **합의 액션** 종목별 다수결로 결정 (신뢰도 합계 기반 동점자 결정)
- **평균 신뢰도**가 눈에 띄게 표시되며 그 아래에 AI별 점수 표시
- **STRONG BUY는 반대 거리로 제한 판단** — 반대하는 제공사가 모두 한 단계 이내이면 (반대가 `BUY`라면 방향은 일치) STRONG BUY가 유지되고, 하나라도 그보다 멀면 (`HOLD`/`WAIT`) BUY로 제한됩니다. `SB + SB + BUY`는 유지, `SB + SB + HOLD`는 제한
- **동의 라벨** (만장일치 / 다수결 / 분열)이 액션 옆에 배지로 표시

집계된 액션은 게이트가 아니라 요약입니다. 각 제공사의 액션과 신뢰도, 근거가 바로 아래에 표시되며, 어느 한 제공사라도 STRONG BUY로 판단한 종목은 제한 여부와 무관하게 상세 분석 페이지, "More Details" 링크, 지정가, 기술적 지표 줄을 모두 그대로 유지합니다. 투표를 보고 판단하는 것은 사용자입니다.

대신 만장일치를 요구하려면 — 어떤 반대라도 STRONG BUY를 BUY로 낮추려면 — `config.json`에 `"ai": { "strongBuyRequiresAllProviders": true }`를 설정하세요.

실행 중 한 제공사가 실패하면 (요청 한도, 할당량 소진, 네트워크 오류), 나머지 제공사가 그 제공사 없이 계속 진행합니다. 이때 해당 실행은 **성능 저하(degraded)** 상태로 표시되어 모든 추천에 이메일에서는 `⚠ 1/2 AI` 형태의 배지가 (Telegram에서는 태그가) 붙습니다. 단일 제공사의 판단이 교차 검증된 것처럼 보여서는 안 되기 때문입니다. 액션 자체는 기본적으로 그대로 둡니다 — 응답하지 않은 제공사는 어떤 거리에서도 반대가 아니기 때문입니다. `strongBuyRequiresAllProviders`를 켠 경우에만 성능 저하 상태의 STRONG BUY도 제한됩니다. 제공사를 하나만 설정한 경우에는 해당되지 않습니다. 그 구성은 애초에 비교를 약속하지 않습니다.

### STRONG BUY 상세 분석 페이지를 생성할 제공사 선택하기

여러 제공사가 활성화된 경우, STRONG BUY별 분석 페이지 ("More Details" 링크)는 단일 제공사로 생성됩니다 — 기본값은 레지스트리 순서상 가장 먼저 사용 가능한 제공사 (Gemini, 그 다음 Claude, 그 다음 Mistral)입니다. 다음으로 재정의할 수 있습니다:

| 환경 변수 | 값 | 효과 |
|---|---|---|
| `AI_DETAILED_PROVIDER` | `gemini` | 상세 분석에 Gemini 강제 사용 (GEMINI_API_KEY 설정 필요) |
| `AI_DETAILED_PROVIDER` | `claude` | 상세 분석에 Claude 강제 사용 (`CLAUDE_CODE_OAUTH_TOKEN` 또는 `ANTHROPIC_API_KEY` 설정 필요) |
| `AI_DETAILED_PROVIDER` | `mistral` | 상세 분석에 Mistral 강제 사용 (MISTRAL_API_KEY 설정 필요) |
| `MISTRAL_MODEL` | `mistral-medium-latest` | 더 저렴하고 빠른 Mistral 모델 (기본값: `mistral-large-latest`) |
| `CLAUDE_MODEL` | 예: `claude-haiku-4-5-20251001` | Claude 모델 재정의 (기본값: `claude-sonnet-4-6`) |

키가 설정되지 않은 제공사 (또는 알 수 없는 이름)를 `AI_DETAILED_PROVIDER`로 지정하면 로그에 남긴 뒤 무시되고 레지스트리 순서로 폴백합니다. API 키 없는 제공사를 고정하면 모든 종목에서 실패하기 때문입니다.

---

## Telegram 봇 — 선택
{: .text-yellow-200}

Telegram 계정으로 압축된 요약을 전달합니다.

### 봇 생성

1. Telegram에서 **@BotFather**를 검색
2. `/newbot` 전송
3. 이름(예: "Richfolio Brief")과 사용자 이름(`bot`으로 끝나야 함, 예: `richfolio_brief_bot`)을 지정
4. BotFather가 봇 토큰으로 응답합니다 — 복사하세요

### chat ID 가져오기

1. Telegram에서 **@userinfobot**을 검색하여 시작
2. 봇이 당신의 숫자 사용자 ID로 응답합니다 — 이것이 chat ID입니다

**중요:** Richfolio를 실행하기 전에 새 봇에게 아무 메시지(예: "hi")를 보내세요 — 봇이 당신에게 메시지를 보내려면 먼저 이 단계가 필요합니다.

둘 다 GitHub Secret으로 추가하세요:

- 이름: `TELEGRAM_BOT_TOKEN`, 값: BotFather가 준 토큰
- 이름: `TELEGRAM_CHAT_ID`, 값: 본인 숫자 사용자 ID

**참고:** 설정되지 않으면 브리핑이 Telegram을 건너뜁니다. 메시지는 압축된 요약입니다 (전체 HTML이 아님). 메시지당 4,096자 제한 — 필요하면 뉴스가 잘립니다.

---

## 소셜 게시 — 선택
{: .text-yellow-200}

Richfolio는 X, Facebook, Threads, LinkedIn의 공개 계정에 일반적인 매수 신호를 게시할 수 있습니다. 모든 플랫폼은 선택 사항이며 설정하기 전까지는 꺼져 있습니다. 플랫폼별 필수 Secret:

- **Facebook:** `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`
- **Threads:** `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` (+ 약 60일 토큰을 자동 갱신하기 위한 선택적 `THREADS_TOKEN_PAT`)
- **LinkedIn:** `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORG_URN`
- **X/Twitter:** `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`

**참고:** 게시물은 일반적입니다 — 보유 종목이나 배분은 공개되지 않습니다. 설정되지 않으면 소셜 게시가 건너뛰어집니다. 각 플랫폼의 단계별 설정은 [소셜 게시](social-setup)를 참고하세요.

---

## 요약

| 키 | 필수 | 서비스 |
|-----|------|--------|
| `RESEND_API_KEY` | 예 | 이메일 전달 |
| `RECIPIENT_EMAIL` | 예 | 본인 이메일 주소 |
| `NEWS_API_KEY` | 아니오 | 뉴스 헤드라인 |
| `GEMINI_API_KEY` | 아니오 | AI 제공사 (Google Gemini) |
| `CLAUDE_CODE_OAUTH_TOKEN` | 아니오 | AI 제공사 (Anthropic Claude, Pro/Max 구독 이용) |
| `ANTHROPIC_API_KEY` | 아니오 | AI 제공사 (Anthropic Claude, 사용량 기반 API 키 이용) |
| `MISTRAL_API_KEY` | 아니오 | AI 제공사 (Mistral — 무료 Experiment 계층) |
| `TELEGRAM_BOT_TOKEN` | 아니오 | Telegram 전달 |
| `TELEGRAM_CHAT_ID` | 아니오 | Telegram 전달 |
| `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` | 아니오 | Facebook 페이지 게시 |
| `THREADS_USER_ID` / `THREADS_ACCESS_TOKEN` | 아니오 | Threads 게시 |
| `THREADS_TOKEN_PAT` | 아니오 | Threads 토큰 자동 갱신 (Secrets 쓰기 권한 PAT) |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` | 아니오 | LinkedIn 페이지 게시 |
| `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_TOKEN_SECRET` | 아니오 | X/Twitter 게시 |
| `CLAUDE_MODEL` | 아니오 | Claude 모델 재정의 (기본값: `claude-sonnet-4-6`) |
| `MISTRAL_MODEL` | 아니오 | Mistral 모델 재정의 (기본값: `mistral-large-latest`) |
| `AI_DETAILED_PROVIDER` | 아니오 | STRONG BUY 분석 페이지에 `gemini`, `claude`, `mistral` 중 하나 강제 사용 |
