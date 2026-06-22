# Scanner Crawler Gap — 진단 및 대응 준비

> 작성일: 2026-04-20 · 작성자: Jaden (+Claude 부하 테스트 세션)
> 관련 파일: `backend/app/services/nuclei_scanner.py` · `backend/Dockerfile`

## 한 줄 요약

**DAST 템플릿(SQLi/XSS 등)과 점수 로직은 정상인데, Katana 크롤러가 구식/모던 웹사이트에서 파라미터 URL을 충분히 못 찾는다.** 그래서 DAST Phase 1(SQLi/XSS)이 아예 실행되지 않는 케이스가 자주 발생 → 실제로는 취약한 사이트가 A등급으로 나옴.

## 증거

2026-04-20 부하 테스트 (3개 라이브 타겟, `scan_mode=full`):

| 사이트 | 예상 탐지 | 실제 결과 | Katana 로그 |
|---|---|---|---|
| demo.testfire.net (IBM 가짜 은행) | SQLi 다수, 인증 우회 | 74 B, finding 4개 (Reflected XSS 1 + info 3) | `katana_no_urls` — 파라미터 URL 0개 |
| public-firing-range (Google XSS 연습장) | XSS 다수 | 77 B, finding 3개 | 정상 |
| badssl.com | SSL/TLS 이슈 다수 | 97 A, finding 1개 | 정상 |

**핵심**: `katana_no_urls` 이벤트가 뜨면 DAST Phase 1/2가 **완전히 스킵**된다 (`nuclei_scanner.py:335`). testfire 같은 구식 ASP.NET 사이트가 전형 케이스.

## 왜 이렇게 되는가

### 1. Katana 현재 옵션
```
katana -u URL -d 5 -jc -kf all -aff -ef css,js,png,...
```
- `-jc`: JS 파일 **정적 파싱** (실행 X)
- `-aff`: 폼 자동 제출 시도

### 2. 놓치는 케이스
- **SPA / React / Angular**: JS 실행돼야 등장하는 URL · XHR · 동적 폼
- **구식 ASP.NET ViewState**: `-aff`가 hidden token 못 처리해서 폼 제출 실패
- **복잡한 multi-step 인증 플로우**: 로그인 후에만 접근 가능한 URL 전체

### 3. URL 필터링은 **정상 동작**
`nuclei_scanner.py:491-510`:
- Katana가 찾은 URL 중 `?param=value` 있거나 POST 폼만 남김 (fuzz에 필요한 입력이 있어야 함)
- 상한 30개
- 이 필터는 올바른 최적화. 버그 아님.

### 4. DAST 템플릿 구성도 **정상**
```python
DAST_PHASE1_DIRS = ["sqli", "xss"]
DAST_PHASE2_DIRS = ["lfi", "cmdi", "ssrf", "ssti", "redirect"]
```
T4 최적화(83% 템플릿 축소)는 **HTTP 쪽 CVE 홍수만** 제거. DAST는 건드리지 않았음. 검증 완료.

## 검토하고 기각한 옵션들

### A. Katana headless Chrome 모드
`-headless -system-chrome`로 Chrome 실행시키면 SPA·동적 폼 다 잡히지만:
- 메모리 +500MB~1GB (Chrome 인스턴스당)
- Cloud Run 4GB / containerConcurrency=4 세팅에서 OOM
- 해결하려면 메모리 8GB 또는 동시성 2로 내려야 함 → **Cloud Run 비용 2배**
- **기각**: 비용 대비 효과 나쁨.

### B. 다중 크롤러 union (gau / hakrawler / paramspider)
여러 경량 크롤러 결과를 합치는 방향:
- gau: Wayback/AlienVault 아카이브에서 과거 URL 수집
- paramspider: Google 인덱스에서 파라미터 URL 수집
- hakrawler: JS 파일의 endpoint 추출

**기각 이유**: 우리 실제 고객은 **방금 배포한 새 앱**. 신규 앱은:
- Wayback에 기록 없음 (gau 무력화)
- Google에 인덱싱 안 됨 (paramspider 무력화)
- hakrawler는 Katana `-jc`와 사실상 동일한 한계

testfire.net 같은 공개·오래된 사이트에서만 효과 나는 조합. 우리 고객에겐 비용 대비 거의 쓸모 없음.

### C. 사용자 textarea에 엔드포인트 힌트 붙여넣기
사용자에게 "주요 API 엔드포인트 직접 입력" UI 제공. **기각**: 바이브코더는 "귀찮은 입력"에 창 닫음. 0-click 아니면 안 함.

## 선택한 방향: GitHub 연동 라우트 자동 추출 (옵션 6)

우리 서비스엔 이미 **GitHub OAuth 연동 + `github_connections` 테이블 + `GitHubService`** 가 존재 (`backend/app/services/github_service.py`, `/repos/{owner}/{repo}/contents/{path}` 호출 가능).

### 핵심 아이디어
- URL 스캔 시작 시 연결된 레포 lookup
- 레포의 디렉토리 구조를 GitHub API로 가져옴 (예: `app/`, `pages/`, `routes/`, `src/app/`)
- 파일 경로 → URL 라우트 변환:
  - `app/users/[id]/page.tsx` → `/users/:id`
  - `pages/api/users.ts` → `/api/users`
  - `src/routes/(auth)/login/+page.svelte` → `/login` (SvelteKit)
- `:param` 자리에 샘플 값(`/users/1`, `/posts/foo`) 채워 Katana 결과와 union

### 장점
- 사용자 **0-click**, 이미 연동돼있으니 자동
- 프레임워크 **파서보다 정확** — 소스가 진실
- Next.js·Astro·SvelteKit·Remix·Express 전부 디렉토리 기반이라 **한 번 만들면 모두 커버**
- 추가 인프라 비용 0 (GitHub API 무료 티어 충분)
- repo-scan의 GitHub 인프라 재사용

### 한계
- GitHub 연동 안 한 유저에겐 효과 없음 → **연동 유도 UX 가치**로 전환 ("연동하면 스캔 정확도 UP")
- GitHub 없는 유저 fallback: Next.js 한정 `_buildManifest.js` 파싱 (별도 P3 과제)

## 상세 구현 스펙

별도 문서 참조: [scanner_github_route_extraction_spec.md](./scanner_github_route_extraction_spec.md)

## 검증 기준 (구현 후)

- [ ] 실제 Next.js 앱 스캔 시 DAST Phase 1(SQLi/XSS) 실행 건수가 의미있게 증가
- [ ] `app/` 또는 `pages/` 디렉토리 있는 레포에서 라우트 ≥ 5개 추출 성공
- [ ] 기존 깨끗한 사이트(example.com)는 100/A 유지 (regression 없음)
- [ ] 스캔 시간 증가 < 30초 (GitHub API 호출만 추가)
- [ ] Cloud Run 메모리 영향 없음 (< 3GB 유지)

## 관련 커밋 히스토리

```
1573e75  Feature: Katana crawl + DAST pipeline for real vulnerability detection
7c87845  Improve: deeper Katana crawl for XSS/LFI detection
481e963  Filter DAST crawl URLs to parameter-bearing only
980e35c  Finalize T4: exposures + misconfiguration (83% template reduction)  ← HTTP 쪽만
```

## 우선순위

**P2** — 급하지 않음. 현재 스캐너가 정상 동작하는 사이트 비중이 높고(대부분 실제 고객은 SPA/단순 웹), 이 갭은 구식 ASP/복잡한 SPA 일부에서만 드러남. 본격 구현은 사용자 사이즈 확대 + 엔터프라이즈 요청 생기면 진행.
