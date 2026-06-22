# 광주 보안관 - AI 기반 보안 취약점 스캐너

웹사이트와 GitHub 저장소의 보안 취약점을 자동으로 탐지합니다. AI가 취약점 원인을 분석하고, Before/After 수정 코드를 생성합니다.

**저장소**: [https://github.com/KANG-Hyeong-uk/-](https://github.com/KANG-Hyeong-uk/-)

---

## 주요 기능

### URL 보안 스캔
- 5,000+ Nuclei 템플릿 기반 DAST 취약점 탐지
- HTTP 헤더, SSL, CORS, 쿠키 설정 등 런타임 검사
- 30초 이내 스캔 완료

### GitHub 저장소 스캔
- **SAST**: Semgrep 기반 코드 레벨 취약점 탐지 (XSS, SQL Injection, 하드코딩 시크릿 등)
- **Secrets**: Gitleaks 기반 API 키·토큰·비밀번호 노출 탐지
- **SCA**: npm audit 기반 의존성 CVE 탐지
- 가중치 점수 시스템 (A+ ~ F 등급)

### AI 분석 (Pro)
- Gemini 2.5 Flash 기반 취약점 원인 분석
- **Before/After 코드**: 실제 수정 코드 diff 생성
- 단계별 수정 가이드

### AI로 수정 (Pro)
- 전체 취약점에 대한 수정 프롬프트 생성
- Cursor, Claude Code 등 IDE에서 바로 활용 가능

### 추가 기능
- **보안 배지**: 보안 점수 기반 README 배지
- **벤치마크**: 다른 사이트와 보안 점수 비교
- **공유 리포트**: 스캔 결과 URL 공유 (비로그인 열람 가능)
- **예약 스캔**: 매시간 / 매일 / 매주 자동 보안 스캔 + 이메일·Slack 알림
- **주간 다이제스트**: 주간 보안 리포트 이메일 (점수 트렌드, 취약점 요약)
- **푸시 알림**: 스캔 완료 시 Web Push 알림

### 요금제

| | 무료 | Pro (월 $9.9) |
|---|---|---|
| URL 스캔 | 5회/월 | 무제한 |
| 저장소 스캔 | 3회/월 | 무제한 |
| AI 분석 | 스캔당 2건 | 무제한 |
| 예약 스캔 | - | 가능 |
| PDF/CSV 내보내기 | - | 가능 |

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | Next.js 16, React 19, TailwindCSS 4, Framer Motion |
| **백엔드** | FastAPI, Python 3.11+, Nuclei, Semgrep, Gitleaks |
| **데이터베이스** | PostgreSQL 16 (asyncpg) |
| **AI** | Gemini API (Google) — gemini-2.5-flash |
| **결제** | Paddle (Pro 구독) |
| **배포** | EC2 1-tier (Docker Compose — API + PostgreSQL) |

---

## 프로젝트 구조

```
.
├── app/                        # Next.js App Router
│   ├── page.tsx                # 랜딩 (URL / 저장소 스캔)
│   ├── report/[scanId]/        # 스캔 리포트 페이지
│   ├── history/                # 스캔 히스토리
│   ├── pricing/                # 요금제
│   ├── auth/                   # OAuth 콜백
│   └── not-found.tsx           # 404 페이지
├── components/
│   ├── trust/                  # 주요 뷰 컴포넌트
│   │   ├── client-app.tsx      # 앱 상태 관리
│   │   ├── dashboard-view.tsx  # 스캔 결과 대시보드
│   │   ├── landing-view.tsx    # 랜딩 뷰
│   │   ├── scanning-view.tsx   # 스캔 진행 뷰
│   │   └── dashboard/
│   │       ├── FixPromptModal.tsx     # 수정 프롬프트 모달
│   │       ├── ScheduleSection.tsx    # 예약 스캔 관리
│   │       ├── DigestSection.tsx      # 주간 다이제스트 설정
│   │       ├── BadgeSection.tsx       # 보안 배지
│   │       ├── VulnerabilityList.tsx  # 취약점 목록
│   │       └── ExportPanel.tsx        # PDF/CSV 내보내기
│   └── ui/                     # 공통 UI (shadcn/ui)
├── lib/
│   ├── api.ts                  # 백엔드 API 클라이언트
│   └── types.ts                # TypeScript 타입 정의
│
├── backend/                    # FastAPI 백엔드
│   ├── app/
│   │   ├── main.py             # FastAPI 진입점
│   │   ├── config.py           # 설정 (환경변수)
│   │   ├── api/routes/
│   │   │   ├── scan.py              # URL 스캔 API
│   │   │   ├── repo_scan.py         # 저장소 스캔 API
│   │   │   ├── analyze.py           # AI 분석 API
│   │   │   ├── github.py            # GitHub 연동 API
│   │   │   ├── badge.py             # 보안 배지 API
│   │   │   ├── billing_webhook.py   # Paddle 결제 웹훅
│   │   │   └── notifications.py     # 알림 설정 API
│   │   └── services/
│   │       ├── nuclei_scanner.py    # Nuclei 스캐너
│   │       ├── repo_scanner.py      # 저장소 통합 스캐너
│   │       ├── claude_analyzer.py   # AI 분석 (Gemini)
│   │       ├── supabase_client.py   # DB 서비스 (asyncpg)
│   │       ├── scheduler.py         # 예약 스캔 스케줄러
│   │       └── notifier.py          # 이메일/Slack 알림
│   ├── schema.sql              # PostgreSQL 테이블 스키마
│   ├── docker-compose.yml      # EC2 1-tier 배포 구성
│   ├── Dockerfile
│   ├── requirements.txt
│   └── CHANGES.md              # 변경 이력
│
└── public/
    └── sw.js                   # 푸시 알림 서비스 워커
```

---

## API 엔드포인트

### URL 스캔

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/scan` | URL 스캔 시작 |
| `GET` | `/api/scan/{scan_id}` | 스캔 상태/결과 조회 |
| `GET` | `/api/scan/{scan_id}/export` | PDF/CSV 내보내기 |

### 저장소 스캔

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/repo-scan` | 저장소 스캔 시작 |
| `GET` | `/api/repo-scan/{scan_id}` | 스캔 상태/결과 조회 |
| `POST` | `/api/repo-scan/{scan_id}/analyze` | AI 분석 실행 |

### AI 분석

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/analyze/{scan_id}` | AI 분석 시작 |
| `GET` | `/api/analyze/{vuln_id}` | 분석 결과 조회 |

### 배지

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/badge/{scan_id}` | 배지 발급 |
| `GET` | `/api/badge/{badge_id}` | 배지 SVG 조회 |

### 예약 스캔

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `POST` | `/api/scheduled-scans` | 예약 스캔 생성 |
| `GET` | `/api/scheduled-scans` | 예약 스캔 목록 |
| `DELETE` | `/api/scheduled-scans/{id}` | 예약 스캔 삭제 |

---

## 시작하기

### 사전 요구사항

- Node.js 20+
- Python 3.11+
- Docker, Docker Compose
- Gemini API 키

### 1. 저장소 클론

```bash
git clone https://github.com/KANG-Hyeong-uk/-.git
cd -
```

### 2. 프론트엔드 실행

```bash
npm install
cp .env.example .env.local
# .env.local 값 설정 후
npm run dev
```

**환경변수 (.env.local)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_GITHUB_APP_CLIENT_ID=your-github-app-client-id
```

### 3. 백엔드 실행 (Docker Compose)

```bash
cd backend
cp .env.example .env
# .env 파일에 GEMINI_API_KEY, JWT_SECRET 등 입력

docker compose up -d
# PostgreSQL + FastAPI 서버 자동 시작
# schema.sql 자동 실행으로 테이블 생성
```

**환경변수 (backend/.env)**
```env
POSTGRES_PASSWORD=your-db-password
JWT_SECRET=your-random-jwt-secret
GEMINI_API_KEY=your-gemini-api-key
ENVIRONMENT=development
```

---

## EC2 배포

```bash
# EC2 인스턴스에서
git clone https://github.com/KANG-Hyeong-uk/-.git
cd -/backend

cp .env.example .env
# .env 값 입력

docker compose up -d
```

헬스 체크: `curl http://localhost:8080/health`

---

## 라이선스

MIT License
