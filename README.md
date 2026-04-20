# Admeme Frontend — Next.js

> 밈 기반 광고 영상 자동 생성 플랫폼(**Admeme**) 의 프론트엔드 웹 애플리케이션.
> 영상 생성 요청 · 단계별 검수(캐릭터/음성/시나리오/영상) · 사용 현황 대시보드를 제공합니다.
> SK Networks Family AI Camp 19기 Final 4팀 · 팀 프로젝트

---

## 📋 레포지토리 안내

이 레포는 팀 프로젝트의 **포트폴리오용 개인 사본**입니다.
- 원본은 팀 Organization([SKN19-Final-4team](https://github.com/SKN19-Final-4team))에 비공개로 보관되어 있습니다
- 프로젝트 전체 소개와 시스템 아키텍처는 **[`admeme` 메인 레포](https://github.com/jongminkim-KR1/admeme)** 를 참고해주세요
- 본인(김종민)은 AI/Backend 중심으로 담당했으나, **AI 생성 플로우 UX · 에러 상태 처리 · 상태 매핑 디버깅** 등 프론트 영역에도 직접 관여했습니다 ([기여 섹션](#-본인-기여-영역-김종민) 참조)

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

---

## 🛠️ Frontend가 해결한 문제 (본인 관여 부분)

### ① 장시간 AI 생성 = 무한 로딩 문제

**문제**
영상 생성이 30초~3분 걸리는데, 처음에는 프론트가 단순히 `isLoading` 플래그만 표시. 사용자는 5분, 10분 대기해도 결과가 안 나오면 브라우저 탭을 닫아버렸고, 이미 DB에는 영상이 생성됐지만 사용자는 다시 처음부터 시도. 디버깅 로그 확인해보니 **동일 사용자가 같은 광고를 3~4번 재요청**하는 패턴이 반복됐습니다.

**해결**
1. **폴링 기반 상태 추적** — Backend의 `GET /{ad_id}/status` 를 3초 간격으로 폴링
2. **5분 타임아웃** — 그 이상 걸리면 "예상보다 오래 걸려요" 에러 상태로 전환
3. **재시도 버튼** — 에러 상태에서 재시도 가능
4. **4단계 Step Indicator** — 캐릭터 → 음성 → 시나리오 → 영상 진행 상황을 시각화

```tsx
// frontend/src/app/.../page.tsx
useEffect(() => {
  const startedAt = Date.now();
  const interval = setInterval(async () => {
    if (Date.now() - startedAt > 5 * 60 * 1000) {
      setError({ type: 'timeout', message: '생성이 예상보다 오래 걸려요' });
      clearInterval(interval);
      return;
    }
    const { status, current_stage, progress } = await fetchStatus(adId);
    setCurrentStage(current_stage);
    if (status === 'completed') { /* ... */ }
    if (status === 'failed') { /* ... */ }
  }, 3000);
  return () => clearInterval(interval);
}, [adId]);
```

### ② 에러 UI 일원화 (빈 상태 / 404 / 서버 에러 분리)

**문제**
초기에는 API가 실패하면 전부 "Error occurred"로만 표시. 사용자는 "내가 잘못했나" / "서버 문제인가" / "페이지가 없는 건가" 구분이 안 됐고, 지원 요청이 모호해서 디버깅에 시간 소모.

**해결**
에러를 3가지로 분리하고 각각 다른 UI와 액션 버튼 제공:

| 종류 | UI 메시지 | 액션 버튼 |
|---|---|---|
| **빈 상태** | "아직 생성된 영상이 없어요" | "새로 만들기" |
| **404** | "영상을 찾을 수 없어요" | "목록으로" |
| **서버 에러** | "일시적 오류. 잠시 후 다시 시도해주세요" | "다시 시도" + 에러 리포트 |

### ③ 에러 체인 단계 추적 — 어디서 실패했는지 알려주기

**문제**
자산 승인 시 `handleApproveAssets()` 함수가 여러 API를 순차 호출(`POST /approve-assets → POST /generate-scenario → POST /poll-status`). 중간 API가 실패했을 때 사용자에게 "어디서 실패했는지" 알려주지 않으면, 백엔드 로그 없이는 원인 파악 불가.

**해결**
```ts
const handleApproveAssets = async () => {
  let currentStep: 'approve' | 'scenario' | 'poll' = 'approve';
  try {
    await approveAssets(adId);
    currentStep = 'scenario';
    await generateScenario(adId);
    currentStep = 'poll';
    await pollStatus(adId);
  } catch (e) {
    showError({
      step: currentStep,
      message: `${STEP_LABELS[currentStep]} 단계에서 실패했습니다`,
      detail: e.message,
    });
  }
};
```

### ④ 상태 매핑 버그 수정 — `pending_approval` 기본값 오류

**문제**
목록 페이지(`/my-videos`)에서는 광고가 "시나리오 검수 대기"로 표시되는데, 클릭하면 상세 페이지는 "캐릭터 검수 대기"로 나오는 불일치. 사용자가 혼란스러워해서 문의가 빗발침.

**원인 분석**
- `transformWorkflowToVideo()` 함수에서 백엔드의 `current_stage`가 NULL일 때 **기본값이 `'scenario_review'`** 로 하드코딩되어 있었음
- 하지만 실제 워크플로우는 캐릭터 → 음성 → 시나리오 → 영상 순이므로, `pending_approval` 첫 진입 시점의 기본값은 **캐릭터 검수**가 맞음

**해결**
```ts
// frontend/src/lib/api/video.ts (line 34)
- 'pending_approval': 'scenario_review'
+ 'pending_approval': 'character_review'
```
실제 `current_stage` 값이 있으면 그걸로 override, NULL일 때만 기본값 사용 (lines 47–52).

**배운 점**
상태 머신은 한쪽에서만 관리해야 함. Backend가 진실의 원천이면 Frontend는 기본값을 **실제 워크플로우 순서대로** 두거나, 아예 "알 수 없음" 상태로 두는 게 안전.

---

## 👤 본인 기여 영역 (김종민)

프론트엔드는 팀원 주도로 개발되었으며, 본인은 **AI 생성 플로우와 맞닿는 UX**를 주로 담당했습니다.

1. **폴링 + 타임아웃 UX** — 5분 타임아웃 · 재시도 버튼 · 3초 간격 폴링 로직
2. **4단계 Step Indicator** — 캐릭터 → 음성 → 시나리오 → 영상 시각화
3. **에러 상태 분리** — 빈/404/서버 에러 UI 각각 다른 메시지와 액션
4. **에러 체인 추적** — `currentStep` 변수로 실패 단계 추적하여 사용자에게 명확히 전달
5. **상태 매핑 버그 수정** — `transformWorkflowToVideo()` 의 `pending_approval` 기본값을 `scenario_review` → `character_review` 로 교체
6. **백엔드 계약 반영** — `AdRequestStatus` / `VideoStatus` / `ScenarioApprovalStatus` Enum 값 변경에 맞춰 `video.ts` 매핑 테이블 갱신
