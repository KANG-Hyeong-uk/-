# 메인 페이지 디자인 스펙

## 1. 디자인 시스템 토큰

### 색상

| 토큰 | 값 | 용도 |
|---|---|---|
| `--background` | `oklch(0.08 0.01 260)` ≈ `#0a0b10` | 전체 배경 (거의 검정) |
| `--foreground` | `oklch(0.95 0 0)` ≈ `#f2f2f2` | 기본 텍스트 |
| `--card` | `oklch(0.12 0.01 260)` ≈ `#131520` | 카드 배경 |
| `--muted-foreground` | `oklch(0.6 0 0)` ≈ `#8a8a8a` | 보조 텍스트 |
| `--border` | `oklch(0.25 0.02 260)` ≈ `#2e2f3d` | 기본 테두리 |
| `--neon-cyan` | `#00f3ff` | 핵심 포인트 컬러 (버튼·아이콘·glow) |
| `--severity-critical` | `#ef4444` | 위험 취약점 |
| `--severity-high` | `#f97316` | 높음 |
| `--severity-medium` | `#eab308` | 중간 |
| `--severity-low` | `#3b82f6` | 낮음 |
| `--severity-info` | `#6b7280` | 정보 |

### 글꼴
- 기본: `Geist` (Inter 폴백)
- 모노: `Geist Mono`

### 반지름
- 기본: `0.75rem` (12px)
- 카드·인풋: `rounded-2xl` (16px)
- 버튼: `rounded-xl` (12px)

### Glass 효과

```css
/* .glass */
background: rgba(255,255,255,0.03);
backdrop-filter: blur(20px);
border: 1px solid rgba(255,255,255,0.08);

/* .glass-strong (인풋 박스) */
background: rgba(255,255,255,0.06);
backdrop-filter: blur(30px);
border: 1px solid rgba(255,255,255,0.12);
```

### Neon 효과

```css
/* .neon-glow (버튼 hover, 포커스 시 인풋) */
box-shadow: 0 0 20px rgba(0,243,255,0.3), 0 0 40px rgba(0,243,255,0.15);

/* .neon-text (헤드라인 강조) */
text-shadow: 0 0 10px rgba(0,243,255,0.5), 0 0 20px rgba(0,243,255,0.3);

/* .neon-border (포커스 인풋) */
border-color: rgba(0,243,255,0.5);
box-shadow: 0 0 10px rgba(0,243,255,0.2), inset 0 0 10px rgba(0,243,255,0.05);
```

---

## 2. 레이아웃 구조

```
┌──────────────────────────────────────────────┐
│  [FIXED BACKGROUND LAYER z-0]                │
│  • GridScan WebGL 그리드 애니메이션 (opacity 25%) │
│  • 60px 격자 패턴 (opacity 2%)               │
│  • 좌상단 원형 Cyan glow blur                │
│  • 우하단 원형 Cyan glow blur                │
└──────────────────────────────────────────────┘
│
│  [CONTENT LAYER z-10~20]
│
├── Header (z-20)
├── Hero Section (z-10)
│   ├── Badge
│   ├── Headline
│   ├── Sub-headline
│   ├── Tab Switcher (URL | GitHub)
│   ├── Scan Input Box
│   │   ├── 아이콘 + 입력 필드 or RepoSelector
│   │   └── Scan 버튼
│   ├── 인증 관련 조건부 UI
│   └── Feature Cards (4개 그리드)
│
├── [스크롤 시 페이드인]
│   ├── How It Works (3단계)
│   ├── Comparison Table
│   ├── Social Proof Stats (4개)
│   └── Bottom CTA
│
└── Footer
```

---

## 3. 섹션별 상세 스펙

### 3.1 배경 레이어

**GridScan WebGL (fixed, z-0)**
- `opacity-25` (25%)
- 설정: `linesColor="#00f3ff"`, `scanColor="#00f3ff"`, `scanOpacity=0.55`, `gridScale=0.13`, `lineThickness=1.2`
- bloom, chromaticAberration, 핑퐁 스캔 애니메이션

**격자 오버레이 (fixed, pointer-events-none)**
- 배경: `linear-gradient(rgba(0,243,255,0.5) 1px, transparent 1px)` × 가로세로
- 크기: 60×60px, 전체 opacity 2%

**Glow Orb 좌상단**
- 크기: 600×600px, `bg-neon-cyan/5`, `blur-[80px]`
- 위치: `top-0 left-1/4`

**Glow Orb 우하단**
- 크기: 500×500px, `bg-neon-cyan/3`, `blur-[60px]`
- 위치: `bottom-0 right-1/4`

---

### 3.2 Header

**레이아웃**: `flex items-center justify-between px-4~12 py-4`  
**진입 애니메이션**: `opacity: 0 → 1`, duration 0.3s

**로고 (좌측)**
- `Shield` 아이콘 32×32 (`text-neon-cyan`) + 아이콘 뒤 `bg-neon-cyan/30 blur-lg` 글로우
- 텍스트: `광주 보안관` (xl, font-semibold) / `Gwangju Security` (xs, muted)

**네비게이션 (우측)**
```
[요금제] [알림 토글?] [EN|KO] [로그인/아바타] [Go Pro 버튼?]
```

- **요금제 버튼**: `px-3 py-1.5 rounded-lg border border-neon-cyan/30 text-neon-cyan text-sm` + hover `bg-neon-cyan/10`
- **언어 토글**: EN | KO, 선택된 것만 `text-foreground font-medium`
- **AuthButton**: 로그인 상태에 따라 아바타 or 로그인 버튼
- **Go Pro 버튼** (로그인 + 무료플랜 시 표시): `bg-neon-cyan text-black font-semibold`

---

### 3.3 Hero Section

**컨테이너**: `flex-1 flex flex-col items-center justify-center px-4~6 py-12~20 relative z-10`  
**내부 최대폭**: `max-w-4xl mx-auto text-center`

#### Badge
```
[ShieldCheck 아이콘] AI-Native Security · URL + Code · 30-sec start
```
- `inline-flex items-center gap-2 px-4 py-2 rounded-full`
- `border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan text-xs font-medium`
- `min-h-[44px]`, `mb-8`

#### Headline (h1)
- 크기: `text-3xl sm:4xl md:6xl lg:7xl font-bold tracking-tight`
- `mb-6 text-balance`

```
"AI Code,"        ← ShinyText: color=#00f3ff, neon-text, speed=3, delay=0.5s
"Trusted"         ← ShinyText: color=#b8c5d3, speed=4, delay=1.5s
(줄바꿈)
"in 60 Seconds"   ← ShinyText: color=#b8c5d3, speed=4, delay=2.5s
```
*(한국어: ShinyText 없이 직접 색상 적용)*

#### Sub-headline (p)
- `text-base sm:lg max-w-xl mx-auto mb-8 leading-relaxed`
- Line 1: `"Scan a live URL or your repo"` — `text-foreground/70 font-medium tracking-wide`
- Line 2: `"Find leaked secrets and OWASP holes. Merge the AI fix."` — ShinyText: `color=#7dd3d8`, `shineColor=#00f3ff`

---

### 3.4 Tab Switcher

**컨테이너**: `flex gap-1 glass rounded-md sm:lg p-0.5 sm:p-1 w-fit mx-auto mb-4`

| 상태 | 스타일 |
|---|---|
| 활성 탭 | `bg-neon-cyan/20 text-neon-cyan` |
| 비활성 탭 | `text-muted-foreground hover:text-foreground` |
| 공통 | `flex items-center gap-2 px-4 py-2 rounded-md text-xs sm:sm font-medium min-h-[36px] sm:min-h-[44px]` |

아이콘: Globe (URL 탭) / Github (GitHub 탭) — 14px sm:16px

---

### 3.5 Scan Input Box

**외부 래퍼**:
```css
glass-strong rounded-xl sm:rounded-2xl p-2
/* 포커스 시 */
neon-border neon-glow
/* 아이들 시 */
scan-input-idle (3s ease-in-out 펄스 애니메이션)
```

**내부 레이아웃**: `flex flex-col sm:flex-row sm:items-center gap-2`

**좌측 영역**:
- 아이콘 (Globe or Github): `px-4 py-2 text-muted-foreground`
- 스캔 카운터 (무료 플랜): `text-sm sm:lg font-semibold tabular-nums` + 한도 초과 시 `text-red-400`
- 입력: `bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground text-sm sm:lg py-2`

**Scan 버튼**:
```css
bg-neon-cyan text-background hover:bg-neon-cyan/90
font-semibold px-6 py-2 sm:py-4
rounded-lg sm:rounded-xl text-sm sm:base
min-h-[40px] sm:min-h-[48px]
w-full sm:w-auto
disabled:opacity-50 disabled:cursor-not-allowed
```
- 로딩 시: 스피너 + "Loading..." 텍스트
- 기본: `Zap` 아이콘 + "Start Free Scan"

---

### 3.6 조건부 UI (Input 하단)

| 조건 | UI |
|---|---|
| Vercel preview URL 감지 | 노란/안내 텍스트 + "Connect Vercel" 링크 |
| 로그인 + auth 확인 중 | 스켈레톤 펄스 (`animate-pulse`) — Github 아이콘 + "Checking integrations..." |
| URL탭 + GitHub 연결됨 | `RepoSelector` 드롭다운 (mt-3) |
| URL탭 + 로그인 + GitHub 미연결 | 연결 배너: `border border-neon-cyan/20 bg-neon-cyan/5` + Connect 버튼 |
| GitHub탭 + 비로그인 | `Lock` 아이콘 + "Sign in to scan a repository" (우측 정렬, xs) |
| GitHub탭 + 로그인 + GitHub 미연결 | 연결 배너 (위와 동일 스타일) |

**연결 배너 스타일**:
```css
flex items-center gap-3 rounded-xl
border border-neon-cyan/20 bg-neon-cyan/5
px-4 py-3 mt-3
```
Connect 버튼: `border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-2 text-sm text-neon-cyan rounded-lg`

---

### 3.7 Live Stats & 예시 버튼

**Live Stats** (스캔 데이터 있을 때):
```
[1,234] sites scanned · [567] vulnerabilities found
```
- `text-xs sm:sm text-muted-foreground mt-4 tabular-nums`
- 숫자: `text-foreground/80 font-semibold`

**Try 예시 버튼** (비로그인 + authResolved):
```
Try  [http://demo.testfire.net]  [https://ginandjuice.shop]
```
- `gap-2 sm:gap-3 mt-2 sm:mt-3 flex-wrap justify-center`
- 버튼: `text-xs sm:sm px-3 py-1.5 rounded-lg border border-neon-cyan/20 text-neon-cyan/80`
- hover: `text-neon-cyan border-neon-cyan/40 bg-neon-cyan/5`
- 두 번째 예시는 `hidden sm:inline-flex`

---

### 3.8 Feature Cards (4개)

**그리드**: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto mt-8 sm:mt-16`

**카드 스타일**:
```css
glass rounded-2xl p-6 flex flex-col
hover:bg-white/[0.04] transition-colors group
```

**카드 내부 구성**:
```
[아이콘 배경박스 w-12 h-12 rounded-xl bg-neon-cyan/10 mb-4]
[아이콘 w-6 h-6 text-neon-cyan]
  (group-hover: bg-neon-cyan/20)

[제목] text-lg font-semibold text-foreground mb-2
[설명] text-sm text-muted-foreground leading-relaxed flex-1
[CTA 링크?] text-xs text-neon-cyan mt-4 min-h-[44px] (MCP 카드만)
```

**4개 카드 내용**:

| 아이콘 | 제목 | 설명 | CTA |
|---|---|---|---|
| `Shield` | Vulnerability Scanning | Deep analysis... AI-powered | — |
| `Lock` | API Key Detection | Find exposed secrets... | — |
| `Sparkles` | AI Fix + Auto PR | AI analyzes root cause... | — |
| `Bot` | MCP Agent | Integrate into Claude Code... | "Set Up →" → `/mcp` |

---

## 4. 스크롤 하단 섹션 (페이드인)

**트리거**: `window.scrollY > window.innerHeight * 0.5`  
**애니메이션**: `opacity: 0→1, y: 40→0`, duration 0.5s easeOut

---

### 4.1 How It Works

**헤딩**: `text-2xl sm:3xl font-bold text-foreground text-center mb-10`  
**그리드**: `grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl mx-auto mt-20 sm:mt-28`

**스텝 카드** (glass rounded-2xl p-6, 중앙 정렬, flex-col):
```
[아이콘박스 w-12 h-12 bg-neon-cyan/10 rounded-xl mb-4]
[아이콘 w-6 h-6 text-neon-cyan]

"Step 1"  — text-xs text-neon-cyan font-semibold mb-1
[제목]    — text-lg font-semibold text-foreground mb-2
[설명]    — text-sm text-muted-foreground leading-relaxed
```

| Step | 아이콘 | 제목 | 설명 |
|---|---|---|---|
| 1 | Globe | Enter URL or Repo | Paste any URL or GitHub repo... |
| 2 | Shield | AI Scans 10,000+ Patterns | Nuclei DAST, Semgrep SAST... |
| 3 | Zap | Get Fix Code + PR | AI generates fix code... |

각 카드 `whileInView` 진입: `opacity: 0→1, y: 16→0`, delay i×0.1s

---

### 4.2 Comparison Table

**헤딩**: `text-2xl sm:3xl font-bold text-center mb-10`  
**테이블 래퍼**: `overflow-x-auto rounded-2xl`, 내부 `min-w-[680px]`

**테이블 스타일**: `glass rounded-2xl text-sm w-full`

**헤더 행**:
- 기능 열: `text-left p-4 text-muted-foreground font-medium`
- 광주 보안관: `p-4 text-neon-cyan font-semibold`
- 나머지: `p-4 text-muted-foreground font-medium`
- 구분: `border-b border-white/10`

**데이터 행**: `border-b border-white/5 last:border-b-0`
- ✓ (우리): `CheckCircle2 w-5 h-5 text-neon-cyan mx-auto`
- ✓ (경쟁사): `CheckCircle2 w-5 h-5 text-white/40 mx-auto`
- ✗: `— text-white/20`

**8개 비교 행**:
- URL Scan (DAST)
- Vulnerability Scan
- Secret Detection
- AI Fix Code
- Auto-Fix PR
- Scheduled Scans
- MCP / IDE Integration
- Free Tier

**하단 링크**: `"Learn more about our security approach →"` → `/why-trust`

---

### 4.3 Social Proof Stats (4개)

**그리드**: `grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6`  
**카드**: `glass rounded-2xl p-6 text-center`  
**진입**: `opacity: 0→1, scale: 0.95→1`, delay i×0.08s

| 값 | 레이블 |
|---|---|
| `10,000+` | Vulnerability Templates |
| `37+` | Detection Patterns |
| `8` | MCP Tools |
| `<2 min` | Average Scan Time |

값: `text-2xl sm:3xl font-bold text-neon-cyan mb-1`  
레이블: `text-xs sm:sm text-muted-foreground`

---

### 4.4 Bottom CTA

**컨테이너**: `max-w-3xl mx-auto mt-20 sm:mt-28 mb-8 text-center`

```
[헤딩] text-2xl sm:4xl font-bold mb-4
"Try a URL scan in 30 seconds"

[서브] text-muted-foreground mb-8
"No signup needed. Just paste a link."

[버튼 행]
[Zap 아이콘] Start Free Scan ↑   |   View Pricing →
```

**Primary 버튼**: `bg-neon-cyan text-background hover:bg-neon-cyan/90 font-semibold px-8 py-3 rounded-xl text-base min-h-[48px]`  
**Secondary 버튼**: `border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10 px-6 py-3 rounded-xl min-h-[48px]`

---

## 5. Footer

**레이아웃**: `border-t border-white/8 py-4 sm:py-6 px-4 sm:px-6`  
**내부**: `max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground`

**좌측**: `© 2026 광주 보안관`

**우측 링크**: 요금제 / 광주 보안관 소개 / 이용약관 / 개인정보  
- 각 링크: `hover:text-foreground transition-colors py-2 px-4 min-h-[44px] inline-flex items-center`

---

## 6. 애니메이션 요약

| 요소 | 진입 | 딜레이 |
|---|---|---|
| 로고 | `opacity 0→1` | 0s |
| 네비 | `opacity 0→1` | 0.05s |
| Badge | `opacity 0→1, y 16→0` | 0.1s |
| Headline | 동일 | 0.1s |
| Sub-headline | `opacity 0→1, y 10→0` | 0.15s |
| Tab Switcher | `opacity 0→1, y 10→0` | 0.2s |
| Input Box | `opacity 0→1, y 10→0` | 0.25s |
| Try 예시 | `opacity 0→1` | 0.3s |
| Feature Cards | `opacity 0→1, y 16→0` | 0.35s |
| 하단 섹션들 | `whileInView` 개별 | — |

**페이지 전환**: `AnimatePresence mode="wait"`, landing↔scanning↔dashboard 슬라이드/페이드

---

## 7. 반응형 브레이크포인트 (Tailwind 기준)

| 구간 | 변화 |
|---|---|
| 기본(모바일) | 1열 레이아웃, 작은 패딩 |
| `sm` (640px~) | 2열 그리드, 큰 글씨, 가로 인풋 레이아웃 |
| `md` (768px~) | 헤더 패딩 `px-12`, 헤드라인 줄바꿈 표시 |
| `lg` (1024px~) | 4열 Feature 그리드 / Stats 그리드 |

---

## 8. 접근성 포인트

- Tab Switcher: `role="tablist"` + `aria-selected` + `aria-controls`
- Input 패널: `role="tabpanel"` + `aria-label`
- Scan 버튼: `aria-label="Start security scan"`
- 에러 메시지: `role="alert"`
- 아이콘 전용 요소: `aria-hidden="true"`
- 터치 타깃 최소 높이: `min-h-[44px]`
