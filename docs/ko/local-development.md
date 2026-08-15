---
title: 로컬 개발
layout: default
nav_order: 9
lang: ko
permalink: /local-development.html
---

# 로컬 개발

코드를 커스터마이징하거나, 수정 사항을 테스트하거나, 수동으로 실행을 트리거하고 싶은 고급 사용자를 위한 가이드입니다. 대부분의 사용자에게는 이 단계가 필요하지 않습니다 — GitHub Actions가 모든 것을 자동으로 처리합니다.

---

## 요구 사항

- **Node.js 22+** — [다운로드](https://nodejs.org/)
- **npm** — Node.js에 함께 포함

---

## 설치

```bash
git clone https://github.com/YOUR_USERNAME/richfolio.git
cd richfolio
npm install
```

---

## 설정

### 포트폴리오 (`config.json`)

```bash
cp config.example.json config.json
```

`config.json`을 편집하여 목표 배분과 현재 보유 종목을 입력하세요. 전체 필드 참고는 [설정](configuration)을 보세요.

### API 키 (`.env`)

```bash
cp .env.example .env
```

API 키를 입력하세요. 최소한 `RESEND_API_KEY`와 `RECIPIENT_EMAIL`이 필요합니다. 각 서비스의 단계별 지침은 [API 키](api-keys)를 참고하세요.

---

## 실행

```bash
# Daily brief — prices + news + AI analysis + email + Telegram
npm run dev

# Intraday alert check — compares vs morning baseline
npm run intraday

# Weekly rebalancing report — prices + allocation drift + email + Telegram
npm run weekly

# Re-analyze single ticker with after-hours price
npm run refresh -- SMH

# 암호화폐 교차 페어 점검 (CRO→BTC/ETH 교환 신호)
npm run crypto

# Type-check without emitting
npx tsc --noEmit
```

결과는 이메일과 Telegram에서 확인하세요.
