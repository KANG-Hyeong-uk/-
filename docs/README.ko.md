# Trust - AI-Native Security Scanner

[![Smithery](https://smithery.ai/badge/trust-security/scanner)](https://smithery.ai/servers/trust-security/scanner)

URL 또는 GitHub 리포지토리를 스캔하여 보안 취약점을 탐지하고, AI가 근본 원인 분석 + 수정 코드를 생성하며, 원클릭으로 Fix PR까지 만들어주는 서비스입니다.

**Live**: [https://www.trust-scan.me](https://www.trust-scan.me)

---

## 주요 기능

### URL 보안 스캔
- Nuclei 기반 5,000+ 템플릿으로 DAST 취약점 탐지
- HTTP 헤더, SSL, CORS, 쿠키 설정 등 런타임 검사
- 30초 이내 스캔 완료

### GitHub Repo 스캔
- **SAST**: Semgrep으로 코드 레벨 취약점 탐지 (XSS, SQL Injection, 하드코딩된 시크릿 등)
- **Secrets**: Gitleaks로 API 키, 토큰, 비밀번호 노출 탐지
- **SCA**: npm audit로 의존성 CVE 탐지
- 가중 점수 시스템 (A+ ~ F 등급)

### AI 분석 (Pro)
- Claude Sonnet으로 각 취약점의 근본 원인 분석
- **Before/After 코드**: 실제 수정 코드 diff 생성
- 단계별 수정 가이드 제공

### Auto-Fix PR (Pro)
- AI 분석된 취약점을 원클릭으로 GitHub PR 생성
- 자동 브랜치 생성 + 파일 수정 + PR 오픈
- package.json 버전 업데이트 지원

### Fix with AI (Pro)
- 모든 취약점에 대한 수정 프롬프트 생성
- Cursor, Claude Code 등 IDE에서 바로 적용 가능

### 추가 기능
- **Trust Badge**: 보안 점수 기반 README 배지 발급
- **벤치마크**: 다른 사이트와 보안 점수 비교
- **공유 리포트**: 스캔 결과 URL 공유 (로그인 없이 열람)
- **MCP Server**: Claude Code, Cursor에서 IDE 내 보안 스캔 (8 tools + 3 resources)
- **GitHub Action**: CI/CD 파이프라인에서 자동 보안 스캔 + PR 코멘트
- **정기 스캔**: Hourly / Daily / Weekly 자동 보안 스캔 + 이메일/Slack 알림
- **주간 다이제스트**: 주간 보안 리포트 이메일 (점수 트렌드, 취약점 요약)
- **브라우저/Push 알림**: 스캔 완료 시 Web Push 알림

### 플랜

| | Free | Pro ($9.9/mo) |
|---|---|---|
| URL 스캔 | 5회/월 | 무제한 |
| Repo 스캔 | 3회/월 | 무제한 |
| AI 분석 | 스캔당 2개 | 무제한 |
| Auto-Fix PR | - | ✅ |
| 정기 스캔 | - | ✅ |
| PDF/CSV 내보내기 | - | ✅ |

---

## MCP Server (Model Context Protocol)

Claude Code, Cursor IDE 등에서 **한 줄로 설치**하여 코딩 중 실시간 보안 피드백을 받을 수 있습니다.

### 설치 (Claude Code)

```bash
claude mcp add --transport http trust-security "https://trust-mcp-144011703035.asia-northeast3.run.app/mcp"
```

### 설치 (Claude Desktop / Cursor)

설정 파일에 추가:

```json
{
  "mcpServers": {
    "trust-security": {
      "type": "http",
      "url": "https://trust-mcp-144011703035.asia-northeast3.run.app/mcp"
    }
  }
}
```

### 사용 가능한 도구 (8 tools)

| 도구 | 설명 | 사용 예시 |
|------|------|----------|
| `scan_and_wait` | 웹사이트 스캔 + 결과 대기 (권장) | "https://my-app.com 스캔해줘" |
| `scan_url` | 웹사이트 스캔 시작 (비동기) | "스캔 시작해줘" |
| `get_scan_result` | URL 스캔 결과 조회 | "스캔 결과 보여줘" |
| `scan_repo_and_wait` | GitHub 리포 스캔 + 결과 대기 (권장) | "이 리포 보안 스캔해줘" |
| `scan_repo` | 리포 스캔 시작 (비동기) | "리포 스캔 시작해줘" |
| `get_repo_scan_result` | 리포 스캔 결과 조회 | "리포 스캔 결과 보여줘" |
| `analyze_code_security` | 코드 취약점 + 시크릿 분석 (37+ 패턴) | "이 코드 보안 문제 확인해줘" |
| `check_secrets` | API 키/비밀번호 탐지 (20+ 패턴) | "이 코드에 노출된 키 있어?" |

### MCP Resources (3 resources)

AI 에이전트가 자동으로 읽어오는 컨텍스트 리소스입니다.

| 리소스 URI | 설명 |
|-----------|------|
| `trust://scans/latest` | 가장 최근 스캔 결과 (점수, 등급, 취약점 수) |
| `trust://scans/history` | 최근 10개 스캔 히스토리 |
| `trust://security/posture` | 보안 상태 요약 (평균 점수, 트렌드, 등급 분포) |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Next.js 16, React 19, TailwindCSS 4, Framer Motion |
| **Backend** | FastAPI, Python 3.11+, Nuclei, Semgrep, Gitleaks |
| **Database** | Supabase (PostgreSQL + Auth + RLS) |
| **AI** | Claude API (Anthropic) — Sonnet for analysis |
| **Payment** | Paddle (Pro 구독) |
| **Deployment** | Vercel (Frontend), Cloud Run (Backend + MCP) |

---

## 프로젝트 구조

```
.
├── app/                        # Next.js App Router
│   ├── page.tsx                # 랜딩 (URL / Repo 스캔)
│   ├── report/[scanId]/        # 스캔 리포트 페이지
│   ├── history/                # 스캔 히스토리
│   ├── pricing/                # 가격 정책
│   ├── why-trust/              # Why Trust 마케팅
│   ├── auth/                   # OAuth 콜백 (Supabase, GitHub)
│   ├── mcp/                    # MCP 설정 가이드
│   ├── error.tsx               # 에러 바운더리
│   └── not-found.tsx           # 404 페이지
├── components/
│   ├── trust/                  # 주요 뷰 컴포넌트
│   │   ├── client-app.tsx      # 메인 앱 상태 관리
│   │   ├── dashboard-view.tsx  # 스캔 결과 대시보드
│   │   ├── landing-view.tsx    # 랜딩 뷰
│   │   ├── scanning-view.tsx   # 스캔 진행 뷰
│   │   ├── UpgradeModal.tsx    # Go Pro 모달
│   │   ├── NotificationToggle.tsx  # Push 알림 토글
│   │   ├── OnboardingTour.tsx  # 온보딩 투어
│   │   └── dashboard/
│   │       ├── CreateFixPRModal.tsx   # Fix PR 모달
│   │       ├── FixPromptModal.tsx     # Fix Prompt 모달
│   │       ├── ScheduleSection.tsx    # 정기 스캔 관리
│   │       ├── DigestSection.tsx      # 주간 다이제스트 설정
│   │       ├── BadgeSection.tsx       # Trust Badge
│   │       ├── VulnerabilityList.tsx  # 취약점 목록
│   │       └── ExportPanel.tsx        # PDF/CSV 내보내기
│   └── ui/                     # 공통 UI (shadcn/ui)
├── lib/
│   ├── api.ts                  # Backend API 클라이언트
│   ├── types.ts                # TypeScript 타입 정의
│   ├── supabase.ts             # Supabase 클라이언트
│   └── subscription.ts         # Pro 구독 상태 관리
│
├── backend/                    # FastAPI Backend
│   ├── app/
│   │   ├── main.py             # FastAPI 엔트리포인트
│   │   ├── config.py           # 환경설정
│   │   ├── limiter.py          # Rate limiting
│   │   ├── api/routes/
│   │   │   ├── scan.py              # URL 스캔 API
│   │   │   ├── repo_scan.py         # GitHub Repo 스캔 API
│   │   │   ├── analyze.py           # AI 분석 API
│   │   │   ├── github.py            # GitHub 연동 + Fix PR API
│   │   │   ├── github_webhook.py    # GitHub Webhook 수신
│   │   │   ├── badge.py             # Trust Badge API
│   │   │   ├── billing_webhook.py   # Paddle 결제 Webhook
│   │   │   ├── notifications.py     # 알림 설정 API
│   │   │   └── scheduled_scans.py   # 정기 스캔 API
│   │   └── services/
│   │       ├── nuclei_scanner.py
│   │       ├── semgrep_scanner.py
│   │       ├── gitleaks_scanner.py
│   │       ├── repo_scanner.py       # 통합 Repo 스캐너
│   │       ├── claude_analyzer.py    # AI 분석 (Claude)
│   │       ├── github_service.py     # GitHub API 서비스
│   │       ├── supabase_client.py    # DB 서비스
│   │       ├── scheduler.py          # 정기 스캔 스케줄러
│   │       └── notifier.py           # 이메일/Slack/다이제스트 알림
│   ├── Dockerfile
│   └── requirements.txt
│
├── mcp-server/                 # MCP Server (독립 서비스)
│   ├── server.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── public/
│   └── sw.js                   # Push Notification Service Worker
│
└── docs/                       # 문서
    ├── ROADMAP.md
    ├── HANDOVER_CONTEXT_AWARE_FIX.md
    └── REQUIREMENTS_UNIVERSAL_AUTO_FIX.md
```

---

## API 엔드포인트

### URL 스캔

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/scan` | URL 스캔 시작 |
| `GET` | `/api/scan/{scan_id}` | 스캔 상태/결과 조회 |
| `GET` | `/api/scan/{scan_id}/export` | PDF/CSV 내보내기 |

### Repo 스캔

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/repo-scan` | GitHub 리포 스캔 시작 |
| `GET` | `/api/repo-scan/{scan_id}` | 리포 스캔 상태/결과 조회 |
| `POST` | `/api/repo-scan/{scan_id}/analyze` | AI 분석 실행 |
| `POST` | `/api/repo-scan/{scan_id}/fix-prompt` | Fix 프롬프트 생성 |

### GitHub 연동

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/github/connection` | GitHub 연결 상태 확인 |
| `POST` | `/api/github/connect` | GitHub OAuth 연결 |
| `POST` | `/api/github/create-fix-pr` | Fix PR 생성 |
| `POST` | `/api/github/fix-feedback` | Fix 품질 피드백 |
| `DELETE` | `/api/github/connection` | GitHub 연결 해제 |

### AI 분석

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/analyze/{scan_id}` | AI 분석 시작 |
| `GET` | `/api/analyze/{vuln_id}` | 분석 결과 조회 |

### 배지

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/badge/{scan_id}` | 배지 발급 |
| `GET` | `/api/badge/{badge_id}` | 배지 SVG 조회 |

### 정기 스캔

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/scheduled-scans` | 정기 스캔 생성 |
| `GET` | `/api/scheduled-scans` | 정기 스캔 목록 |
| `DELETE` | `/api/scheduled-scans/{id}` | 정기 스캔 삭제 |
| `POST` | `/api/cron/run-schedules` | 스케줄 실행 (Cloud Scheduler) |

### 히스토리 / 알림

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/scans/history` | 스캔 히스토리 조회 |
| `GET` | `/api/notifications/settings` | 알림 설정 조회 |
| `PUT` | `/api/notifications/settings` | 알림 설정 변경 |

### Webhook

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/billing/webhook` | Paddle 결제 Webhook |
| `POST` | `/webhooks/github` | GitHub PR 이벤트 Webhook |

---

## 시작하기

### 사전 요구사항

- Node.js 20+
- Python 3.11+
- Nuclei, Semgrep, Gitleaks (보안 스캐너)
- Supabase 계정
- Anthropic API 키

### 1. 저장소 클론

```bash
git clone --recurse-submodules https://github.com/Jaden-JJH/trust-security-scanner.git
cd trust-security-scanner
```

### 2. Frontend 설정

```bash
npm install
cp .env.example .env.local
npm run dev
```

**환경변수 (.env.local)**
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GITHUB_APP_CLIENT_ID=your-github-app-client-id
```

### 3. Backend 설정

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

---

## 배포

### Frontend (Vercel)

GitHub 저장소 연결 후 자동 배포. `main` 브랜치 push 시 자동 빌드.

### Backend (Cloud Run)

```bash
cd backend
gcloud builds submit --tag gcr.io/[PROJECT_ID]/trust-backend
gcloud run deploy trust-backend \
  --image gcr.io/[PROJECT_ID]/trust-backend \
  --platform managed --region asia-northeast3 \
  --allow-unauthenticated
```

---

## 라이선스

MIT License

---

## 팀

2026 빌더톤 프로젝트
