# Trust - 팀원 액세스 & 온보딩 TODO

> **목적**: 개발자/디자이너 분들이 작업 시작하기 전에 필요한 계정/권한 정리
>
> 담당: Jaden (프로젝트 오너)

---

## 1. Google Cloud Run — 스펙 확인 & 초대

### 현재 스펙

| 서비스 | 리전 | 메모리 | 타임아웃 | 비고 |
|---|---|---|---|---|
| `trust-backend` | us-central1 | 512Mi | 600s | FastAPI + 스캐너 (Nuclei, Semgrep, Gitleaks) |
| `trust-mcp` | us-central1 | - | - | MCP 서버 (FastMCP) |

### TODO

- [ ] GCP 프로젝트에 팀원 이메일 초대 (IAM → `roles/run.developer` 또는 `roles/viewer`)
  - 개발자: `Cloud Run Developer` (배포/로그 확인 가능)
  - 디자이너: `Cloud Run Viewer` (로그만 확인 가능)
- [ ] 팀원에게 공유할 정보:
  - GCP 프로젝트 ID: (콘솔에서 확인)
  - Cloud Run 콘솔: https://console.cloud.google.com/run
  - 백엔드 URL: `https://trust-backend-knnd76vaqq-du.a.run.app`
  - MCP URL: `https://trust-mcp-knnd76vaqq-du.a.run.app`
- [ ] 배포 방법 공유:
  ```bash
  gcloud run deploy trust-backend \
    --source ./backend \
    --region us-central1 \
    --memory 512Mi \
    --timeout 600s
  ```

---

## 2. Paddle 계정 — 열어드리기

### 현재 상태
- Paddle 계정: Jaden 개인 계정으로 운영 중
- 환경: Sandbox (테스트) + Production
- Pro 가격: $9.90/월

### TODO

- [ ] Paddle 대시보드에서 팀원 초대
  - Paddle → Settings → Team → Invite Member
  - 역할 옵션:
    - **Developer**: API 키 확인, 웹훅 설정 확인 가능
    - **Viewer**: 매출/구독 현황만 열람
- [ ] 팀원에게 공유할 정보:
  - Paddle 대시보드: https://vendors.paddle.com
  - Sandbox 대시보드: https://sandbox-vendors.paddle.com
  - 테스트 카드번호: `4242 4242 4242 4242` (유효기간/CVC 아무거나)
- [ ] 환경변수 공유 (FE 작업자):
  ```env
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=ctk_xxx   # Paddle.js용 (공개키)
  NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox    # 테스트 시
  ```

---

## 3. Supabase 계정 — 열어드리기

### 현재 상태

| 항목 | 값 |
|---|---|
| 프로젝트명 | Trust |
| Organization | Jaden (Free 플랜) |
| 프로젝트 ID | `sdqhirgvqplcdjmgbjxj` |
| 리전 | ap-south-1 |
| DB 버전 | PostgreSQL 17.6 |
| 상태 | ACTIVE_HEALTHY |

### TODO

- [ ] Supabase 대시보드에서 팀원 초대
  - Organization Settings → Members → Invite
  - ⚠️ **Free 플랜은 멤버 초대 제한이 있을 수 있음** — 필요시 Pro 업그레이드 검토
- [ ] 팀원에게 공유할 정보:
  - 대시보드: https://supabase.com/dashboard/project/sdqhirgvqplcdjmgbjxj
  - DB 호스트: `db.sdqhirgvqplcdjmgbjxj.supabase.co`
  - API URL: `https://sdqhirgvqplcdjmgbjxj.supabase.co`
- [ ] 환경변수 공유 (개발자):
  ```env
  NEXT_PUBLIC_SUPABASE_URL=https://sdqhirgvqplcdjmgbjxj.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # 공개키 (RLS 적용됨)
  SUPABASE_SERVICE_ROLE_KEY=eyJ...        # ⚠️ 서버 전용, 절대 프론트에 노출 금지
  ```
- [ ] 주요 테이블 안내 (간략):
  - `users` — 회원 정보 (RLS: 본인만 읽기/쓰기)
  - `subscriptions` — 구독 정보 (RLS: 본인만 읽기, 서버만 쓰기)
  - `scans` / `vulnerabilities` — URL 스캔 결과
  - `repo_scans` / `repo_vulnerabilities` — Repo 스캔 결과
  - `ai_cache` — AI 분석 캐시

---

## 4. GitHub 정책 보기

### 현재 상태

| 항목 | 값 |
|---|---|
| 레포 | https://github.com/Jaden-JJH/trust-security-scanner |
| 기본 브랜치 | `main` |
| 배포 | `main` push → Vercel 자동 배포 (FE) |

### TODO

- [ ] 팀원을 Collaborator로 초대
  - Repo → Settings → Collaborators → Add people
  - 권한:
    - **개발자**: `Write` (push, PR 생성 가능)
    - **디자이너**: `Read` 또는 `Triage` (이슈/PR 확인 가능)
- [ ] 브랜치 보호 규칙 설정 (권장)
  - Settings → Branches → Add rule → `main`
  - [ ] Require pull request before merging
  - [ ] Require at least 1 approval
  - [ ] ~~Require status checks~~ (CI 구축 후)
- [ ] 브랜치 네이밍 컨벤션 정하기 (제안):
  ```
  feature/기능명     — 새 기능
  fix/버그명         — 버그 수정
  design/화면명      — 디자인 작업
  hotfix/긴급수정    — 프로덕션 긴급 패치
  ```
- [ ] PR 템플릿 만들기 (선택):
  ```markdown
  ## 변경 사항
  -

  ## 테스트
  -

  ## 스크린샷 (UI 변경 시)

  ```

---

## 5. PostHog 권한 — 열어드리기

### 현재 상태
- PostHog: 프로덕트 분석 & 이벤트 트래킹
- 대시보드: https://app.posthog.com

### TODO

- [ ] PostHog Organization에서 팀원 초대
  - Settings → Organization → Members → Invite
  - 역할:
    - **Admin**: 설정 변경, 이벤트 정의, 대시보드 생성
    - **Member**: 대시보드 열람, 인사이트 생성 가능
    - **Viewer** (디자이너 추천): 대시보드/퍼널 열람만
- [ ] 팀원에게 공유할 정보:
  - PostHog 대시보드: https://app.posthog.com
  - 주요 확인 항목: 퍼널 전환율, 이벤트 로그, 세션 리플레이 (있을 경우)
- [ ] 환경변수 공유 (FE 작업자):
  ```env
  NEXT_PUBLIC_POSTHOG_KEY=phc_xxx           # PostHog 프로젝트 API 키 (공개키)
  NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com  # 또는 셀프호스팅 URL
  ```

---

## 빠른 체크리스트

| # | 작업 | 대상 | 완료 |
|---|---|---|---|
| 1 | GCP IAM 초대 | 개발자 | [ ] |
| 2 | Paddle 팀 초대 | FE 개발자 | [ ] |
| 3 | Supabase Org 멤버 초대 | 개발자 | [ ] |
| 4 | GitHub Collaborator 초대 | 개발자 + 디자이너 | [ ] |
| 5 | PostHog Organization 멤버 초대 | 개발자 + 디자이너 | [ ] |
| 6 | 환경변수 모음 전달 (.env.example) | 개발자 | [ ] |
| 7 | 브랜치 보호 규칙 설정 | Jaden | [ ] |
| 8 | TEAM_MEETING_GUIDE.md 공유 | 전체 | [ ] |
