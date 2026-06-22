# URL Scan 대시보드 — 변경 히스토리 & 다음 단계

## 완료된 변경사항 (T0 → T4+P2)

### 백엔드: DAST 최적화 (T0→T4)

| 항목 | T0 (Baseline) | T4 (현재) |
|------|--------------|-----------|
| HTTP 템플릿 | 9,495개 (전체) | 1,568개 (exposures + misconfiguration) |
| 메모리/스캔 | ~3.5GB | ~800MB |
| 동시 스캔 (4GB) | ~1-2개 | ~4개 |
| 비용/스캔 | ~$0.022 | ~$0.008 (64% 절감) |
| Clean site 시간 | 150초 | 47초 |
| DAST Phase | 단일 | Phase 1 (SQLi/XSS 60%) + Phase 2 (LFI/CMDI/etc 40%) |
| POST fuzzing | 없음 | Katana로 POST body → query params 변환 |
| 점수 체계 | medium 5, high 15, critical 25 | medium 10, high 20, critical 30 + info override |
| Timeout | Frontend 600s / Cloud Run 900s | Frontend 900s / Cloud Run 1200s |

핵심 파일: `backend/app/services/nuclei_scanner.py`

### 프론트엔드: P2 (Security Headers + SSL + UI 정리)

| 항목 | Before | After |
|------|--------|-------|
| Security Headers 체크 | 없음 | Next.js API route로 실시간 7개 헤더 체크 |
| SSL 인증서 | 없음 | "HTTPS OK" / "No HTTPS" 한줄 표시 |
| Benchmark 히스토그램 | 대시보드 중간 큰 차트 | 삭제 (percentile만 ScoreCard에 "Better than X%") |
| Badge 섹션 | 중앙 정렬 큰 카드 | 가로 바 (MCP/Schedule과 동일 패턴) |
| Schedule 섹션 (빈 상태) | 큰 패널 | 가로 바 (MCP/Badge와 동일 패턴) |
| Headers 라벨 | 없음 | "Security Headers — 0 of 7 configured" |

핵심 파일:
- `app/api/security-check/route.ts` — 헤더 + SSL 체크 API
- `components/trust/dashboard/SecurityChecklist.tsx` — 헤더/SSL UI
- `components/trust/dashboard/ScoreCard.tsx` — percentile 통합
- `components/trust/dashboard/BadgeSection.tsx` — 가로 바 레이아웃
- `components/trust/dashboard/ScheduleSection.tsx` — 가로 바 레이아웃
- `components/trust/dashboard-view.tsx` — 전체 레이아웃 조율

### 측정 결과

| 사이트 | T0 | T4+P2 (현재) |
|--------|-----|-------------|
| demo.testfire.net | 74/B, 4v, 150s | 71/B, 5v, ~298s (DAST 포함) |
| trust-scan.me | -, -, ~150s | 97/A, 1v, 47s |
| 시각적 항목 | ~12개 | ~20개 |
| 비용/스캔 | $0.022 | $0.008 + $0.0001 (프론트엔드) |

---

## 완료된 변경사항 (P3 — 2026-04-13)

### 1. 서버 증축 — Cloud Run 설정 최적화 ✅

**결정**: Cloud Run 유지 (맥미니 불채택)
- 맥미니: 초기 $600 + ops 부담, 동시 ~20개 한계, GTM에서 비현실적
- Cloud Run: 자동 확장, 유휴 $0, ops-free

**수정된 설정** (`deploy-backend.yml`):
- `--max-instances 25` 추가 (비용 폭주 방지, 100명 동시 커버)
- `--concurrency 4` 추가 (인스턴스당 4 요청, OOM 방지)
- `min-instances`는 미설정 (고정비 $0 유지)

### 2. 결제 연동 — 코드 완성 확인 ✅

**결과**: 코드 변경 없음 — 이미 100% 완성돼 있었음
- Backend: `billing.py` (checkout), `billing_webhook.py` (activated/updated/canceled)
- Frontend: `UpgradeModal.tsx` (12곳 트리거), `/pricing` 페이지, `CheckoutHandler` (성공 토스트)
- Paddle Dashboard 설정만 남아있었음 → 완료 (webhook URL 등록, sandbox 테스트)

### 3. 리포트 상단 UI — Score Breakdown 제거 + Server Protection 개선 ✅

| 항목 | Before | After |
|------|--------|-------|
| Score Breakdown 섹션 | "100 − 29 = 71" 산식 + Tier 칩 + 감점 수치 | **삭제** (취약점 목록과 중복) |
| Security Headers 제목 | "Security Headers — 0 of 7 configured" (text-sm) | **수정**: "Server Protection — 0 of 7 active" (text-xl, Detected Vulnerabilities와 동일 크기) |
| Headers 라벨 | "configured" | **수정**: "active" |
| 헤더 상세 | 없음 | **신규**: 클릭 시 접이식 상세 (summary + detail 설명) |
| 헤더 설명 텍스트 | 없음 | **신규**: 7개 헤더 각각 plain-English 설명 (text-foreground/60) |
| How to Fix | 없음 | **신규**: 미설정 헤더에 fix 가이드 + 복사 가능한 코드 스니펫 |
| 로딩 텍스트 | "Checking security configuration..." | **수정**: "Checking server protection..." |

핵심 파일:
- `components/trust/dashboard/SecurityChecklist.tsx` — 전면 개편
- `components/trust/dashboard/ScoreBreakdown.tsx` — dashboard-view에서 제거 (파일은 잔존)

### 4. 리포트 하단 UI — 취약점 목록 + CTA 영역 ✅

| 항목 | Before | After |
|------|--------|-------|
| Search 인풋 | 있음 (취약점 5개에 과잉) | **삭제** |
| 섹션 제목 | "Detected Vulnerabilities (5)" (text-xl) | **수정**: "Vulnerabilities" (text-2xl font-bold) + 빨간 숫자 뱃지 |
| 섹션 구분 | Server Protection과 구분 없음 | **신규**: `border-t` 구분선 추가 |
| Free AI 카운터 | 별도 glass 배너 (text-sm text-muted) | **수정**: 타이틀 옆 "2/2 free" 플레인 텍스트 (cyan) |
| 업그레이드 배너 | 항상 표시 | **수정**: 무료 분석 소진 시에만 Go Pro 배너 표시 |
| Sign in gate | 블러 카드 + 큰 cyan 버튼 (어색) | **수정**: 블러 카드 유지 + "+2 more vulnerabilities" 빨간 볼드 + "Sign in free to see all" + 무료 가치 명시 |
| 하단 CTA 3개 | MCP/Badge/Schedule 각각 독립 | **수정**: "Next Steps" 섹션 제목 아래 하나의 그룹으로 묶음 |

핵심 파일:
- `components/trust/dashboard/FilterBar.tsx` — Search 제거
- `components/trust/dashboard/VulnerabilityList.tsx` — SignInGate 개선
- `components/trust/dashboard-view.tsx` — 타이틀/카운터/섹션 구조 변경

---

## 다음 단계

### Fix CTA 재설계 — 정책 확정 후 구현 대기

**현재 상태**: 롤백됨. 재구현 시 정책 필요:
- Free 유저: 무료 2회 분석 소진 → 그 다음부터 업그레이드 모달
- Pro 유저: 바로 AI 분석
- "Get AI Insights" (일괄)와 개별 "Fix"의 관계 정리

**관련 파일**:
- `components/trust/dashboard/VulnerabilityList.tsx`
- `components/trust/dashboard-view.tsx`

---

## 롤백된 항목 (재구현 시 주의)

| 항목 | 커밋 | 롤백 이유 |
|------|------|-----------|
| 취약점별 Fix CTA | `eca0ba5` | Free/Pro 정책 미확정. Free 2회 무시하고 무조건 업그레이드로 보냄 |
| Get AI Insights 삭제 | `47f7e30` | 일괄 분석 기능까지 삭제됨. 개별 Fix와 역할 분리 필요 |
| Search 인풋 삭제 | `47f7e30` | 함께 롤백됨 → **P3에서 재삭제 완료** (`cdf81e8`) |
