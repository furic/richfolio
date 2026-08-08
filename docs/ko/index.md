---
title: 홈
layout: home
nav_order: 1
lang: ko
permalink: /
---

# Richfolio

유지보수가 필요 없는 포트폴리오 모니터링 시스템입니다. 목표 자산 배분을 한 번 설정해 두면, 매일 포트폴리오의 배분 격차, AI 기반 매수 신호, 관련 뉴스를 담은 브리핑을 받아볼 수 있습니다 — 이메일과 Telegram으로 자동 전달되며, 모든 작업은 GitHub Actions에서 실행됩니다.

**모든 것이 무료 플랜 위에서 동작합니다. 서버도, 대시보드도, 지속적인 비용도 없습니다.**

---

## 무엇을 받게 되나요

매일 아침 Richfolio는 실시간 시장 데이터를 가져와 자산 배분 분석을 실행하고, AI 매수 추천을 생성한 뒤, 정돈된 보고서를 메일함과 Telegram으로 전달합니다.

![Daily Brief](../screenshots/morning-debrief.png){: style="max-width: 400px; display: block; margin: 16px auto;" }

| 구성 요소 | 서비스 | 비용 |
|-----------|--------|------|
| 가격 및 펀더멘털 | Yahoo Finance | 무료 |
| 뉴스 | NewsAPI.org | 무료 (1일 100건) |
| AI 분석 | Google Gemini 2.5 Flash | 무료 (1일 약 20건) |
| 이메일 | Resend.com | 무료 (월 3,000건) |
| Telegram | Telegram Bot API | 무료 |
| 스케줄러 | GitHub Actions | 무료 (cron) |

---

## 누구에게 적합한가요

Richfolio는 **종목을 대신 골라주지 않습니다**. 본인이 신뢰하는 주식, ETF, 또는 암호화폐로 구성된 포트폴리오를 이미 가지고 있어야 합니다.

Richfolio가 하는 일은 **매일 당신의 포트폴리오를 모니터링**하면서 **언제** 매수할지를 돕는 것입니다 — 가격, 기술적 지표, 뉴스 감성, 배분 격차를 추적하고, AI를 활용해 가장 좋은 진입 타이밍을 부각시킵니다.

- **포트폴리오는 당신이 가져옵니다** — 간단한 JSON 설정에 목표 배분을 한 번만 정의하세요
- **신호는 Richfolio가 제공합니다** — 매수 추천, 지정가 가격, 상세 분석
- **최종 결정은 당신의 몫입니다** — 모든 매수 결정은 당신의 것이며, 도구는 제안만 합니다

**코딩이 필요 없습니다.** 저장소를 fork하고, 약 10분 정도 무료 API 계정을 등록한 뒤, 키를 GitHub Settings에 붙여 넣으면 끝입니다. 모든 것이 GitHub Actions를 통해 월 $0 비용으로 자동 실행됩니다.

---

## 문서

| 페이지 | 설명 |
|--------|------|
| [기능](features) | Richfolio의 기능 — 10가지 능력을 자세히 설명 |
| [시작하기](getting-started) | Fork, 설정, 배포까지 4단계 |
| [설정](configuration) | `CONFIG_JSON` 필드 참고, 티커 형식, 팁 |
| [API 키](api-keys) | Resend, NewsAPI, Gemini, Telegram 단계별 설정 |
| [배포](deployment) | GitHub Actions, Secret, 스케줄 커스터마이징 |
| [작동 방식](how-it-works) | 아키텍처, 데이터 파이프라인, 분석 로직 |
| [로컬 개발](local-development) | 고급 사용자 — 커스터마이징이나 수동 트리거를 위한 로컬 실행 |
| [문제 해결](troubleshooting) | 자주 발생하는 오류와 해결 방법 |
| [참고 자료](references) | 디자인에 영향을 준 선행 작업들 |
