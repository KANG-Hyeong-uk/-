export type Lang = "en" | "ko";

export interface Dict {
  hero: {
    badge: string;
    headlineLine1A: string;
    headlineLine1B: string;
    headlineLine2: string;
    subLine1: string;
    subLine2: string;
    urlTab: string;
    repoTab: string;
    urlPlaceholder: string;
    repoPlaceholder: string;
    repoPickerPlaceholder: string;
    repoPickerLabel: string;
    repoPickerOptional: string;
    startFreeScan: string;
    loading: string;
    urlAriaLabel: string;
    repoAriaLabel: string;
    sitesScannedSuffix: string;
    vulnsFoundSuffix: string;
    tryLabel: string;
    signInToScanRepoFull: string;
    signInToScanRepoShort: string;
    connectGithub: string;
    connectGithubUrlReason: string;
    connectGithubRepoReason: string;
    connectButton: string;
    connectingButton: string;
    checkingIntegrations: string;
    checkingIntegrationsSub: string;
    previewUrlFull: string;
    previewUrlShort: string;
    connectVercel: string;
    connectingVercel: string;
    vercelHintTail: string;
    vercelHintTailShort: string;
  };
  features: {
    vuln: { title: string; description: string };
    secret: { title: string; description: string };
    aiFix: { title: string; description: string };
    mcp: { title: string; description: string; cta: string };
  };
  howItWorks: {
    heading: string;
    step: string;
    step1: { title: string; description: string };
    step2: { title: string; description: string };
    step3: { title: string; description: string };
  };
  comparison: {
    heading: string;
    featureCol: string;
    learnMore: string;
    rows: {
      urlDast: string;
      vulnScan: string;
      secret: string;
      aiFix: string;
      autoPr: string;
      scheduled: string;
      mcp: string;
      freeTier: string;
    };
  };
  socialProof: {
    templates: string;
    patterns: string;
    mcpTools: string;
    avgScan: string;
  };
  bottomCta: {
    heading: string;
    sub: string;
    startFreeScan: string;
    viewPricing: string;
  };
  footer: {
    copyright: string;
    pricing: string;
    whyTrust: string;
    terms: string;
    privacy: string;
  };
  goPro: string;
}

export const dict: Record<Lang, Dict> = {
  en: {
    hero: {
      badge: "AI-Native Security · URL + Code · 30-sec start",
      headlineLine1A: "AI Code,",
      headlineLine1B: "Trusted",
      headlineLine2: "in 60 Seconds",
      subLine1: "Scan a live URL or your repo",
      subLine2: "Find leaked secrets and OWASP holes. Merge the AI fix.",
      urlTab: "URL Scan",
      repoTab: "GitHub Repo",
      urlPlaceholder: "Enter URL to scan...",
      repoPlaceholder: "owner/repo or github.com/...",
      repoPickerPlaceholder: "Pick a repo to scan…",
      repoPickerLabel: "Pick your repo",
      repoPickerOptional: "Optional — scan just this URL",
      startFreeScan: "Start Free Scan",
      loading: "Loading...",
      urlAriaLabel: "URL to scan",
      repoAriaLabel: "GitHub repository URL or owner/repo",
      sitesScannedSuffix: " sites scanned · ",
      vulnsFoundSuffix: " vulnerabilities found",
      tryLabel: "Try",
      signInToScanRepoFull: "Sign in to scan a repository",
      signInToScanRepoShort: "Sign in to scan",
      connectGithub: "Connect GitHub",
      connectGithubUrlReason: "For deeper page scans.",
      connectGithubRepoReason: "Pick from your repos.",
      connectButton: "Connect",
      connectingButton: "Connecting…",
      checkingIntegrations: "Checking integrations…",
      checkingIntegrationsSub: "GitHub & Vercel.",
      previewUrlFull: "Looks like a preview URL.",
      previewUrlShort: "Preview URL —",
      connectVercel: "Connect Vercel",
      connectingVercel: "Connecting Vercel…",
      vercelHintTail: "to use your real production domain.",
      vercelHintTailShort: "for production domain",
    },
    features: {
      vuln: {
        title: "Vulnerability Scanning",
        description: "Deep analysis of your codebase for security vulnerabilities using AI-powered detection.",
      },
      secret: {
        title: "API Key Detection",
        description: "Find exposed secrets, API keys, and credentials before they become a breach.",
      },
      aiFix: {
        title: "AI Fix + Auto PR",
        description: "AI analyzes root cause, generates fix code, and creates a GitHub PR — all in one click.",
      },
      mcp: {
        title: "MCP Agent",
        description: "Integrate Gwangju Security into Claude Code or Cursor. Run scans without leaving your IDE.",
        cta: "Set Up →",
      },
    },
    howItWorks: {
      heading: "How It Works",
      step: "Step",
      step1: {
        title: "Enter URL or Repo",
        description: "Paste any website URL or GitHub repository. No setup, no CLI, no config files.",
      },
      step2: {
        title: "AI Scans 10,000+ Patterns",
        description: "Nuclei DAST, Semgrep SAST, Gitleaks secrets, and dependency audit — all at once.",
      },
      step3: {
        title: "Get Fix Code + PR",
        description: "AI generates fix code with before/after diffs and can open a GitHub PR automatically.",
      },
    },
    comparison: {
      heading: "Gwangju Security vs. Alternatives",
      featureCol: "Feature",
      learnMore: "Learn more about our security approach",
      rows: {
        urlDast: "URL Scan (DAST)",
        vulnScan: "Vulnerability Scan",
        secret: "Secret Detection",
        aiFix: "AI Fix Code",
        autoPr: "Auto-Fix PR",
        scheduled: "Scheduled Scans",
        mcp: "MCP / IDE Integration",
        freeTier: "Free Tier",
      },
    },
    socialProof: {
      templates: "Vulnerability Templates",
      patterns: "Detection Patterns",
      mcpTools: "MCP Tools",
      avgScan: "Average Scan Time",
    },
    bottomCta: {
      heading: "Try a URL scan in 30 seconds",
      sub: "No signup needed. Just paste a link.",
      startFreeScan: "Start Free Scan ↑",
      viewPricing: "View Pricing →",
    },
    footer: {
      copyright: "© 2026 Gwangju Security",
      pricing: "Pricing",
      whyTrust: "Why Gwangju Security",
      terms: "Terms",
      privacy: "Privacy",
    },
    goPro: "Go Pro",
  },
  ko: {
    hero: {
      badge: "AI 코드 · URL+레포 · 30초 시작",
      headlineLine1A: "AI로 만든 코드,",
      headlineLine1B: "60초 안에",
      headlineLine2: "점검합니다",
      subLine1: "라이브 URL이나 레포를 스캔합니다",
      subLine2: "시크릿 누출과 OWASP 취약점을 찾습니다. AI 수정 PR은 자동.",
      urlTab: "URL 스캔",
      repoTab: "GitHub 레포",
      urlPlaceholder: "스캔할 URL을 입력하세요...",
      repoPlaceholder: "owner/repo 또는 github.com/...",
      repoPickerPlaceholder: "스캔할 레포를 선택하세요…",
      repoPickerLabel: "내 레포 선택",
      repoPickerOptional: "선택 사항 — 이 URL만 스캔",
      startFreeScan: "무료 스캔 시작",
      loading: "불러오는 중...",
      urlAriaLabel: "스캔할 URL",
      repoAriaLabel: "GitHub 레포지토리 URL 또는 owner/repo",
      sitesScannedSuffix: "개 사이트 스캔 완료 · ",
      vulnsFoundSuffix: "개 취약점 발견",
      tryLabel: "예시",
      signInToScanRepoFull: "레포 스캔하려면 로그인",
      signInToScanRepoShort: "로그인 후 스캔",
      connectGithub: "GitHub 연결",
      connectGithubUrlReason: "더 깊은 페이지 스캔용.",
      connectGithubRepoReason: "내 레포 목록에서 선택.",
      connectButton: "연결",
      connectingButton: "연결 중…",
      checkingIntegrations: "연동 확인 중…",
      checkingIntegrationsSub: "GitHub & Vercel.",
      previewUrlFull: "프리뷰 URL 같습니다.",
      previewUrlShort: "프리뷰 URL —",
      connectVercel: "Vercel 연결",
      connectingVercel: "Vercel 연결 중…",
      vercelHintTail: "실제 프로덕션 도메인을 사용하세요.",
      vercelHintTailShort: "프로덕션 도메인",
    },
    features: {
      vuln: {
        title: "취약점 스캔",
        description: "AI 기반 탐지로 코드베이스의 보안 취약점을 깊이 분석합니다.",
      },
      secret: {
        title: "API 키 탐지",
        description: "노출된 시크릿·API 키·자격증명을 사고가 터지기 전에 찾아냅니다.",
      },
      aiFix: {
        title: "AI 수정 + 자동 PR",
        description: "AI가 원인을 분석하고, 수정 코드를 생성하고, GitHub PR까지 한 번에 만듭니다.",
      },
      mcp: {
        title: "MCP 에이전트",
        description: "Claude Code나 Cursor에 광주 보안관을 연결하세요. IDE에서 바로 스캔 실행.",
        cta: "설치하기 →",
      },
    },
    howItWorks: {
      heading: "사용 방법",
      step: "단계",
      step1: {
        title: "URL 또는 레포 입력",
        description: "웹사이트 URL이나 GitHub 레포를 붙여넣으세요. 설치도, CLI도, 설정 파일도 없습니다.",
      },
      step2: {
        title: "AI가 10,000+ 패턴을 점검",
        description: "Nuclei DAST, Semgrep SAST, Gitleaks 시크릿, 의존성 감사 — 한 번에 모두.",
      },
      step3: {
        title: "수정 코드 + PR 받기",
        description: "AI가 before/after 디프와 함께 수정 코드를 생성하고, GitHub PR도 자동으로 열어줍니다.",
      },
    },
    comparison: {
      heading: "광주 보안관 vs. 다른 도구들",
      featureCol: "기능",
      learnMore: "광주 보안관의 보안 접근법 자세히 보기",
      rows: {
        urlDast: "URL 스캔 (DAST)",
        vulnScan: "취약점 스캔",
        secret: "시크릿 탐지",
        aiFix: "AI 수정 코드",
        autoPr: "자동 수정 PR",
        scheduled: "예약 스캔",
        mcp: "MCP / IDE 연동",
        freeTier: "무료 플랜",
      },
    },
    socialProof: {
      templates: "취약점 템플릿",
      patterns: "탐지 패턴",
      mcpTools: "MCP 도구",
      avgScan: "평균 스캔 시간",
    },
    bottomCta: {
      heading: "URL 스캔, 30초면 끝납니다",
      sub: "가입 없이도 가능. 링크만 붙여넣으세요.",
      startFreeScan: "무료 스캔 시작 ↑",
      viewPricing: "요금제 보기 →",
    },
    footer: {
      copyright: "© 2026 광주 보안관",
      pricing: "요금제",
      whyTrust: "광주 보안관 소개",
      terms: "이용약관",
      privacy: "개인정보",
    },
    goPro: "Pro 시작",
  },
};

export function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem("trust_lang");
    if (saved === "en" || saved === "ko") return saved;
  } catch {
    // localStorage may throw in incognito or with disabled storage
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav && nav.toLowerCase().startsWith("ko") ? "ko" : "en";
}
