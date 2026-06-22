# Trust - 팀 회의
> **목적**: 아키텍처 전체 설명 + Paddle 결제 붙이기 가이드

---

## Part 1. 아키텍처 전체 설명

### 1-1. 서비스 한 줄 요약

> "URL이나 GitHub 레포를 넣으면, 실제 해킹 도구로 스캔하고, AI가 고치는 법까지 알려주는 보안 스캐너"

- 타겟 유저: 바이브코더 (Cursor, Claude Code 사용자)
- 핵심 가치: 보안 전문가 없이도 30초 안에 취약점 발견 + 수정 가이드

---

### 1-2. 전체 인프라 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자                                    │
│         (브라우저 / Cursor / Claude Code)                         │
└──────┬──────────────┬───────────────────┬───────────────────────┘
       │              │                   │
       ▼              ▼                   ▼
┌──────────┐  ┌──────────────┐  ┌─────────────────┐
│ Frontend │  │  MCP Server  │  │  Claude Code /   │
│ (Vercel) │  │ (Cloud Run)  │  │  Cursor (IDE)    │
│ Next.js  │  │  FastMCP     │  │  MCP 프로토콜     │
└────┬─────┘  └──────┬───────┘  └────────┬────────┘
     │               │                    │
     │    ┌──────────▼────────────────────▼──────┐
     └────►        Backend (Cloud Run)            │
          │        FastAPI (Python)               │
          │                                       │
          │  ┌─────────┐ ┌────────┐ ┌──────────┐ │
          │  │ Nuclei   │ │Semgrep │ │Gitleaks  │ │
          │  │ (DAST)   │ │(SAST)  │ │(Secrets) │ │
          │  └─────────┘ └────────┘ └──────────┘ │
          │  ┌─────────┐ ┌────────────────────┐  │
          │  │npm audit │ │Claude API (Sonnet) │  │
          │  │ (SCA)    │ │  AI 분석 엔진       │  │
          │  └─────────┘ └────────────────────┘  │
          └───────────────┬───────────────────────┘
                          │
                          ▼
              ┌──────────────────────┐
              │   Supabase           │
              │   - PostgreSQL (DB)  │
              │   - Auth (GitHub)    │
              │   - Storage          │
              └──────────────────────┘
```

**설명:**
- 진입점이 3개: 웹, MCP(IDE), API 직접 호출
- 백엔드 하나가 모든 요청을 받음 (단일 FastAPI 서버)
- 스캐너 도구들이 Docker 이미지 안에 같이 설치되어 있음(Nuclei, Semgrep, Gitleaks)
- DB는 Supabase 하나로 통일 (Auth + DB + RLS 다 여기서)

---

### 1-3. 배포 구조

| 서비스 | 플랫폼 | URL | 비고 |
|---|---|---|---|
| **Frontend** | Vercel | https://www.trust-scan.me | main 브랜치 push 시 자동 배포 |
| **Backend** | Cloud Run | https://trust-backend-knnd76vaqq-du.a.run.app | Docker 이미지, `gcloud run deploy` |
| **MCP Server** | Cloud Run | https://trust-mcp-knnd76vaqq-du.a.run.app | 별도 Docker, `/mcp` 엔드포인트 |
| **DB** | Supabase | sdqhirgvqplcdjmgbjxj.supabase.co | 대시보드에서 SQL 직접 관리 |

**배포 명령어 (BE):**
```bash
gcloud run deploy trust-backend \
  --source ./backend \
  --region us-central1 \
  --memory 512Mi \
  --timeout 600s
```

---

### 1-4. 회원 시스템 (Auth)

```
사용자 ──[GitHub 로그인]──► Supabase Auth
                              │
                              ▼
                        OAuth Callback
                        (/auth/callback)
                              │
                              ▼
                     Session Cookie 발급
                     (httpOnly, Secure)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
         Frontend                          Backend
    supabase.auth.getUser()         Authorization: Bearer {jwt}
    → 로그인 상태 확인                  → supabase.auth.get_user(token)
```

**핵심 포인트:**
- GitHub OAuth만 지원 (scope: `repo` — 나중에 자동 PR 생성에 필요)
- Supabase가 JWT 발급/검증 전부 담당
- 프론트: 쿠키 기반 세션 (middleware.ts에서 매 요청마다 갱신)
- 백엔드: `Authorization: Bearer {token}` 헤더로 인증
- 비로그인 사용자도 URL 스캔은 가능 (user_id = NULL)

**인증이 필요한 것 vs 불필요한 것:**

| 기능 | 인증 필요? |
|---|---|
| URL 스캔 | X (비로그인 가능) |
| Repo 스캔 | O (GitHub 토큰 필요) |
| 스캔 히스토리 | O |
| 예약 스캔 | O + Pro |
| 자동 수정 PR | O + Pro |
| AI 분석 | 무료 2회 / Pro 무제한 |

---

### 1-5. 요금제 구조 (현재)

| | Free | Pro |
|---|---|---|
| URL 스캔 | 5회/월 | 무제한 |
| Repo 스캔 | 3회/월 | 무제한 |
| AI 분석 | 2회 무료 | 무제한 |
| 예약 스캔 | X | O |
| 자동 수정 PR | X | O |
| 이메일/Slack 알림 | X | O |

**Pro 게이팅 패턴:**

```typescript
// 프론트 (dashboard-view.tsx)
if (subscription.plan !== "pro") {
  showUpgradeModal();
  return;
}

// 백엔드 (각 라우트)
sub = await supabase.get_subscription(user.id)
if sub["plan"] != "pro":
    raise HTTPException(403, "Pro plan required")
```

**구독 상태 관리** (`lib/subscription.ts`):
```typescript
interface SubscriptionState {
  plan: "free" | "pro" | null;   // null = 미로그인
  urlScansUsed: number;
  urlScansLimit: number;          // 5 or Infinity
  repoScansUsed: number;
  repoScansLimit: number;         // 3 or Infinity
  accessToken: string | null;
}
```

---

### 1-5-1. 비회원 캐싱 & 제한 정책

> **현재 비회원 전용 캐싱 시스템은 없음** — 아래는 비회원 관련 흐름 전체 정리

#### 비회원이 할 수 있는 것

| 기능 | 인증 필요? | 비고 |
|---|---|---|
| URL 스캔 | X | **횟수 제한 없음** (로그인 Free보다 유리) |
| 스캔 결과 조회 | X | `scan_id`만 있으면 열람 가능 (`GET /api/scan/{scan_id}`) |
| AI 분석 | X | `POST /api/analyze` 인증 불필요 |
| 최근 스캔 피드 | X | `GET /api/scans/recent` 공개 |
| 커뮤니티 통계 | X | `GET /api/stats/community` 공개 |
| 벤치마크 통계 | X | `GET /api/stats/benchmark` 공개 |
| Repo 스캔 | **O** | GitHub 토큰 필요 |
| 스캔 히스토리 | **O** | 로그인 필수 |

#### 존재하는 제한/캐싱 장치

| 장치 | 위치 | 대상 | 내용 |
|---|---|---|---|
| **IP Rate Limiter** | `backend/app/limiter.py` | 모든 사용자 | URL스캔 5회/60초, Repo스캔 3회/60초 (인메모리) |
| **SessionStorage** | `components/trust/client-app.tsx` | 비회원→로그인 전환 | OAuth 중 `pending_scan` 저장 → 로그인 완료 시 복원 |
| **AI 캐시** | DB `ai_analyzed` 플래그 | 모든 사용자 | 이미 분석된 취약점 재분석 방지 |
| **월간 제한** | `backend/app/api/routes/scan.py` | **로그인 Free 유저만** | URL 5회/월, Repo 3회/월 |

#### ⚠️ 알려진 이슈: 로그인하면 오히려 불이익

```
비회원:       URL 스캔 무제한 (IP Rate Limit만 적용)
로그인 Free:  URL 스캔 5회/월, Repo 3회/월
로그인 Pro:   무제한
```

- 비회원 스캔은 DB에 `user_id = NULL`로 저장
- 별도 캐싱이나 중복 방지 로직 없음
- IP Rate Limiter는 분당 제한이라 사실상 일간/월간 제한은 없음

#### DB RLS 정책 (회원 테이블)

**`public.users`** (RLS 활성화):

| 정책명 | 명령 | 조건 |
|---|---|---|
| Users can read own data | SELECT | `auth.uid() = id` |
| Users can insert own data | INSERT | `auth.uid() = id` (with_check) |
| Users can update own data | UPDATE | `auth.uid() = id` |

- DELETE 정책 없음 → 사용자가 직접 계정 삭제 불가

**`public.subscriptions`** (RLS 활성화):

| 정책명 | 명령 | 조건 |
|---|---|---|
| Users can read own subscription | SELECT | `auth.uid() = user_id` |

- INSERT/UPDATE/DELETE 없음 → 서버 사이드에서만 관리
- 현재 0건 (Paddle 연동 전환 중)

**`public.users` 테이블 구조:**

| 컬럼 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| id | uuid | auth.users FK | PK |
| email | text | - | |
| github_username | text | - | |
| github_avatar_url | text | - | |
| plan | text | `'free'` | 플랜 상태 |
| first_scan_used | boolean | `false` | |
| digest_enabled | boolean | `false` | 이메일 다이제스트 |
| digest_email | text | - | |
| digest_frequency | text | `'weekly'` | |
| plan_changed_at | timestamptz | `now()` | 월간 카운트 기준일 |

---

### 1-6. 화면 흐름 (Frontend)

```
[랜딩 페이지]
     │
     ├── URL 입력 → [스캔 진행 화면] → [대시보드 (결과)]
     │                  (폴링)           ├── 취약점 목록
     │                                   ├── 점수 카드
     │                                   ├── AI 분석
     │                                   ├── 뱃지 생성
     │                                   ├── 예약 스캔 설정
     │                                   └── 자동 수정 PR
     │
     ├── /pricing → [요금제 페이지] → Paddle 결제
     ├── /history → [히스토리] (로그인 필요)
     ├── /report/[scanId] → [공유용 리포트] (SSR + OG 이미지)
     └── /mcp → [MCP 설치 가이드]
```

**상태 머신** (`client-app.tsx`):
```
landing → scanning → dashboard
   ↑                    │
   └── (새 스캔) ────────┘
```

**주요 컴포넌트 트리:**
```
client-app.tsx (상태 머신)
├── landing-view.tsx      — URL/Repo 입력 폼
├── scanning-view.tsx     — 실시간 진행 상태 (폴링)
└── dashboard-view.tsx    — 결과 대시보드
    ├── ScoreCard.tsx         — 점수 표시 (A~F)
    ├── ScoreBreakdown.tsx    — 점수 세부 내역
    ├── VulnerabilityList.tsx — 취약점 목록
    ├── FilterBar.tsx         — 심각도 필터
    ├── FixPromptModal.tsx    — AI 수정 프롬프트
    ├── CreateFixPRModal.tsx  — GitHub PR 생성
    ├── BadgeSection.tsx      — README 뱃지
    ├── ScheduleSection.tsx   — 예약 스캔
    └── BenchmarkChart.tsx    — 트렌드 차트
```

---

### 1-7. 핵심 로직: URL 스캔

```
[사용자: URL 입력]
       │
       ▼
POST /api/scan { target_url, scan_mode }
       │
       ├── 1. URL 검증 (SSRF 방어: 내부 IP 차단)
       ├── 2. scans 테이블에 레코드 생성 (status: pending)
       ├── 3. Background Task로 Nuclei 실행
       │      nuclei -target <url> -json -severity critical,high,medium,low
       │      → JSON 파싱 → vulnerabilities 테이블에 저장
       ├── 4. 점수 계산: 100 - (Critical×15 + High×10 + Medium×5 + Low×2)
       ├── 5. 등급 산출: A(90+), B+(80+), B(70+), C(60+), D(50+), F(<50)
       └── 6. status → completed

[프론트: 2초마다 폴링]
GET /api/scan/{scan_id}
       │
       └── status === "completed" → 대시보드 렌더링
```

**Nuclei 실행 상세:**
- 5000+ 보안 템플릿 (CVE, 설정 오류, API 노출 등)
- 동시성 35 (Cloud Run 메모리 512Mi 기준 최적값)
- 타임아웃: 600초

---

### 1-8. 핵심 로직: Repo 스캔

```
[사용자: GitHub URL 입력]
       │
       ▼
POST /api/repo-scan { repo_url, branch, scan_type }
       │
       ├── 1. Git Clone → /tmp/trust_scans/{scan_id}
       ├── 2. 병렬로 3개 스캐너 실행:
       │      ├── Gitleaks  → 시크릿 탐지 (AWS키, API토큰 등 20+패턴)
       │      ├── Semgrep   → 코드 취약점 (SQLi, XSS, 커맨드 인젝션 등)
       │      └── npm audit → 의존성 취약점
       ├── 3. 결과 중복 제거 (같은 파일+라인)
       ├── 4. 가중 점수 계산: Secret 15pt, SAST/SCA 심각도별
       ├── 5. AI 분석: Claude가 before_code/after_code/fix_steps 생성
       └── 6. status → completed
```

---

### 1-9. 핵심 로직: AI 분석

```
[취약점 발견됨]
       │
       ▼
POST /api/analyze { scan_id, vulnerability_id }
       │
       ├── 1. 캐시 확인: ai_analysis_cache[template_id]
       │      → 있으면 즉시 반환 (비용 절감)
       │
       ├── 2. 캐시 미스 → Claude Sonnet API 호출
       │      System Prompt: "보안 전문가로서 분석해라"
       │      → {description, impact, category,
       │         before_code, after_code, fix_steps,
       │         fix_complexity, references}
       │
       ├── 3. 결과 캐싱: cache_key = "v5:{template_id}"
       │      (버전 올리면 전체 캐시 무효화)
       │
       └── 4. API 실패 시 → 템플릿별 하드코딩된 분석 반환 (폴백)

세마포어: 동시 5개까지 (Claude API 부하 제한)
```

---

### 1-10. 핵심 로직: 자동 수정 PR (Pro)

```
[사용자: "Fix with PR" 클릭]
       │
       ▼
POST /api/github/create-fix-pr
       │
       ├── 1. 사용자의 GitHub 토큰으로 API 호출
       ├── 2. 레포 Fork (이미 있으면 스킵)
       ├── 3. Fork를 upstream과 동기화
       ├── 4. 브랜치 생성: trust-security-fix-{timestamp}
       ├── 5. 취약점별 파일 수정:
       │      before_code → after_code 교체
       │      (exact match → whitespace-normalized → line-based 순서)
       ├── 6. 커밋: "Fix security vulnerabilities detected by Trust"
       └── 7. PR 생성 (취약점 요약 본문 포함)
```

---

### 1-11. MCP 서버

> IDE(Cursor, Claude Code)에서 직접 스캔을 실행하게 해주는 서버

**8개 도구:**

| 도구 | 설명 | 네트워크 |
|---|---|---|
| `scan_and_wait(url)` | URL 스캔 (블로킹) | O — 백엔드 호출 |
| `scan_repo_and_wait(repo_url)` | Repo 스캔 (블로킹) | O — 백엔드 호출 |
| `scan_url(url)` | URL 스캔 시작 (비동기) | O |
| `get_scan_result(scan_id)` | 결과 조회 | O |
| `scan_repo(repo_url)` | Repo 스캔 시작 (비동기) | O |
| `get_repo_scan_result(scan_id)` | 결과 조회 | O |
| `analyze_code_security(code)` | 코드 분석 (로컬) | X — 패턴 매칭만 |
| `check_secrets(code)` | 시크릿 탐지 (로컬) | X — 정규식만 |

---

### 1-12. 데이터베이스 테이블 맵

```
┌──────────┐    ┌───────────────┐    ┌─────────────────┐
│  users   │───►│ subscriptions │    │ scheduled_scans  │
│          │    │ (1:1)         │    │ (1:N)            │
└────┬─────┘    └───────────────┘    └──────────────────┘
     │
     ├──────────────────┐
     ▼                  ▼
┌──────────┐    ┌──────────────┐
│  scans   │    │  repo_scans  │
│ (URL)    │    │ (GitHub)     │
└────┬─────┘    └──────┬───────┘
     │                 │
     ▼                 ▼
┌────────────────┐  ┌──────────────────────┐
│vulnerabilities │  │ repo_vulnerabilities │
│ (1:N)          │  │ (1:N)                │
└────────────────┘  └──────────────────────┘

┌─────────────────┐    ┌───────────┐
│ai_analysis_cache│    │ mcp_usage │
│ (캐시 테이블)     │    │ (분석용)   │
└─────────────────┘    └───────────┘
```

**RLS (Row Level Security):**
- 모든 테이블에 적용: `auth.uid() = user_id` 조건
- 자기 데이터만 조회 가능
- 서비스 롤 키(백엔드)는 RLS 우회

---

### 1-13. 보안 조치

| 위협 | 대응 |
|---|---|
| SSRF (내부 네트워크 스캔) | 내부 IP 대역 차단 (10.x, 169.254.x, metadata) |
| Rate Limiting | 100 req/min (IP), 20 동시 스캔 (유저) |
| XSS | CSP 헤더 (next.config.js) |
| CSRF | SameSite 쿠키 |
| JWT 위변조 | Supabase가 서명 검증 |
| Webhook 위조 | HMAC-SHA256 서명 검증 (Paddle) |

---

## Part 2. Paddle 결제 시스템

### 2-1. Paddle이 뭔가?

> **Paddle = 결제 대행사 (Merchant of Record)**

Stripe와의 핵심 차이:
- **Stripe**: 우리가 판매자, Stripe는 결제만 처리 → 세금 신고 우리가 해야 됨
- **Paddle**: Paddle이 판매자, 우리는 Paddle에게 받음 → 세금/환불/영수증 전부 Paddle이 처리

| | Stripe | Paddle |
|---|---|---|
| 판매 주체 | 우리 | Paddle |
| 세금 처리 | 직접 (Tax 모듈 별도) | 자동 (100+ 국가) |
| 영수증 발행 | 직접 | Paddle이 발행 |
| 사기 방지 | 별도 설정 | 기본 포함 |
| 수수료 | 2.9% + $0.30 | 5% + $0.50 |
| 환불 | 직접 처리 | Paddle이 처리 |

**우리가 Paddle을 쓰는 이유:**
1. 글로벌 세금 자동 처리 (VAT, GST, Sales Tax — 100+ 국가)
2. 사업자 등록 없이도 결제 받을 수 있음
3. B2B 역과세 (기업 고객은 VAT 면제) 자동
4. 환불/분쟁도 Paddle이 처리

---

### 2-2. 수수료 계산

```
Pro 플랜: $9.90/월 기준

Paddle 수수료: 5% + $0.50
= ($9.90 × 0.05) + $0.50
= $0.495 + $0.50
= $0.995

실 수령액: $9.90 - $0.995 = ~$8.90/건
실효 수수료율: ~10%
```

> 수수료가 높아 보이지만, 세금 처리/영수증/환불/사기방지 전부 포함이라 소규모 SaaS에선 오히려 이득

---

### 2-3. 현재 결제 플로우 (이미 구현됨)

```
[사용자: Pricing 페이지]
       │
       ▼
"Upgrade to Pro" 클릭
       │
       ▼
POST /api/billing/create-checkout
  { user_id, price_id }
       │
       ├── Paddle API로 트랜잭션 생성
       └── checkout_url 반환
       │
       ▼
[Paddle 결제 페이지로 리다이렉트]
  ├── 카드 / PayPal / Apple Pay 결제
  └── 결제 완료 → 우리 사이트로 리턴 (?checkout=success)
       │
       ▼
[Paddle → 우리 백엔드 Webhook]
POST /api/billing/webhook
  event: subscription.activated
       │
       ├── 서명 검증 (HMAC-SHA256)
       ├── subscriptions 테이블 업데이트 (plan = "pro")
       └── 완료
```

---

### 2-4. 현재 구현 파일 목록

| 파일 | 역할 | 위치 |
|---|---|---|
| `billing.py` | 체크아웃 세션 생성, 고객 포털 | backend/app/api/routes/ |
| `billing_webhook.py` | Webhook 수신/처리 | backend/app/api/routes/ |
| `config.py` | Paddle API키, 가격 ID, Webhook Secret | backend/app/ |
| `pricing-client.tsx` | 요금제 UI | app/pricing/ |
| `api.ts` | createCheckoutSession, createCustomerPortal | lib/ |
| `subscription.ts` | Free/Pro 상태 관리 | lib/ |

---

### 2-5. Paddle 웹훅 이벤트

**현재 처리하는 이벤트:**

| 이벤트 | 처리 내용 |
|---|---|
| `subscription.activated` | plan → "pro"로 업데이트 |
| `subscription.updated` | 구독 정보 갱신 |
| `subscription.canceled` | plan → "free"로 변경 |
| `transaction.payment_failed` | 결제 실패 로그 |

**추가로 처리해야 할 이벤트:**

| 이벤트 | 필요 이유 |
|---|---|
| `subscription.paused` | 일시정지 상태 표시 |
| `subscription.resumed` | 재개 시 Pro 복구 |
| `subscription.past_due` | 결제 실패 시 유예 기간 처리 |

---

### 2-6. 결제 개선 방향 (FE에서 할 일)

**현재**: 서버에서 Paddle 트랜잭션 생성 → URL 리다이렉트 (페이지 이동)

**개선안**: Paddle.js Overlay Checkout (모달로 결제 — 페이지 이동 없음)

```
[현재]
클릭 → API 호출 → Paddle 페이지로 이동 → 결제 → 돌아옴
                    (사용자 이탈 가능)

[개선]
클릭 → Paddle.js 모달 팝업 → 결제 → 모달 닫힘 → 즉시 Pro 활성화
                    (이탈 최소화)
```

**FE 구현 가이드:**

```bash
npm install @paddle/paddle-js
```

```typescript
// lib/paddle.ts
import { initializePaddle } from '@paddle/paddle-js';

let paddleInstance: any = null;

export async function getPaddle() {
  if (!paddleInstance) {
    paddleInstance = await initializePaddle({
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          // Pro 활성화 UI 업데이트
          window.location.reload(); // or setState
        }
      }
    });
  }
  return paddleInstance;
}
```

```typescript
// pricing-client.tsx에서 사용
const handleUpgrade = async () => {
  const paddle = await getPaddle();
  paddle.Checkout.open({
    items: [{ priceId: 'pri_xxxxx', quantity: 1 }],
    customer: {
      email: user.email,
    },
    customData: {
      userId: user.id,  // Webhook에서 유저 매핑용
    }
  });
};
```

---

### 2-7. 결제 연동 체크리스트 (BE + FE)

#### BE (이미 대부분 완료)

- [x] `POST /api/billing/create-checkout` — 체크아웃 세션 생성
- [x] `POST /api/billing/webhook` — 웹훅 수신
- [x] 서명 검증 (HMAC-SHA256)
- [x] `subscription.activated` 처리
- [x] `subscription.canceled` 처리
- [x] `transaction.payment_failed` 처리
- [ ] `subscription.paused` / `resumed` 처리 추가
- [ ] `subscription.past_due` 처리 (유예 기간)
- [ ] 월간 사용량 리셋 로직 (current_period_start 기준)
- [ ] ⚠️ DB 컬럼명 정리: `stripe_customer_id` → `paddle_customer_id` (현재 Stripe 이름으로 Paddle ID 저장 중)

#### FE (할 일)

- [x] Pricing 페이지 UI
- [x] createCheckoutSession API 호출
- [ ] **Paddle.js 설치 + Overlay Checkout 전환** (가장 높은 우선순위)
- [ ] 결제 완료 후 즉시 UI 업데이트 (eventCallback)
- [ ] Customer Portal 연동 (구독 관리 페이지)
- [ ] 결제 실패 시 안내 UI
- [ ] Pro 뱃지/아이콘 표시

#### 환경변수 (필요)

```env
# Frontend (.env.local)
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=ctk_xxx   # Paddle.js용 (공개키)
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox    # sandbox or production

# Backend (.env)
PADDLE_API_KEY=pdl_live_xxx              # ✅ 이미 있음
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxx     # ✅ 이미 있음
PADDLE_PRICE_ID_PRO=pri_xxx             # ✅ 이미 있음
```

---

### 2-8. Paddle 결제 수단

| 결제 수단 | 지원 여부 | 비고 |
|---|---|---|
| Visa / Mastercard / Amex | O | 기본 |
| PayPal | O | 자동 |
| Apple Pay | O | 자동 |
| Google Pay | O | 자동 |
| 계좌이체 | O | 지역별 |
| iDEAL, Bancontact 등 | O | EU 지역 |

> Paddle Overlay Checkout을 쓰면 이 결제 수단들이 자동으로 표시됨

---

### 2-9. Paddle 정산 구조

```
고객 $9.90 결제
       │
       ▼
Paddle가 수수료 차감 ($0.995)
+ 해당 국가 세금 원천징수 (VAT 등)
       │
       ▼
우리에게 순수익 지급
(Paddle → 우리 계좌, 월 1-2회 정산)
```

- 우리는 Paddle에 인보이스를 발행 (B2B 거래)
- 고객에게는 Paddle이 영수증 발행
- 세금 신고 안 해도 됨 (Paddle이 MoR로서 대행)

---

## Part 3. 설명 순서 가이드

> 아래 순서대로 설명하면 PD/FE/BE 모두가 전체 흐름을 이해할 수 있음

### 추천 설명 순서 (약 40-50분)

**1단계: 큰 그림 (5분)**
- 1-1 서비스 요약 → 1-2 인프라 구조도 → 1-3 배포 구조
- "우리 서비스가 뭐고, 서버가 어디에 있고, 어떻게 배포하는지"

**2단계: 사용자 흐름 (10분)**
- 1-4 회원 시스템 → 1-5 요금제 → 1-6 화면 흐름
- "사용자가 들어와서 로그인하고, 뭘 쓸 수 있고, 어떤 화면을 보는지"
- FE한테는 컴포넌트 트리 보여주면서 설명

**3단계: 핵심 로직 (15분)**
- 1-7 URL 스캔 → 1-8 Repo 스캔 → 1-9 AI 분석 → 1-10 자동 수정 PR
- "실제로 스캔이 어떻게 동작하는지, AI가 뭘 하는지"
- BE한테는 코드 흐름 위주로, PD한테는 기능 위주로

**4단계: MCP + DB (5분)**
- 1-11 MCP → 1-12 DB 테이블
- "IDE에서 쓰는 건 이렇고, 데이터는 이렇게 저장됨"

**5단계: 결제 (15분)**
- 2-1 Paddle 개념 → 2-2 수수료 → 2-3 현재 플로우 → 2-6 개선 방향
- 2-7 체크리스트는 화면 공유하면서 할 일 배분
- FE: Paddle.js 연동 + Overlay Checkout
- BE: 추가 웹훅 이벤트 처리 + DB 컬럼명 정리

---

### 질문 대비 FAQ

**Q: Paddle 수수료가 너무 높지 않나?**
> A: 5%+$0.50이 비싸 보이지만, 세금 처리/영수증/환불/사기방지 전부 포함. Stripe 쓰면 세금 처리만 별도로 $500+/월 드는 Stripe Tax 써야 함. 소규모 SaaS에선 Paddle이 총비용 기준 저렴.

**Q: 환불은 어떻게?**
> A: Paddle 대시보드에서 클릭 한 번. 우리가 직접 환불 로직 구현할 필요 없음. Webhook으로 `subscription.canceled` 이벤트 받아서 plan만 free로 바꾸면 됨.

**Q: 테스트는 어떻게?**
> A: Paddle Sandbox 환경 제공. `NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox`로 설정하면 실제 결제 없이 테스트 가능. 테스트 카드번호: 4242 4242 4242 4242.

**Q: 기존 Stripe 컬럼은?**
> A: DB에 `stripe_customer_id`, `stripe_subscription_id` 컬럼명으로 Paddle ID를 저장하고 있음. 마이그레이션으로 컬럼명 변경 필요 (기능에는 영향 없음).

**Q: 사용량 리셋은?**
> A: 현재 `subscription.current_period_start` 기준으로 월간 사용량 카운트. 새 기간 시작되면 0으로 리셋하는 로직 필요.
