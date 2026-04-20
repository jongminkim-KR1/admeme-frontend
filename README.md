# Admeme Frontend — Next.js

> 밈 기반 광고 영상 자동 생성 플랫폼(**Admeme**) 의 프론트엔드 웹 애플리케이션.
> 영상 생성 요청 · 단계별 검수(캐릭터/음성/시나리오/영상) · 사용 현황 대시보드를 제공합니다.
> SK Networks Family AI Camp 19기 Final 4팀 · 팀 프로젝트

---

## 📋 레포지토리 안내

이 레포는 팀 프로젝트의 **포트폴리오용 개인 사본**입니다.
- 원본은 팀 Organization([SKN19-Final-4team](https://github.com/SKN19-Final-4team))에 비공개로 보관되어 있습니다
- 프로젝트 전체 소개와 시스템 아키텍처는 **[`admeme` 메인 레포](https://github.com/jongminkim-KR1/admeme)** 를 참고해주세요
- 본인(김종민)의 주된 기여 영역은 **AI 파이프라인**이며, Frontend는 팀원 주도로 개발되었습니다. 단 AI 생성 플로우 UX 일부(폴링 타임아웃, 에러 상태 분리, 4단계 Step Indicator, `pending_approval` 상태 매핑 수정)는 본인이 담당했습니다

---

## 🔗 관련 레포
- [admeme](https://github.com/jongminkim-KR1/admeme) — 전체 시스템 monorepo (권장 시작점)
- [admeme-ai](https://github.com/jongminkim-KR1/admeme-ai) — AI 파이프라인 상세 ⭐
- [admeme-backend](https://github.com/jongminkim-KR1/admeme-backend) — FastAPI 백엔드

---

## 🛠️ 기술 스택

- **Framework**: Next.js 14 (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Deploy**: Vercel (자동 CI/CD via GitHub Webhook)

## 🚀 실행

```bash
npm install
cp .env.example .env.local   # API 엔드포인트 설정
npm run dev
```

## 📂 주요 화면

- **로그인 · 회원가입** — JWT 기반 인증
- **영상 제작 요청** — 브랜드 · 상품 · 타깃 · 밈 선택
- **단계별 검수** — 캐릭터 → 음성 → 시나리오 → 영상 4단계 Step Indicator
- **마이 비디오** — 생성 히스토리 · 상태 · 성과 대시보드
- **관리자 페이지** — 밈 DB 관리 · 검수 통계
