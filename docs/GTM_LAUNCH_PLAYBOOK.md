# Trust Security Scanner — GTM Launch Playbook

> 이 문서는 Trust를 실제 시장에 런칭하기 위한 단계별 실행 가이드입니다.
> 위에서 아래로 순서대로 따라하세요.

---

## 0. 런칭 전 필수 세팅: 트래킹

> 트래킹 없이 런칭하면 "사람이 왔는지, 뭘 했는지, 왜 떠났는지" 모릅니다.
> 런칭 전에 반드시 세팅하세요.

### 0-1. 추천 툴: PostHog (무료)

**왜 PostHog인가:**
- 무료 티어: 월 100만 이벤트, 5천 세션 리코딩 (초기에 충분)
- 퍼널 분석, 세션 리코딩, A/B 테스트 전부 포함
- 개발자 친화적 (React SDK 있음)
- Vercel Analytics는 페이지뷰만 봄, PostHog는 행동까지 봄

**설치 방법:**
```bash
npm install posthog-js
```

**`lib/posthog.ts` 생성:**
```typescript
import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window === "undefined") return;
  posthog.init("phc_YOUR_PROJECT_KEY", {
    api_host: "https://us.i.posthog.com",  // 또는 eu
    capture_pageview: true,
    capture_pageleave: true,
  });
}

export { posthog };
```

**`app/layout.tsx`에 추가:**
```typescript
"use client";
import { useEffect } from "react";
import { initPostHog } from "@/lib/posthog";

useEffect(() => { initPostHog(); }, []);
```

### 0-2. 추적해야 할 핵심 이벤트 (11개)

아래 이벤트를 코드에 심으세요. 각 이벤트에 `posthog.capture("event_name", { ...props })` 호출:

| 이벤트 | 위치 | 속성 |
|---|---|---|
| `scan_started` | 스캔 버튼 클릭 | `type: "url" \| "repo"`, `target` |
| `scan_completed` | 결과 로드 | `score`, `grade`, `vuln_count`, `type` |
| `tier_filter_clicked` | FilterBar 탭 클릭 | `tier: "must-fix" \| "should-fix" \| "good-to-know"` |
| `ai_analysis_clicked` | AI 분석 버튼 | `vuln_id`, `severity` |
| `ai_analysis_all` | Get AI Insights 버튼 | `vuln_count` |
| `fix_with_ai_clicked` | Fix with AI 버튼 | `scan_id`, `is_repo` |
| `fix_pr_clicked` | Fix PR 버튼 | `scan_id` |
| `report_shared` | 공유 버튼 | `method: "copy" \| "twitter" \| "linkedin"` |
| `badge_generated` | 배지 생성 | `grade` |
| `signup_clicked` | Sign in 버튼 | `from: "header" \| "vuln_gate" \| "pro_prompt"` |
| `upgrade_modal_opened` | Pro 업그레이드 모달 | `trigger: string` |

### 0-3. UTM 파라미터 규칙

모든 외부 링크에 UTM을 붙여야 어디서 유입됐는지 알 수 있습니다.

**규칙:**
```
https://www.trust-scan.me/?utm_source={출처}&utm_medium={매체}&utm_campaign={캠페인}
```

**예시:**
| 매체 | UTM |
|---|---|
| Product Hunt | `?utm_source=producthunt&utm_medium=listing&utm_campaign=launch_v1` |
| Twitter 포스트 | `?utm_source=twitter&utm_medium=social&utm_campaign=demo_gif` |
| MCP 디렉토리 | `?utm_source=smithery&utm_medium=mcp_directory&utm_campaign=mcp_listing` |
| GeekNews | `?utm_source=geeknews&utm_medium=community&utm_campaign=launch_kr` |
| Disquiet | `?utm_source=disquiet&utm_medium=community&utm_campaign=launch_kr` |
| Reddit | `?utm_source=reddit&utm_medium=community&utm_campaign=show_reddit` |
| Hacker News | `?utm_source=hackernews&utm_medium=community&utm_campaign=show_hn` |

### 0-4. 간단 대시보드 만들기

PostHog에서 아래 대시보드를 만드세요:

1. **Daily Active Users** (일별 방문자)
2. **Scan Funnel**: 방문 → scan_started → scan_completed → ai_analysis_clicked
3. **Traffic Sources**: UTM source별 방문자 수
4. **Tier Usage**: tier_filter_clicked 이벤트의 tier별 분포
5. **Conversion**: signup_clicked / 총 방문자

---

## 1. MCP 디렉토리 등록 (Day 1-3)

### 1-1. 등록할 디렉토리 목록

| 디렉토리 | URL | 방법 | 우선순위 |
|---|---|---|---|
| **Smithery** | https://smithery.ai | 웹에서 직접 등록 | 1순위 |
| **awesome-mcp-servers** | https://github.com/punkpeye/awesome-mcp-servers | GitHub PR | 1순위 |
| **mcp.so** | https://mcp.so | 웹에서 제출 | 1순위 |
| **Glama** | https://glama.ai/mcp/servers | 웹에서 제출 | 2순위 |
| **MCP Hub** | https://www.mcphub.io | 웹에서 제출 | 2순위 |
| **Cursor Directory** | https://cursor.directory | 웹에서 제출 | 2순위 |

### 1-2. awesome-mcp-servers PR 작성법

```bash
# 1. Fork & Clone
gh repo fork punkpeye/awesome-mcp-servers --clone

# 2. README.md에 아래 항목 추가 (Security 카테고리에)
```

**추가할 내용:**
```markdown
- [Trust Security Scanner](https://github.com/anthropics/trust-security-mcp) -
  Scan websites and GitHub repos for vulnerabilities with 10,000+ detection templates.
  Returns AI-analyzed results with fix code.
```

**PR 제목:** `Add Trust Security Scanner MCP server`

**PR 본문:**
```markdown
## Trust Security Scanner

A security scanning MCP server that enables AI coding tools (Claude Code, Cursor)
to scan websites and GitHub repositories for vulnerabilities.

**Features:**
- URL scanning with 10,000+ Nuclei templates
- GitHub repo scanning (SAST, secrets, SCA)
- AI-powered vulnerability analysis with fix suggestions
- Structured fix plans with before/after code

**Tools provided:** `scan_and_wait`, `scan_repo_and_wait`, `analyze_code_security`,
`check_secrets`, `get_fix_plan`

**Server URL:** https://trust-mcp-knnd76vaqq-du.a.run.app
**Website:** https://www.trust-scan.me
```

### 1-3. Smithery 등록 시 작성할 내용

**Name:** Trust Security Scanner
**One-liner:** Scan any URL or GitHub repo for security vulnerabilities from your IDE
**Category:** Security / DevOps
**Install command:**
```json
{
  "mcpServers": {
    "trust-security": {
      "command": "npx",
      "args": ["-y", "@anthropic/trust-security-mcp"]
    }
  }
}
```
*Note: 실제 npm 패키지가 없다면 SSE 방식 URL을 제공*

**Description (200자 이내):**
```
Real vulnerability detection for AI-native developers. Scan websites with 10,000+
Nuclei templates or GitHub repos with SAST/SCA/secret detection. Get AI-analyzed
results with fix code, all without leaving your IDE.
```

---

## 2. 소셜 미디어 데모 콘텐츠 (Day 3-5)

### 2-1. 데모 영상/GIF 제작

**녹화 툴:**
- macOS: Cmd+Shift+5 (내장 화면 녹화) 또는 Screen Studio ($89, 예쁜 결과물)
- 무료 대안: OBS Studio → gifski로 GIF 변환
- 가장 간단: CleanShot X 또는 Kap (무료, macOS)

**녹화할 시나리오 (30초):**

```
[0-5초]  trust-scan.me에서 URL 입력란에 타이핑
         "http://testphp.vulnweb.com" 입력
[5-8초]  "Start Free Scan" 클릭
[8-15초] 스캔 진행 애니메이션 (속도 2x로 편집)
[15-20초] 결과 화면: Score 31, Grade F
         Must Fix 1 / Should Fix 2 / Good to Know 8 카드 보여줌
[20-25초] "Must Fix" 탭 클릭 → SQL Injection만 남음
[25-30초] "Fix with AI" 클릭 → AI 분석 결과/코드 나옴
```

**GIF 변환 (터미널):**
```bash
# ffmpeg로 GIF 변환 (파일 크기 최적화)
ffmpeg -i demo.mov -vf "fps=12,scale=800:-1" -loop 0 demo.gif

# 또는 gifski (더 고품질)
gifski --fps 12 --width 800 -o demo.gif demo.mov
```

**결과물 사양:**
- 해상도: 800px 너비
- 길이: 30초 이내 (트위터 GIF 제한)
- 파일 크기: 15MB 이하
- 다크 테마 그대로 (눈에 띔)

### 2-2. Twitter/X 포스트

**계정:** 개인 계정 사용 (브랜드 계정보다 개인이 반응 좋음)

**포스트 A — 데모 GIF (메인):**
```
I built a free security scanner for indie devs.

Paste a URL → get results in 60 seconds → AI tells you exactly what to fix.

No signup. No install. No BS.

Try it: trust-scan.me

[데모 GIF 첨부]
```

**포스트 B — MCP 앵글 (개발자 타겟):**
```
You can now scan your website for security vulnerabilities
directly from Claude Code or Cursor.

Just type: "scan https://mysite.com"

10,000+ vulnerability templates. AI fix suggestions. Zero setup.

Free MCP server → trust-scan.me/mcp

[MCP 사용 GIF 첨부]
```

**포스트 C — 고통 포인트 (공감형):**
```
Vibe coding is great until you get hacked.

Built a tool that checks your site for SQL injection, XSS,
exposed secrets, and 10,000+ other vulnerabilities.

Takes 60 seconds. Shows you what to fix first.

trust-scan.me
```

**게시 타이밍:**
- 화~목요일 오전 9-10시 (PST) = 한국 시간 수~금 새벽 2-3시
- 한국 타겟: 화~목 오전 9-11시 (KST)
- 3개 포스트를 2-3일 간격으로 올림

**해시태그 (선택, 2-3개만):**
```
#buildinpublic #indiehacker #websecurity
```

### 2-3. Reddit 포스트

**게시할 서브레딧:**

| 서브레딧 | 규칙 | 제목 형식 |
|---|---|---|
| r/SideProject | 자기 프로젝트 홍보 허용 | `I built X` |
| r/webdev | Show-off Saturday 스레드 | 토요일에만 |
| r/selfhosted | 셀프호스팅 가능하면 | 기술 중심 |
| r/netsec | 보안 전문가 커뮤니티, 홍보 금지 | 기술 글만 |
| r/Cursor | Cursor 사용자 | MCP 연동 중심 |

**r/SideProject 포스트:**
```
Title: I built a free website security scanner — paste a URL, get results in 60 seconds

Body:
Hey everyone,

I built Trust (https://www.trust-scan.me) — a security scanner for indie devs
who ship fast but don't have time to learn security tooling.

**How it works:**
1. Paste any URL or GitHub repo
2. It scans 10,000+ vulnerability patterns (SQL injection, XSS, exposed secrets, etc.)
3. Results are categorized: Must Fix / Should Fix / Good to Know
4. AI generates fix code with before/after diffs

**What makes it different:**
- No signup required for basic scans
- Works as an MCP server in Claude Code and Cursor
- AI explains what's wrong AND gives you the fix code

**Tech stack:** Next.js, FastAPI, Nuclei, Semgrep, Claude AI

Try it free: https://www.trust-scan.me

Would love feedback!
```

### 2-4. 한국 커뮤니티

**디스콰이엇 (Disquiet) — 1순위**

URL: https://disquiet.io
- "메이커로그" 또는 "프로덕트" 카테고리에 등록
- 한국 인디해커 커뮤니티에서 가장 활발

**등록 내용:**
```
제목: Trust — URL 하나로 30초 만에 보안 취약점 찾아주는 무료 스캐너

한 줄 소개: 바이브코딩으로 빠르게 만든 사이트, 보안은 Trust가 30초 만에 체크해드립니다.

상세 설명:
Cursor나 Claude Code로 빠르게 개발하는 분들을 위한 보안 스캐너입니다.

- URL만 넣으면 SQL Injection, XSS 등 10,000개 이상의 보안 패턴을 검사
- 결과를 "반드시 수정(Must Fix) / 수정 권장(Should Fix) / 참고(Good to Know)"로 분류
- AI가 수정 코드까지 생성해줌
- Claude Code, Cursor에서 MCP로 바로 사용 가능

무료입니다. 써보시고 피드백 주세요!
https://www.trust-scan.me
```

**GeekNews — 2순위**

URL: https://news.hada.io
- "Show GN" 태그로 게시
- 기술적으로 깊이 있는 글이 반응 좋음

**게시 제목:**
```
Show GN: Trust — 인디 개발자를 위한 무료 보안 스캐너 (Nuclei + AI 분석)
```

---

## 3. Product Hunt 런치 (Day 7-14)

### 3-1. 런치 전 준비물 체크리스트

| 항목 | 사양 | 상태 |
|---|---|---|
| **로고** | 240x240px, PNG, 배경 투명 | [ ] |
| **갤러리 이미지** | 1270x760px, 최대 5장 | [ ] |
| **데모 GIF/영상** | 1270x760px, 30-60초 | [ ] |
| **Tagline** | 60자 이내 | [ ] |
| **Description** | 260자 이내 | [ ] |
| **First Comment** | 300-500자 | [ ] |
| **Topics** | 3-5개 선택 | [ ] |
| **Maker 프로필** | 사진, 바이오 세팅 | [ ] |
| **Hunter** | (선택) 유명 헌터에게 요청 | [ ] |

### 3-2. 콘텐츠 작성

**Tagline (60자):**
```
Free security scanner for indie devs — just paste a URL
```

**Description (260자):**
```
Trust scans your website or GitHub repo for 10,000+ security vulnerabilities
in under 60 seconds. Results are sorted into Must Fix, Should Fix, and
Good to Know tiers. AI generates fix code with before/after diffs.
Works as an MCP server in Claude Code and Cursor. No signup required.
```

**Topics:**
```
Developer Tools, Security, Artificial Intelligence, Open Source, SaaS
```

**First Comment (Maker Comment) — 가장 중요:**
```
Hey Product Hunt! 👋

I'm [이름], and I built Trust because I kept seeing the same problem:
developers ship fast with AI tools like Cursor and Claude Code,
but security is always "I'll do it later."

The problem is, "later" usually means "after getting hacked."

Trust makes it dead simple:
1. Paste a URL → get a security score in 60 seconds
2. Findings are sorted: Must Fix (critical stuff) vs Good to Know (noise)
3. AI generates actual fix code, not just warnings

It also works as an MCP server, so you can run scans directly from
Claude Code or Cursor without leaving your IDE.

The core scan is free, no signup needed.
Try it now: https://www.trust-scan.me

I'd love your feedback — especially on:
- Are the tier categories (Must Fix / Should Fix / Good to Know) helpful?
- What would make you use this regularly?

Happy to answer any questions! 🙏
```

### 3-3. 갤러리 이미지 5장 구성

스크린샷을 **Canva** (무료) 또는 **Figma**에서 목업 프레임에 넣어서 만드세요.

| 순서 | 내용 | 설명 텍스트 (이미지 위에 오버레이) |
|---|---|---|
| 1 | 랜딩 페이지 + URL 입력 | "Paste a URL. Get results in 60 seconds." |
| 2 | 결과 화면 (Score + Tier 카드) | "Know exactly what to fix first." |
| 3 | Score Breakdown + Tier 배지 | "Must Fix / Should Fix / Good to Know" |
| 4 | AI Fix 결과 (before/after 코드) | "AI generates the fix code for you." |
| 5 | MCP 사용 화면 (IDE 내) | "Scan from Claude Code or Cursor." |

**이미지 제작 팁:**
- 배경: 다크 (#0a0a0a) — Trust 테마와 일치
- 텍스트: 흰색 + neon-cyan (#00f3ff) 강조
- 폰트: Inter 또는 SF Pro (개발자 느낌)
- 스크린샷을 브라우저 목업 프레임에 넣으면 프로페셔널해 보임
- Canva 템플릿: "Product Hunt Gallery" 검색하면 1270x760 템플릿 있음

### 3-4. 런치 타이밍

**최적 요일:** 화요일 ~ 목요일
**최적 시간:** 00:01 AM PST (한국 시간 오후 5:01)
- Product Hunt는 PST 자정에 일일 리셋
- 자정 직후 올리면 24시간 노출 최대화

**런치 당일 할 일:**
```
[00:01 PST] Product Hunt에 제품 공개
[00:05 PST] First comment 작성
[00:10 PST] Twitter에 런치 알림 포스트 + PH 링크
[00:15 PST] 지인/커뮤니티에 런치 알림 (DM, 슬랙 등)
[09:00 KST] 한국 커뮤니티에 PH 링크 공유 (디스콰이엇, GeekNews)
[매 2-3시간] PH 댓글에 답글 달기 (engagement 중요)
[24:00 PST] 결과 확인, 회고
```

### 3-5. 런치 전 커뮤니티 빌딩 (선택, 효과 큼)

PH 런치 1주 전부터:
1. Twitter에 "빌딩 과정" 공유 (building in public)
2. "다음 주 PH 런치합니다" 예고
3. 지인 개발자 10-20명에게 DM으로 "런치 날 업보트 부탁" 요청
4. Dev 커뮤니티 슬랙/디스코드에 미리 공유

---

## 4. 광고 소재 가이드 (선택, 유료 성장 시)

> 초기에는 유료 광고보다 위 1-3을 먼저 하세요.
> 유료 광고는 PMF(Product-Market Fit) 확인 후에 하는 게 효율적입니다.

### 4-1. 광고 채널 우선순위

| 채널 | 타겟 | 최소 예산 | 추천 시기 |
|---|---|---|---|
| **Twitter/X Ads** | 개발자 | $5-10/day | PMF 확인 후 |
| **Reddit Ads** | r/webdev, r/programming | $5/day | PMF 확인 후 |
| **Google Ads** | "website security scanner" 검색자 | $10/day | SEO가 안 먹히면 |
| Carbon Ads | 개발자 사이트 | $100/mo~ | 브랜딩 단계 |

### 4-2. 광고 소재 디자인 원칙

**컬러:**
- 배경: #0a0a0a (다크)
- 메인 강조: #00f3ff (neon-cyan, Trust 브랜드 컬러)
- 위험 강조: #f87171 (red-400)
- 텍스트: #ffffff

**폰트:**
- 헤드라인: Inter Bold 또는 SF Pro Bold
- 바디: Inter Regular
- 코드: JetBrains Mono

**소재 타입별 가이드:**

#### 타입 A: "문제 제기" (공감형)
```
┌─────────────────────────────┐
│                             │
│   "Vibe coding is great    │
│    until you get hacked."   │
│                             │
│   ┌─────────────────────┐   │
│   │ Score: 31/100       │   │
│   │ Grade: F            │   │
│   │ Must Fix: 3         │   │
│   └─────────────────────┘   │
│                             │
│   Check yours for free →    │
│   trust-scan.me             │
│                             │
└─────────────────────────────┘
```
- 사이즈: 1200x628px (Twitter/Reddit)
- 스크린샷의 Score 부분만 크롭해서 사용

#### 타입 B: "해결책" (기능형)
```
┌─────────────────────────────┐
│                             │
│   Paste a URL.              │
│   Get your security score   │
│   in 60 seconds.            │
│                             │
│   [데모 GIF / 스크린샷]      │
│                             │
│   Free. No signup.          │
│   trust-scan.me             │
│                             │
└─────────────────────────────┘
```

#### 타입 C: "비교" (차별화)
```
┌─────────────────────────────┐
│                             │
│   Snyk: Install CLI, config │
│         YAML, wait 10 min   │
│                             │
│   Trust: Paste URL.         │
│          Done.              │
│                             │
│   [스크린샷]                 │
│                             │
│   trust-scan.me             │
│                             │
└─────────────────────────────┘
```

### 4-3. A/B 테스트 가이드

광고 시작 시 각 타입(A, B, C)을 동시에 돌리고 3-5일 후 CTR 비교:
- CTR > 1.5%: 좋은 소재
- CTR 0.5-1.5%: 보통
- CTR < 0.5%: 소재 교체

---

## 5. 성과 측정 기준

### 5-1. Week 1 목표 (런칭 직후)

| 지표 | 목표 | 측정 |
|---|---|---|
| 방문자 | 500+ | PostHog |
| 스캔 시작 | 100+ | scan_started 이벤트 |
| 스캔 완료 | 50+ | scan_completed 이벤트 |
| 가입 | 20+ | Supabase auth |

### 5-2. Month 1 목표

| 지표 | 목표 | 의미 |
|---|---|---|
| WAU (주간 활성) | 50+ | 제품에 가치를 느끼는 사람이 있다 |
| 재방문율 | 15%+ | 1회성이 아니라 다시 온다 |
| 스캔 전환율 | 20%+ | 방문자 중 실제 스캔하는 비율 |
| NPS/피드백 | 10건+ | 실제 사용자 의견 |

### 5-3. PMF 확인 기준

아래 중 하나라도 해당되면 PMF 신호:
- [ ] 유저가 직접 주변에 추천함 (트위터 멘션, 블로그 글)
- [ ] 주 1회 이상 돌아오는 유저 10명 이상
- [ ] "이 기능 추가해주세요" 요청이 3건 이상
- [ ] Pro 전환 without 프로모션 (자발적 결제)

---

## 6. 실행 타임라인 요약

```
Day 1-2:  PostHog 세팅 + 이벤트 트래킹 코드 삽입
Day 2-3:  MCP 디렉토리 6곳 등록 (PR/제출)
Day 3-5:  데모 GIF 녹화 + Twitter/Reddit 포스트 작성
Day 5:    Twitter 첫 포스트 (데모 GIF)
Day 6:    Reddit r/SideProject 포스트
Day 7:    디스콰이엇 + GeekNews 포스트
Day 8-10: Product Hunt 준비 (이미지, 텍스트)
Day 10:   Twitter "런치 예고" 포스트
Day 14:   Product Hunt 런치 (화-목)
Day 15-21: 피드백 수집, 1주 성과 분석
Day 21-30: 데이터 기반 다음 액션 결정
```

---

## 7. 참고: 하지 말아야 할 것

- **기능 추가하지 마세요.** 런칭 후 유저 피드백이 올 때까지 새 기능 금지.
- **완벽한 소재를 기다리지 마세요.** 70% 완성도로 올리고 반응 보면서 개선.
- **모든 채널을 동시에 하지 마세요.** MCP → Twitter → PH 순서로.
- **유료 광고 서두르지 마세요.** 무료 채널에서 PMF 확인이 먼저.
- **가격을 바꾸지 마세요.** 초기에 가격 실험하면 혼란만 생김.
