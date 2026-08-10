---
title: 문제 해결
layout: default
nav_order: 8
lang: ko
permalink: /troubleshooting.html
---

# 문제 해결

자주 발생하는 문제와 해결 방법입니다.

---

## "Can only send testing emails to your own email address"

**원인:** Resend 무료 플랜의 제약입니다.

**해결:** Resend 가입 시 사용한 이메일과 동일한 주소로 `RECIPIENT_EMAIL`을 설정하거나, Resend에서 사용자 도메인을 인증하세요 (Dashboard → Domains → Add Domain → DNS 레코드 추가).

---

## "GEMINI_API_KEY quota: limit 0"

**원인:** 새로 발급된 Gemini API 키는 활성화에 몇 분이 걸립니다. 일부 키는 결제와 API가 활성화되기 전까지는 동작하지 않을 수 있습니다.

**해결:** 다음 단계를 순서대로 시도하세요:

1. **5–10분 기다리기** — 새 키는 활성화에 시간이 필요한 경우가 있습니다
2. **Generative Language API 활성화하기** — [Google Cloud Console](https://console.cloud.google.com/apis/library)로 이동 → "Generative Language API" 검색 → API 키가 연결된 프로젝트에서 **Enable** 클릭
3. **결제 정보 추가하기** — [Google AI Studio](https://aistudio.google.com)로 이동 → Settings → Billing에 결제 정보를 추가하세요. 여전히 **무료 플랜**을 선택할 수 있습니다 — 결제 정보를 추가하는 것은 키를 활성화하기 위함이며, 무료 한도를 초과하지 않는 한 요금이 청구되지 않습니다

그동안 Richfolio는 자동으로 격차 기반 추천으로 폴백합니다 — 브리핑은 여전히 전달되지만 AI 분석만 빠집니다. Claude (`CLAUDE_CODE_OAUTH_TOKEN` 또는 `ANTHROPIC_API_KEY`)나 `MISTRAL_API_KEY`도 설정되어 있다면 Gemini가 복구되는 동안 해당 제공사가 단독으로 계속 동작합니다 — 그 실행은 성능 저하 상태로 표시되어 (`⚠ 1/2 AI` 배지) 단일 제공사의 판단이 교차 검증된 것처럼 보이지 않게 됩니다.

---

## 브리핑에서 Claude가 조용히 빠지는 문제

**원인:** 만료되었거나 없는 `CLAUDE_CODE_OAUTH_TOKEN`은 `ANTHROPIC_API_KEY`가 없을 때와 정확히 동일한 증상을 만듭니다 — Claude가 그냥 없는 것처럼 보입니다. Claude 단독 구성에서는 브리핑이 조용히 격차 기반 추천으로 폴백하며, 멀티 AI 모드에서는 나머지 제공사(들)가 계속 동작하고 해당 실행은 성능 저하 상태로 표시됩니다 (`⚠ 1/2 AI` 배지). 눈에 띄는 오류는 나지 않으므로 — GitHub Actions 실행 로그에서 Claude 제공사의 인증 실패를 확인하세요.

**해결:** 구독 토큰은 자동 갱신 없이 약 1년간 유효합니다. 로컬에서 `claude setup-token`을 다시 실행해 새로 발급받고 `CLAUDE_CODE_OAUTH_TOKEN` Secret을 업데이트하세요. 대신 사용량 기반 과금을 쓰고 싶다면 `ANTHROPIC_API_KEY`를 설정하고 `CLAUDE_CODE_OAUTH_TOKEN`은 비워 두세요.

---

## 특정 티커에 "fetch failed — internal-error"

**원인:** Yahoo Finance가 특정 티커(특히 BIPC 같은 덜 일반적인 종목)에서 가끔 문제를 일으킵니다.

**해결:** 별도의 조치가 필요 없습니다. 해당 티커는 건너뛰어지고 나머지는 정상적으로 진행됩니다. 이는 간헐적인 Yahoo Finance 이슈입니다.

---

## GitHub Actions에 Secret이 비어 보임

**원인:** Secret을 잘못된 레벨에 추가했습니다.

**해결:** Secret이 **저장소** 레벨에 추가되었는지 확인하세요: Settings → Secrets and variables → Actions → Repository secrets. 환경 레벨이 아닙니다.

---

## 뉴스가 반환되지 않음

**원인:** NewsAPI 무료 플랜은 최근 24시간 기사만 반환합니다. 일부 티커(특히 ETF와 소형주)는 뉴스 헤드라인에 거의 등장하지 않습니다.

**해결:** 이것은 정상 동작입니다. 해당 티커에 대해서는 뉴스 없이 브리핑이 정상적으로 실행됩니다. AI 분석은 추천에서 "최근 뉴스 없음"이라고 명시합니다.

---

## Telegram 메시지가 수신되지 않음

**원인:** 본인이 봇과 아직 대화를 시작하지 않았습니다.

**해결:** Telegram을 열고 사용자 이름으로 봇을 찾은 다음 아무 메시지(예: "hi")를 보내세요. Telegram Bot API는 봇이 메시지를 보내기 전에 사용자가 먼저 연락하도록 요구합니다. 그 다음 Richfolio를 다시 실행하세요.

---

## "Missing config.json" 오류

**원인:** 프로젝트 루트에 `config.json`이 존재하지 않습니다.

**해결:**
- **GitHub Actions:** `CONFIG_JSON` 변수가 유효한 JSON 내용으로 존재하는지 확인하세요 (Settings → Secrets and variables → Actions → **Variables** 탭).
- **로컬:** `cp config.example.json config.json`을 실행하고 포트폴리오 데이터로 편집하세요.

---

## 브리핑은 실행되지만 이메일이 비어 있거나 일부 섹션이 누락

**원인:** 하나 이상의 API 키가 누락되었거나 유효하지 않습니다.

**해결:** `.env` 파일(로컬) 또는 GitHub Secret(Actions)을 확인하세요. 브리핑은 사용 가능한 키에 따라 적응합니다:
- `NEWS_API_KEY` 없음 → 뉴스 섹션 없음
- `GEMINI_API_KEY`, Claude (`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY`), `MISTRAL_API_KEY` 모두 없음 → AI 대신 격차 기반 추천
- AI 키 중 하나만 있음 → 단일 AI 모드 (현재 동작)
- AI 키가 둘 이상 있음 → 멀티 AI 모드: 점수 평균화, 각 추천 아래에 AI별 분석 표시, STRONG BUY는 반대 거리로 제한 판단 (반대가 BUY면 유지, HOLD/WAIT이면 BUY로 제한)
- `TELEGRAM_BOT_TOKEN` 없음 → 이메일만 (Telegram 없음)

모든 조합이 유효합니다 — 오직 `RESEND_API_KEY`와 `RECIPIENT_EMAIL`만 필수입니다.
