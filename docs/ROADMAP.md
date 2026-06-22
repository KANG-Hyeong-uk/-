# Trust Security - Growth Roadmap

## V1.0 - Hackathon Complete (2026.02.23)
해커톤 완성 버전. 핵심 기능 모두 작동하나 사업적 성장 장치 부족.
- `git tag v1.0`

---

## V1.1 - Global Ready ✅
**작업**: SYSTEM_PROMPT 한국어 → 영어 전환 (글로벌 대응)
**파일**: `backend/app/services/claude_analyzer.py`
**커밋**: `V1.1: Global Ready - AI analysis i18n (Korean → English)`
**기대효과**: 글로벌 유저 사용 가능. 한국어 고정 → 영어 기본으로 해외 시장 진출 장벽 제거

## V1.2 - Landing Clarity ✅
**작업**: 서브헤드라인 추가 + CTA "Scan Now" → "Start Free Scan"
**파일**: `components/trust/landing-view.tsx`
**커밋**: `V1.2: Landing Clarity - add subheadline + improve CTA`
**기대효과**: 첫 방문자 이탈율 20-30% 감소. 3초 내 서비스 이해

## V1.3 - Badge Viral Engine ✅
**작업**: Badge Markdown/HTML 원클릭 복사 버튼 추가
**파일**: `components/trust/dashboard/BadgeSection.tsx`
**커밋**: `V1.3: Badge Viral Engine - add markdown/HTML one-click copy`
**기대효과**: GitHub README 삽입율 10x 증가 → 뱃지당 월 50-200 노출 → 오가닉 유입

## V1.4 - Share Nudge ✅
**작업**: A등급 달성 시 축하 모달 + X/LinkedIn 공유 CTA
**파일**: `components/trust/dashboard-view.tsx`
**커밋**: `V1.4: Share Nudge - A-grade celebration modal + social sharing`
**기대효과**: SNS 공유 전환율 3-5x 증가. 감정 고조 순간 캡처 → OG 이미지 바이럴

## V1.5 - SEO Foundation ✅
**작업**: JSON-LD 스키마 (SoftwareApplication, FAQPage) + sitemap 확장
**파일**: `app/layout.tsx`, `app/sitemap.ts`, `app/pricing/page.tsx`
**커밋**: `V1.5: SEO Foundation - JSON-LD schemas + expanded sitemap`
**기대효과**: 구글 리치 스니펫 노출, SEO 유입 채널 개통

## V1.6 - Conversion Boost ✅
**작업**: Free 유저 AI 분석 2개 무료 제공 + 소프트 페이월 배너
**파일**: `components/trust/dashboard-view.tsx`
**커밋**: `V1.6: Conversion Boost - free AI analysis preview (2 free)`
**기대효과**: Free→Pro 전환율 2-3x 증가. 핵심 가치 체험 후 업그레이드 유도

---

## Commit History

```
v1.0    V1.0: Trust Security - Hackathon Complete
aacfa6e V1.1: Global Ready - AI analysis i18n (Korean → English)
2d42c17 V1.2: Landing Clarity - add subheadline + improve CTA
4df1dcf V1.3: Badge Viral Engine - add markdown/HTML one-click copy
73fd670 V1.4: Share Nudge - A-grade celebration modal + social sharing
41bc523 V1.5: SEO Foundation - JSON-LD schemas + expanded sitemap
93690fd V1.6: Conversion Boost - free AI analysis preview (2 free)
f938f89 V1.7: i18n Hardening - enforce English AI responses + cache invalidation
```

## V1.7 - i18n Hardening ✅
**작업**: AI 분석 프롬프트에 영어 강제 지시 추가 + 캐시 버전 관리로 기존 한국어 캐시 무효화 + 테스트 fixture 영어 전환
**파일**: `backend/app/services/claude_analyzer.py`, `backend/tests/test_claude_analyzer.py`, `backend/tests/conftest.py`
**커밋**: `V1.7: i18n Hardening - enforce English AI responses + cache invalidation`
**기대효과**: AI 분석 결과가 100% 영어로 출력. 글로벌 유저 경험 일관성 확보. 기존 한국어 캐시 자동 무효화

## V1.8 - Smart Fallback Analysis ✅
**작업**: Claude API 장애/크레딧 소진 시에도 취약점별 맞춤 Before/After 코드 예시 제공하는 지능형 폴백 시스템 구축
**파일**: `backend/app/services/claude_analyzer.py`, `backend/tests/test_claude_analyzer.py`
**커밋**: `V1.8: Smart Fallback - template-specific analysis when API unavailable`
**기대효과**: API 크레딧 없이도 SQLi, XSS, CORS, 헤더 누락 등 주요 취약점에 실제 코드 예시 제공. 유저 경험 단절 방지

## V1.9 - UX Polish ✅
**작업**: fix_steps 표시 조건 완화, 무료 분석 카운터 새로고침 우회 방지, 드롭다운 외부 클릭 닫기, 배지 섹션 score≥70으로 확대, 접근성(aria-label), 한글 주석 정리
**파일**: `VulnerabilityList.tsx`, `dashboard-view.tsx`, `ExportPanel.tsx`, `BadgeSection.tsx`, `UpgradeModal.tsx`, `subscription.ts`, `claude_analyzer.py`
**커밋**: `V1.9: UX Polish - fix_steps display, dropdown close, badge threshold`
**기대효과**: UX 완성도 향상. 무료 분석 우회 차단. 배지 노출 확대로 바이럴 기회 증가

## V2.0 - MCP Server Overhaul ✅
**작업**: MCP 서버 전면 고도화 — Repo 스캔 지원, 패턴 확장, 아키텍처 개선, 가이드 개편
**파일**: `mcp-server/server.py`, `components/trust/mcp-view.tsx`, `.github/workflows/deploy-mcp.yml`
**주요 변경**:
- 신규 도구 3종: `scan_repo_and_wait`, `scan_repo`, `get_repo_scan_result` (GitHub 리포 스캔 MCP 지원)
- Secret 패턴 12개 → 20개 (AWS, Supabase, Twilio, Mailgun, JWT, DB URL 등 추가)
- SAST 패턴 4개 → 17개 (command injection, path traversal, pickle/yaml deserialization, weak crypto 등)
- httpx 싱글턴 커넥션 풀 적용 (매 요청마다 새 클라이언트 생성 → 재사용)
- Cloud Run timeout 60s → 600s, memory 256Mi → 512Mi (scan_and_wait 안정성 확보)
- `get_fix_suggestion` 제거 (AI 분석으로 완전 대체)
- 출력 포맷 개선 (IDE/CLI 환경에서 깔끔한 구조적 리포트)
- MCP 가이드 페이지 개편 (카테고리별 도구 분류, v2.0 배지, 8 tools 안내)
**기대효과**: MCP 기반 보안 스캐닝 퍼스트무버 포지셔닝. URL+Repo 양축 스캔 지원으로 AI IDE 생태계 완전 커버

## V2.1 - Repo Scan V2 ✅
**작업**: Repo 스캔 고도화 — 중복 제거, 가중 점수, AI 분석 (before/after 코드), 스코어 브레이크다운
**파일**: `backend/app/api/routes/repo_scan.py`, `backend/app/services/`, `components/trust/dashboard-view.tsx`
**주요 변경**:
- Semgrep + Gitleaks + npm audit 통합 스캔
- 취약점별 AI 분석: 근본 원인 + before_code / after_code / fix_steps
- 가중 점수 시스템 (Critical: -15, High: -10, Medium: -5, Low: -2)
- Score Breakdown UI (Secrets, SAST, SCA 카테고리별)
**기대효과**: 리포 스캔의 실질적 가치 제공. AI 수정 코드로 개발자 액션 유도

## V2.2 - Auto-Fix PR ✅
**작업**: AI 분석된 취약점을 원클릭으로 GitHub Fix PR 생성
**파일**: `backend/app/api/routes/github.py`, `backend/app/services/github_service.py`, `components/trust/dashboard/CreateFixPRModal.tsx`
**주요 변경**:
- GitHub OAuth 연동 (repo scope)
- Fix PR 모달: AI 분석 → GitHub 연결 확인 → PR 생성 플로우
- 스마트 코드 매칭: exact → whitespace-normalized → line-based
- package.json 버전 업데이트 (semver prefix 보존)
- Pro-only 기능 게이팅
**기대효과**: 취약점 발견 → 수정까지 원스톱. 개발자 워크플로우에 완벽 통합

## V2.3 - Report Share & Auto-Detect ✅
**작업**: 리포트 URL 공유 시 scan type 자동 감지 + Share URL에 type=repo 포함
**파일**: `app/report/[scanId]/report-client.tsx`, `components/trust/dashboard-view.tsx`
**기대효과**: 공유 URL 새로고침 시 "Report Not Found" 문제 해결

---

## V2.6 - Server-side Scan History ✅
**작업**: 서버 사이드 스캔 히스토리 저장/조회 + 기본 이메일 알림
**주요 변경**:
- `GET /api/scans/history` 엔드포인트 (user_id 기반 필터링)
- 프론트 히스토리 페이지 (트렌드 차트 + 테이블 뷰)
- Resend API 기반 개별 스캔 이메일 알림
- Slack incoming webhook 알림
**참고**: 주간 다이제스트 집계 및 사용자 알림 설정 UI는 V2.11에서 완성

## V2.7 - GitHub Action for CI/CD ✅
**작업**: CI/CD 파이프라인에서 자동 보안 스캔을 위한 GitHub Action 구현
**파일**: `.github/actions/trust-scan/action.yml`
**주요 변경**:
- Composite GitHub Action (scan mode: tech/quick/full/critical)
- PR 코멘트 자동 포스팅 (점수, 등급, 취약점 테이블)
- Critical/High 취약점 발견 시 CI 실패 옵션 (`fail-on-critical`)
- 최대 15분 폴링, 상위 20개 취약점 리포트
**기대효과**: CI/CD 통합으로 배포 전 자동 보안 검증. DevSecOps 워크플로우 완성

## V2.8 - Scheduled Scans ✅
**작업**: 크론 기반 정기 보안 스캔 (Hourly/Daily/Weekly)
**파일**: `backend/app/services/scheduler.py`, `backend/app/services/notifier.py`, `components/trust/dashboard/ScheduleSection.tsx`
**주요 변경**:
- 백그라운드 스케줄러 루프 (60초 간격 체크, croniter 기반)
- Hourly / Daily (9AM) / Weekly (Monday 9AM) 프리셋
- 스캔 완료 시 이메일 + Slack 알림 자동 발송
- Cloud Scheduler 연동 엔드포인트 (`POST /api/cron/run-schedules`)
- 프론트 스케줄 관리 UI (생성/목록/삭제)
**기대효과**: 상시 보안 모니터링. 취약점 조기 탐지로 사고 예방

## V2.9 - MCP Resources ✅
**작업**: MCP 서버에 리소스 3종 추가 — AI IDE가 보안 상태를 컨텍스트로 자동 읽기
**파일**: `mcp-server/server.py`, `components/trust/mcp-view.tsx`
**주요 변경**:
- `trust://scans/latest` — 최신 스캔 결과 (점수, 등급, 취약점 수)
- `trust://scans/history` — 최근 10개 스캔 히스토리
- `trust://security/posture` — 보안 상태 요약 (평균 점수, 트렌드, 등급 분포)
- MCP 가이드 페이지에 Resources 카테고리 + How to Use 섹션 추가
**기대효과**: AI 에이전트가 코딩 중 보안 상태를 자동 인지. 컨텍스트 기반 보안 조언 가능

## V2.10 - Browser Notifications ✅
**작업**: 스캔 완료 시 브라우저 Notification API 알림
**파일**: `components/trust/NotificationToggle.tsx`, `components/trust/client-app.tsx`, `components/trust/landing-view.tsx`
**주요 변경**:
- `useNotifications()` 커스텀 훅 (권한 관리, localStorage 저장, 탭 비활성 시만 발송)
- 헤더에 벨 아이콘 토글 (granted/denied/default 3상태)
- 스캔 완료 시 점수/등급/타겟 정보 포함 알림
**기대효과**: 장시간 스캔 중 다른 작업 가능. 완료 즉시 인지

## V2.11 - Weekly Email Digest ✅
**작업**: 주간 보안 다이제스트 이메일 + 사용자 알림 설정 UI
**파일**: `backend/app/services/notifier.py`, `backend/app/services/scheduler.py`, `backend/app/api/routes/notifications.py`, `components/trust/dashboard/DigestSection.tsx`
**주요 변경**:
- `send_weekly_digest()` — 7일간 스캔 집계, 점수 트렌드, 취약점 분류, 다크 테마 HTML 이메일
- 스케줄러에 월요일 9AM UTC 다이제스트 발송 통합
- `GET/PUT /api/notifications/settings` 엔드포인트
- 대시보드 DigestSection UI (토글 + 이메일 입력 + 저장)
- DB 마이그레이션: users 테이블에 digest_enabled, digest_email, digest_frequency 컬럼
**기대효과**: 주간 보안 현황 자동 리포트. 지속적 보안 인지 유도

---

## Next Steps (Future)
- V3.0: Team Plan ($29/seat) for startup teams
