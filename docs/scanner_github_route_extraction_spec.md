# 구현 스펙: GitHub 연동 라우트 자동 추출 (옵션 6)

> 작성일: 2026-04-20 → 2026-04-21 업데이트
> 상태: **✅ 배포 + UX 승격 완료**
> 선행 문서: [scanner_crawler_gap.md](./scanner_crawler_gap.md) — 배경 진단

## 배포 상태 요약

### 2026-04-20 초기 구현
- 백엔드: `backend/app/services/route_extractors/` 패키지 (8개 모듈) + 스캐너 통합
- 프론트엔드: `components/trust/RepoSelector.tsx` (cmdk 기반 콤보박스)
- 테스트: 84/84 통과 (Next.js 32 + Astro 16 + SvelteKit 14 + Remix 17 + Orchestrator 5)
- 관련 커밋: `74fe6a4 Add GitHub-linked route extraction to seed scanner DAST phase`

### 2026-04-21 UX 리팩터
초기 배포 후 "기능이 있어도 유저가 진입할 수 없는" 문제 발견:
- `github_connections` 테이블은 **Fix-PR 플로우**에서만 채워지고 있어서, 그 기능 써본 유저 외엔 RepoSelector 자체가 숨겨짐
- 로그인 방식(Google/GitHub Supabase Auth)과 무관 — Supabase Auth의 GitHub provider token은 `github_connections`에 자동 복사 안 됨

**해결**:
- `lib/use-github-connect.ts` — OAuth 팝업 로직을 훅으로 추출
- 스캔 폼에 "Connect GitHub" 배너 추가 (로그인 + 미연동 시 1-클릭 연동)
- RepoSelector를 스캔 폼의 1차 입력으로 승격 (크기도 키움: `min-h-52`)
- URL 탭: 레포 선택 시 `homepage` 자동 입력
- Repo 탭: 연동된 유저는 드롭다운이 URL input을 대체 (미연동은 기존 URL 붙여넣기 유지)
- 관련 커밋: `aefb2e2`, `2068f9a`, `b63e7ef`

## Known Limitation — 커스텀 도메인 (해결됨)

외부 DNS provider로 Vercel 프로젝트에 붙인 커스텀 도메인(예: `index-board.space`)을 초기 구현에선 인식 못 했음. GitHub `homepage`가 Vercel 자동의 `xxx.vercel.app` 주소를 담는 경우가 많아서.

**해결 (2026-04-21)**: Vercel OAuth 연동 완료. 레포 선택 시 Vercel API로 production alias 조회 → homepage보다 우선해서 URL 자동 채움. Preview host로 auto-fill된 유저엔 "Connect Vercel" 인라인 힌트 노출. 상세: 메모리 `project_vercel_oauth_plan.md`.

## 남은 작업

- 실사용 로그 모니터링 (`routes_extracted` / `github_routes_merged` 이벤트 건수 + Vercel alias 히트율)
- 바이브코더 유저의 Next.js 앱 실제 스캔에서 DAST `dast_count` 개선 여부 확인
- 후속: Netlify API 연동 (Vercel 다음), Next.js `_buildManifest` fallback, MCP 로컬 추출

---

## 이하는 설계 시점 원본 문서 (참고용)


## 0. 목표와 비목표

### 목표
- GitHub 연동한 사용자가 URL 스캔을 실행할 때, 해당 레포의 디렉토리 구조에서 **웹 라우트를 자동 추출**해 Katana 크롤 결과에 합친다.
- 이를 통해 `katana_no_urls` 이벤트로 **DAST Phase 1(SQLi/XSS)이 스킵되는 사례를 제거**한다.
- 사용자의 추가 입력 없음 (0-click).

### 비목표
- GitHub 연동 안 한 사용자 지원 (별도 P3: Next.js `_buildManifest` fallback)
- 로그인 뒤에만 접근 가능한 라우트 탐색 (인증 우회는 엔터프라이즈급 과제)
- 런타임 계산 라우트 (React Router DOM으로 순수 클라이언트에서 만드는 경로)

## 1. 고수준 데이터 흐름

```
POST /api/scan {target_url}
   │
   ├─(A) Supabase에서 user_id → github_connections 조회
   │        └── 연동 없으면 기존 플로우 그대로 (카타나만)
   │
   ├─(B) GitHubRouteExtractor가 레포 디렉토리 fetch
   │        ├── 프레임워크 탐지 (detectors)
   │        └── 파일 경로 → URL 라우트 변환 (converters)
   │
   ├─(C) Katana 크롤 (기존 로직)
   │
   └─(D) Nuclei DAST 입력 = (B 결과 ∪ C 결과) → 파라미터 필터 → 상한 30 → DAST
```

## 2. 사용자가 연동한 레포를 어떻게 선택할까

**문제**: 한 사용자가 여러 레포 가질 수 있음. 어떤 레포가 `target_url`과 연결되는가?

### 선택 로직 (우선순위 순)
1. **스캔 요청에 `repo_full_name` 명시** — 프론트에서 드롭다운으로 선택 가능하게 (P1 스펙에 포함)
2. **Vercel/Netlify 배포 링크 매칭** — GitHub 레포 `vercel.json`이나 `netlify.toml`에 배포된 도메인이 명시된 경우 역매핑 (선택적)
3. **최근 repo-scan한 레포 자동 추정** — `repo_scans` 테이블에서 해당 user의 최근 스캔 레포
4. **fallback**: 사용자의 first repo (신뢰도 낮음, 경고 로깅)

**MVP 결정**: 일단 1번만 구현. 프론트에 레포 셀렉터 드롭다운 추가. 2·3번은 후속 iteration.

## 3. 신규/수정 파일

| 파일 | 상태 | 역할 |
|---|---|---|
| `backend/app/services/github_route_extractor.py` | **신규** | 핵심 로직: 레포 구조 fetch + 프레임워크 탐지 + 라우트 변환 |
| `backend/app/services/github_service.py` | **수정** | 디렉토리 트리 fetch 헬퍼 추가 (이미 `/contents/` 있음) |
| `backend/app/services/nuclei_scanner.py` | **수정** | `_crawl_target` 전/후에 추출 라우트 union |
| `backend/app/api/routes/scan.py` | **수정** | `ScanRequest`에 `repo_full_name: Optional[str]` 추가 |
| `backend/app/models/schemas.py` | **수정** | Schema 확장 |
| `backend/app/services/supabase_client.py` | **수정** | `get_user_github_repos` 헬퍼 (이미 있을 수 있음, 확인 필요) |
| `frontend/components/scan-form.tsx` (또는 해당 컴포넌트) | **수정** | 연결된 레포 셀렉터 드롭다운 |
| `backend/tests/test_github_route_extractor.py` | **신규** | 프레임워크별 변환 테스트 |

## 4. `GitHubRouteExtractor` 인터페이스

```python
# backend/app/services/github_route_extractor.py

class GitHubRouteExtractor:
    def __init__(self, gh_service: GitHubService, repo: str, branch: str = "main"):
        self.gh = gh_service
        self.repo = repo  # "owner/repo"
        self.branch = branch

    async def extract_routes(self) -> list[RouteHint]:
        """
        Returns list of RouteHint with at least one inferred route each.
        Swallows errors — returns [] on failure, logs warning.
        """
        tree = await self._fetch_tree()        # Git tree API (1 call)
        framework = self._detect_framework(tree)  # heuristic
        if not framework:
            return []
        converter = FRAMEWORK_CONVERTERS[framework]
        raw_routes = converter(tree)           # list of RoutePath objects
        return [self._parameterize(r) for r in raw_routes]


@dataclass
class RouteHint:
    path: str              # "/users/1" (fully parameterized, ready to scan)
    method: str            # "GET" or "POST"
    framework: str         # "nextjs" etc. (for telemetry)
    has_params: bool       # if False, may be skipped by DAST URL filter
    source_file: str       # for debugging: "app/users/[id]/page.tsx"


@dataclass
class RoutePath:
    pattern: str           # "/users/:id" (unparameterized)
    method: str = "GET"
    source_file: str = ""
```

### 샘플 값 삽입 로직 (`_parameterize`)
- `:id`, `[id]`, `[slug]` 등 동적 세그먼트 → `1` (숫자 자리) 또는 `test` (문자 자리)
- 정규식으로 `:\\w+` 또는 `\\[\\w+\\]` 매치 → 샘플 값 치환
- 치환된 URL엔 `?id=1` 같은 쿼리 파라미터도 한 개 붙여서 fuzz 대상으로 보장

## 5. 프레임워크 탐지 (heuristic)

| 프레임워크 | 시그니처 파일 | 라우트 디렉토리 |
|---|---|---|
| Next.js (App Router) | `next.config.js` + `app/` 디렉토리 존재 | `app/**/page.{tsx,jsx,js,ts}` |
| Next.js (Pages Router) | `next.config.js` + `pages/` 디렉토리 | `pages/**/*.{tsx,jsx,js,ts}` |
| Astro | `astro.config.*` | `src/pages/**/*.{astro,md,mdx}` |
| SvelteKit | `svelte.config.js` | `src/routes/**/+page.{svelte,ts}` |
| Remix | `remix.config.js` | `app/routes/**/*.{tsx,jsx}` |
| Express-ish (REST API) | `package.json`에 `express` dep | `routes/**/*.{js,ts}` (regex로 `app.get('/path'...)` 파싱, 차후) |

탐지 실패 시 빈 리스트 반환, 로깅 후 기존 Katana-only 플로우로 진행.

## 6. 파일 경로 → 라우트 변환 규칙 (핵심)

### Next.js App Router
```
app/page.tsx                   → /
app/users/page.tsx             → /users
app/users/[id]/page.tsx        → /users/:id
app/users/[...slug]/page.tsx   → /users/:slug (catch-all, 단일 샘플)
app/(marketing)/about/page.tsx → /about (그룹 라우트 괄호 제거)
app/api/users/route.ts         → /api/users (API route)
```

### Next.js Pages Router
```
pages/index.tsx                → /
pages/users.tsx                → /users
pages/users/[id].tsx           → /users/:id
pages/api/users.ts             → /api/users
```

### Astro / SvelteKit / Remix — 비슷한 규칙, 각자 기호만 다름

**엣지케이스**:
- `_layout`, `_app`, `not-found` 등 관례적 제외 파일 목록 유지
- 중첩 동적 세그먼트 `[category]/[id]` → `/electronics/1` 식으로 다단계 샘플
- Windows 경로 구분자 `\\` 방어적 처리

## 7. GitHub API 사용

### 주요 호출
1. **Git Trees API** (`GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`) — 한 번 호출로 모든 파일 경로 받기 (~1-2s)
2. **Rate limit**: 인증 시 시간당 5,000 req. 스캔당 1번만 호출이라 여유
3. **캐싱**: 동일 레포·브랜치·commit_sha 조합 → Supabase에 24h 캐싱 고려 (optional, P1 범위 밖)

### 실패 모드 처리
- 레포 private이고 토큰에 권한 없음 → 404 → 로깅 후 빈 리스트
- 레포 500MB 넘는 거대 모노레포 → tree API는 잘림 플래그 반환, 로깅
- GitHub outage → 타임아웃 5s 걸고 빈 리스트

## 8. 스캐너 파이프라인 통합 지점

`backend/app/services/nuclei_scanner.py` 기존 `_crawl_target` 내부 또는 바로 전에:

```python
# 기존
crawled_urls = await self._crawl_target(crawl_file, timeout=120)

# 변경
katana_urls = await self._crawl_target(crawl_file, timeout=120)
repo_routes = []
if self.repo_hint:  # 신규 필드: 스캐너 생성 시 주입
    extractor = GitHubRouteExtractor(gh_service, self.repo_hint.repo)
    repo_routes = await extractor.extract_routes()

# Union + dedupe + 필터 (기존 필터 재사용)
all_urls = self._union_and_dedupe(katana_urls, repo_routes)
# ... DAST로 전달
```

## 9. 텔레메트리 / 로깅 이벤트

구조 로그 이벤트명:
- `github_repo_selected` — user_id, repo, branch
- `github_tree_fetched` — repo, file_count, truncated
- `framework_detected` — framework (nextjs/astro/...), repo
- `routes_extracted` — count, framework, sample_paths (최대 5개)
- `github_route_extraction_failed` — reason, repo
- `dast_url_sources` — katana_count, github_count, union_count

부하 테스트·KPI 대시보드가 이걸 기반으로 동작하도록.

## 10. 테스트 계획

### 단위 테스트 (`test_github_route_extractor.py`)
- Next.js App Router 트리 fixture → 기대 라우트 리스트
- Next.js Pages Router fixture
- Astro / SvelteKit / Remix 각 1개씩
- 프레임워크 탐지 실패 케이스
- 동적 세그먼트 파라미터 치환 정확성
- 그룹 라우트 `(auth)` 제거
- catch-all `[...slug]` 처리
- 거대 모노레포 (1만 파일) 성능 — 1초 내

### 통합 테스트
- 우리 자체 레포(`trust-security`)로 엔드투엔드 — 실제 GitHub API 호출
- VCR.py 또는 mocked GitHubService로 CI에서 재현 가능하게

### 스모크 테스트 (수동)
1. 자기 레포 연동 → URL 스캔 → 로그에 `routes_extracted count=N` 찍히는지
2. testfire 대비 실제 Next.js 데모 사이트로 DAST Phase 1 실행률 비교

## 11. 롤아웃 플랜

### 단계별
1. **Day 1-2**: `GitHubRouteExtractor` 클래스 + Next.js 변환기 + 단위 테스트
2. **Day 2-3**: 다른 프레임워크 변환기 추가 + 프레임워크 탐지 heuristic
3. **Day 3-4**: 스캐너 통합 + `ScanRequest` 스키마 확장
4. **Day 4-5**: 프론트엔드 셀렉터 추가
5. **Day 5**: QA, 텔레메트리 검증, 문서화

### 환경 변수로 feature flag
- `GITHUB_ROUTE_EXTRACTION=true|false` (기본 false) — 점진 출시
- 내부 테스트 → 소수 베타 유저 → 전체

### 롤백 조건
- 스캔 시간 30% 이상 증가
- `github_route_extraction_failed` 에러율 > 10%
- 기존 Katana-only 대비 finding 감소 (union이 regression 유발 — 상식적으론 없어야)

## 12. 리스크와 완화책

| 리스크 | 완화 |
|---|---|
| GitHub 토큰 만료/revoke | `github_service.py`에 이미 401 처리 있음. 에러 → 빈 리스트 |
| 동적 세그먼트에 숫자 대신 UUID 같은 형식 요구됨 | 샘플 값 2-3개 생성 (숫자 / UUID-like / 영문 slug) 각각 라우트 생성 |
| 모노레포에서 `apps/web/`, `packages/ui/` 등 여러 앱 | 프레임워크 시그니처를 재귀적으로 여러 디렉토리에서 탐지, 각 앱별 라우트 합침 |
| 파일이 많아 크롤 느림 | `_ignore` 리스트(node_modules, .next, dist) 적용 + tree API `recursive=1` 한 번 호출 |
| 사용자의 repo가 target_url과 실제로 연결 안 될 수 있음 | MVP는 사용자가 셀렉트. 후속 iteration에서 Vercel/Netlify 자동 매핑 |

## 13. 오픈 퀘스천

구현 시 결정 필요:
1. **branch 선택**: `main` 고정 vs 사용자가 지정 vs GitHub 기본 브랜치 API 조회
2. **샘플 파라미터 값 전략**: 단일 값(`1`) vs 복수 값(`1`, `test`, `uuid`) 각각 URL 생성 — 후자가 탐지력 up, DAST 시간 up
3. **API route도 fuzz 대상**: Next.js `app/api/**` 라우트는 JSON POST를 받는 경우 많음. GET fuzz로 충분한가?
4. **Rate limit 대비**: 사용자가 연달아 여러 레포 스캔 시 5000/hr 소진 가능성 (작지만)

## 14. 후속 과제 (P2 이후)

- GitHub 없는 사용자용 Next.js `_buildManifest.js` fallback 크롤러
- Vercel/Netlify API 연동으로 배포 링크 → 레포 자동 매핑
- MCP 서버에서 로컬 프로젝트 라우트 추출해 스캔 요청 (Cursor 사용자 0-click)
- Express/Fastify/FastAPI 같은 코드 기반 라우트 파싱 (AST 파싱 필요, 난이도 상승)
