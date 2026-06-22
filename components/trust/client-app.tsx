"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LazyMotion, domAnimation, m, AnimatePresence } from "framer-motion";
import { LandingView } from "@/components/trust/landing-view";
import { ScanningView } from "@/components/trust/scanning-view";
import { DashboardView } from "@/components/trust/dashboard-view";
import { MCPView } from "@/components/trust/mcp-view";
import type { ScanResult, RepoScanResult } from "@/lib/types";
import { startScan, getScanStatus, startRepoScan, getRepoScanStatus, APIError } from "@/lib/api";
import { trackScanStarted, trackScanCompleted } from "@/lib/analytics";
import { useSubscription } from "@/lib/subscription";
import { useNotifications } from "@/components/trust/NotificationToggle";
import { PaddleLoader } from "@/components/trust/PaddleLoader";

const DEMO_URL = "https://www.lingscars.com/";
const DEMO_SCAN_ID = "demo-lingscars-2024";

const DEMO_RESULT: ScanResult = {
  scan_id: DEMO_SCAN_ID,
  status: "completed",
  target_url: DEMO_URL,
  progress: 100,
  current_stage: "complete",
  score: 21,
  grade: "F",
  summary: { critical: 3, high: 4, medium: 3, low: 2, info: 0 },
  vulnerabilities: [
    {
      id: "vuln-001",
      template_id: "xss-reflected",
      name: "Reflected Cross-Site Scripting (XSS)",
      severity: "critical",
      matched_at: "https://www.lingscars.com/search?q=test",
      extracted_results: ["<script>alert(1)</script>"],
      ai_analyzed: true,
      is_fixed: false,
      category: "exposure",
      description:
        "검색 쿼리 파라미터(q)에 입력된 사용자 값이 별도의 이스케이프 처리 없이 HTML 응답에 그대로 반영됩니다. 공격자는 이를 이용해 피해자 브라우저에서 임의의 JavaScript를 실행할 수 있습니다.",
      impact:
        "세션 쿠키 탈취, 피싱 페이지로 리다이렉트, 관리자 계정 탈취, 페이지 위·변조 등 광범위한 피해가 발생할 수 있습니다.",
      before_code:
        "// 취약한 코드 — 입력값 그대로 출력\nconst query = req.query.q;\nres.send(`<h1>검색 결과: ${query}</h1>`);",
      after_code:
        "// 수정된 코드 — HTML 인코딩 적용\nimport { escapeHtml } from 'your-escape-lib';\nconst query = escapeHtml(req.query.q);\nres.send(`<h1>검색 결과: ${query}</h1>`);",
      fix_steps: [
        "모든 사용자 입력 값을 HTML에 출력하기 전 반드시 엔티티 인코딩을 적용하세요.",
        "Content-Security-Policy(CSP) 헤더를 설정하여 인라인 스크립트 실행을 차단하세요.",
        "Nunjucks, Handlebars 등 자동 이스케이프를 지원하는 템플릿 엔진 사용을 권장합니다.",
      ],
      fix_complexity: "simple",
      reference_urls: ["https://owasp.org/www-community/attacks/xss/"],
    },
    {
      id: "vuln-002",
      template_id: "sql-injection",
      name: "SQL Injection via Query Parameter",
      severity: "critical",
      matched_at: "https://www.lingscars.com/cars?id=1'",
      extracted_results: ["MySQL error: You have an error in your SQL syntax"],
      ai_analyzed: true,
      is_fixed: false,
      category: "exposure",
      description:
        "URL 파라미터(id)에 단따옴표(')를 삽입했을 때 MySQL 오류 메시지가 노출됩니다. 쿼리에 사용자 입력이 직접 연결(concatenation)되어 SQL Injection이 가능한 상태입니다.",
      impact:
        "공격자가 데이터베이스 전체를 열람·수정·삭제할 수 있으며, 서버 파일 시스템 접근 또는 원격 코드 실행으로 이어질 수 있습니다.",
      before_code:
        "// 취약한 코드 — 파라미터 직접 연결\n$id = $_GET['id'];\n$sql = \"SELECT * FROM cars WHERE id = \" . $id;",
      after_code:
        "// 수정된 코드 — Prepared Statement 사용\n$stmt = $pdo->prepare('SELECT * FROM cars WHERE id = ?');\n$stmt->execute([$_GET['id']]);",
      fix_steps: [
        "모든 DB 쿼리에 Prepared Statement(바인딩 파라미터)를 적용하세요.",
        "ORM(Eloquent, Hibernate 등)을 사용하면 SQL Injection 위험을 근본적으로 제거할 수 있습니다.",
        "DB 계정 권한을 최소화하고, 오류 메시지가 외부에 노출되지 않도록 설정하세요.",
      ],
      fix_complexity: "moderate",
      reference_urls: ["https://owasp.org/www-community/attacks/SQL_Injection"],
    },
    {
      id: "vuln-003",
      template_id: "php-eol-version",
      name: "End-of-Life PHP Version Detected (PHP 7.2)",
      severity: "critical",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["X-Powered-By: PHP/7.2.34"],
      ai_analyzed: true,
      is_fixed: false,
      category: "cve",
      description:
        "서버가 2020년 11월 지원 종료(EOL)된 PHP 7.2를 사용하고 있습니다. 해당 버전에는 패치되지 않은 다수의 CVE가 존재하며, 공개 익스플로잇도 활발히 유포되고 있습니다.",
      impact:
        "이미 알려진 취약점을 이용한 원격 코드 실행, 서비스 거부(DoS), 정보 유출 공격에 노출되어 있습니다.",
      before_code:
        "# 현재 상태\nX-Powered-By: PHP/7.2.34  # EOL — 보안 패치 없음",
      after_code:
        "# 권장 조치\n# PHP 8.2 이상으로 업그레이드\n# X-Powered-By 헤더 노출도 제거 필요\nexpose_php = Off",
      fix_steps: [
        "PHP를 현재 지원 중인 버전(8.2 이상)으로 즉시 업그레이드하세요.",
        "php.ini에서 expose_php = Off 설정으로 버전 정보 노출을 차단하세요.",
        "업그레이드 전 코드 호환성을 스테이징 환경에서 충분히 검증하세요.",
      ],
      fix_complexity: "complex",
      reference_urls: ["https://www.php.net/supported-versions.php"],
    },
    {
      id: "vuln-004",
      template_id: "ssl-tls-weak-cipher",
      name: "Weak TLS Cipher Suite Negotiation",
      severity: "high",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["TLS_RSA_WITH_RC4_128_SHA", "TLS_RSA_WITH_3DES_EDE_CBC_SHA"],
      ai_analyzed: true,
      is_fixed: false,
      category: "misconfig",
      description:
        "서버가 암호학적으로 취약한 RC4, 3DES 암호화 스위트를 허용하고 있습니다. 이는 BEAST, SWEET32 등의 알려진 공격에 취약한 상태입니다.",
      impact:
        "충분한 자원을 가진 공격자가 암호화된 트래픽을 복호화하여 비밀번호, 세션 토큰, 개인정보를 탈취할 수 있습니다.",
      before_code:
        "# Nginx — 레거시 암호화 스위트 허용\nssl_ciphers ALL:!aNULL:!eNULL;\nssl_protocols TLSv1 TLSv1.1 TLSv1.2;",
      after_code:
        "# 수정된 설정 — 최신 암호화 스위트만 허용\nssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;\nssl_protocols TLSv1.2 TLSv1.3;\nssl_prefer_server_ciphers on;",
      fix_steps: [
        "SSLv3, TLSv1.0, TLSv1.1을 웹 서버 설정에서 비활성화하세요.",
        "ECDHE/GCM 계열 암호화 스위트(TLS 1.2/1.3)만 허용하도록 설정하세요.",
        "SSL Labs(ssllabs.com/ssltest)로 설정을 검증하여 A+ 등급을 목표로 하세요.",
      ],
      fix_complexity: "moderate",
      reference_urls: ["https://cheatsheetseries.owasp.org/cheatsheets/TLS_Cipher_String_Cheat_Sheet.html"],
    },
    {
      id: "vuln-005",
      template_id: "http-missing-security-headers",
      name: "Missing HTTP Security Headers",
      severity: "high",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["X-Frame-Options", "Content-Security-Policy", "Strict-Transport-Security"],
      ai_analyzed: true,
      is_fixed: false,
      category: "misconfig",
      description:
        "HTTP 응답에 X-Frame-Options, Content-Security-Policy, Strict-Transport-Security 등 필수 보안 헤더가 누락되어 있습니다. 이는 클릭재킹, MIME 스니핑, HTTP 다운그레이드 공격에 노출됩니다.",
      impact:
        "X-Frame-Options 누락 시 공격자 사이트의 iframe에 페이지를 삽입해 클릭재킹 공격이 가능합니다. CSP 누락은 XSS 공격의 피해 범위를 크게 확대합니다.",
      before_code:
        "# 보안 헤더 없음\nHTTP/1.1 200 OK\nContent-Type: text/html",
      after_code:
        "# 권장 보안 헤더 추가\nHTTP/1.1 200 OK\nContent-Type: text/html\nStrict-Transport-Security: max-age=31536000; includeSubDomains\nX-Frame-Options: DENY\nX-Content-Type-Options: nosniff\nContent-Security-Policy: default-src 'self'",
      fix_steps: [
        "Strict-Transport-Security(HSTS)를 max-age 1년 이상으로 설정하세요.",
        "X-Frame-Options를 DENY로 설정하거나 CSP frame-ancestors 지시문을 활용하세요.",
        "X-Content-Type-Options: nosniff를 추가해 MIME 타입 스니핑을 방지하세요.",
        "Content-Security-Policy를 정의해 스크립트·스타일·미디어 출처를 제한하세요.",
      ],
      fix_complexity: "simple",
      reference_urls: ["https://securityheaders.com/"],
    },
    {
      id: "vuln-006",
      template_id: "cors-misconfig",
      name: "CORS Wildcard Misconfiguration",
      severity: "high",
      matched_at: "https://www.lingscars.com/api/cars",
      extracted_results: ["Access-Control-Allow-Origin: *", "Access-Control-Allow-Credentials: true"],
      ai_analyzed: true,
      is_fixed: false,
      category: "misconfig",
      description:
        "API 엔드포인트에서 Access-Control-Allow-Origin: * 와 Access-Control-Allow-Credentials: true가 동시에 설정되어 있습니다. 이는 CORS 스펙상 무효한 조합으로, 모든 출처의 인증 요청을 허용하는 심각한 오설정입니다.",
      impact:
        "악성 웹사이트가 피해자의 브라우저를 통해 쿠키·세션 토큰을 포함한 인증 요청을 이 API로 전송하고 응답을 읽어갈 수 있습니다.",
      before_code:
        "# 잘못된 CORS 설정\nAccess-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true",
      after_code:
        "# 수정된 설정 — 명시적 출처 허용\nAccess-Control-Allow-Origin: https://www.lingscars.com\nAccess-Control-Allow-Credentials: true\nVary: Origin",
      fix_steps: [
        "Access-Control-Allow-Origin에 와일드카드(*) 대신 신뢰할 수 있는 출처를 명시적으로 지정하세요.",
        "Credentials를 허용해야 한다면 요청의 Origin 헤더를 서버에서 검증한 후 동적으로 반환하세요.",
        "Vary: Origin 헤더를 추가해 캐시 오염을 방지하세요.",
      ],
      fix_complexity: "moderate",
      reference_urls: ["https://developer.mozilla.org/ko/docs/Web/HTTP/CORS"],
    },
    {
      id: "vuln-007",
      template_id: "exposed-admin-panel",
      name: "Exposed Admin / CMS Login Panel",
      severity: "medium",
      matched_at: "https://www.lingscars.com/wp-admin/",
      extracted_results: ["WordPress login form detected at /wp-admin/"],
      ai_analyzed: true,
      is_fixed: false,
      category: "exposure",
      description:
        "WordPress 관리자 로그인 페이지(/wp-admin/)가 IP 제한이나 추가 인증 없이 외부에 공개되어 있습니다. 자동화된 브루트포스 및 크리덴셜 스터핑 공격의 주요 대상이 됩니다.",
      impact:
        "공격자가 자동화 도구로 비밀번호 추측 공격을 시도할 수 있으며, 로그인 성공 시 사이트 전체를 완전히 장악합니다.",
      before_code:
        "# Nginx — wp-admin 제한 없음\nlocation /wp-admin/ {\n  # 모든 접근 허용\n}",
      after_code:
        "# Nginx — 허용 IP만 접근 가능\nlocation /wp-admin/ {\n  allow 203.0.113.0/24;\n  deny all;\n}",
      fix_steps: [
        "웹 서버 또는 WAF에서 /wp-admin/ 접근을 허용된 IP 대역으로만 제한하세요.",
        "모든 관리자 계정에 2단계 인증(2FA)을 적용하세요.",
        "WPS Hide Login 등의 플러그인으로 관리자 URL을 변경하는 것을 고려하세요.",
        "로그인 실패 횟수 제한 및 계정 잠금 정책을 구현하세요.",
      ],
      fix_complexity: "moderate",
      reference_urls: ["https://wordpress.org/documentation/article/hardening-wordpress/"],
    },
    {
      id: "vuln-008",
      template_id: "directory-listing",
      name: "Directory Listing Enabled",
      severity: "medium",
      matched_at: "https://www.lingscars.com/images/",
      extracted_results: ["Index of /images/", "Parent Directory"],
      ai_analyzed: true,
      is_fixed: false,
      category: "exposure",
      description:
        "웹 서버에서 디렉토리 인덱싱이 활성화되어 있어 /images/ 경로의 파일 목록이 외부에 그대로 노출됩니다. 공격자가 서버 구조와 민감한 파일 경로를 파악하는 데 활용될 수 있습니다.",
      impact:
        "내부 파일명, 디렉토리 구조, 백업 파일 등이 노출되어 추가 공격의 발판이 됩니다. 설정 파일이나 로그 파일이 포함된 경우 직접적인 정보 유출로 이어질 수 있습니다.",
      before_code:
        "# Apache — 디렉토리 목록 허용\n<Directory /var/www/html/images>\n  Options Indexes FollowSymLinks\n</Directory>",
      after_code:
        "# 수정된 설정 — 목록 비활성화\n<Directory /var/www/html/images>\n  Options -Indexes FollowSymLinks\n</Directory>",
      fix_steps: [
        "Apache의 경우 Options -Indexes를 설정해 디렉토리 목록을 비활성화하세요.",
        "Nginx의 경우 autoindex off; 를 server 또는 location 블록에 추가하세요.",
        "불필요한 파일(백업, 로그 등)은 웹 루트 외부로 이동하세요.",
      ],
      fix_complexity: "simple",
      reference_urls: ["https://owasp.org/www-project-web-security-testing-guide/"],
    },
    {
      id: "vuln-009",
      template_id: "outdated-jquery",
      name: "Outdated jQuery with Known CVEs (v1.8.3)",
      severity: "medium",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["jquery/1.8.3/jquery.min.js"],
      ai_analyzed: true,
      is_fixed: false,
      category: "cve",
      description:
        "2012년에 출시된 jQuery 1.8.3이 사용되고 있습니다. 해당 버전에는 CVE-2015-9251(XSS), CVE-2019-11358(Prototype Pollution) 등 다수의 공개 취약점이 존재합니다.",
      impact:
        "알려진 CVE를 이용한 XSS, 프로토타입 오염 공격이 가능하며, 공개된 익스플로잇 코드를 활용한 자동화 공격에 노출됩니다.",
      before_code:
        "<!-- 취약한 jQuery 버전 로드 -->\n<script src=\"/js/jquery-1.8.3.min.js\"></script>",
      after_code:
        "<!-- 최신 jQuery 또는 SRI 해시 적용 -->\n<script\n  src=\"https://code.jquery.com/jquery-3.7.1.min.js\"\n  integrity=\"sha384-...\"\n  crossorigin=\"anonymous\"></script>",
      fix_steps: [
        "jQuery를 3.7.1 이상 최신 버전으로 업그레이드하세요.",
        "CDN을 사용하는 경우 Subresource Integrity(SRI) 해시를 반드시 추가하세요.",
        "npm audit 또는 Dependabot을 활용해 의존성 취약점을 정기적으로 모니터링하세요.",
      ],
      fix_complexity: "simple",
      reference_urls: ["https://blog.jquery.com/2019/04/10/jquery-3-4-0-released/"],
    },
    {
      id: "vuln-010",
      template_id: "cookie-no-httponly",
      name: "Session Cookie Missing HttpOnly & Secure Flags",
      severity: "low",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["Set-Cookie: PHPSESSID=abc123; path=/"],
      ai_analyzed: true,
      is_fixed: false,
      category: "misconfig",
      description:
        "세션 쿠키에 HttpOnly 플래그가 설정되지 않아 JavaScript에서 document.cookie로 접근 가능합니다. XSS 취약점과 결합되면 세션 하이재킹으로 즉시 이어집니다.",
      impact:
        "XSS 공격이 성공하면 공격자가 세션 쿠키를 탈취해 피해자의 인증 세션을 완전히 장악합니다.",
      before_code:
        "// PHP — HttpOnly 미설정\nsetcookie('PHPSESSID', session_id(), 0, '/');",
      after_code:
        "// 수정된 코드 — HttpOnly + Secure + SameSite 설정\nsetcookie('PHPSESSID', session_id(), [\n  'expires' => 0,\n  'path' => '/',\n  'secure' => true,\n  'httponly' => true,\n  'samesite' => 'Lax',\n]);",
      fix_steps: [
        "모든 세션·인증 쿠키에 HttpOnly 플래그를 추가하세요.",
        "Secure 플래그를 설정해 쿠키가 HTTPS 연결에서만 전송되도록 하세요.",
        "SameSite=Lax 또는 Strict를 설정해 CSRF 공격도 함께 방어하세요.",
      ],
      fix_complexity: "simple",
      reference_urls: ["https://owasp.org/www-community/HttpOnly"],
    },
    {
      id: "vuln-011",
      template_id: "sensitive-data-exposure",
      name: "Server Version Information Disclosure",
      severity: "low",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["Server: Apache/2.2.22 (Ubuntu)", "X-Powered-By: PHP/7.2.34"],
      ai_analyzed: true,
      is_fixed: false,
      category: "exposure",
      description:
        "HTTP 응답 헤더에 웹 서버(Apache 2.2.22)와 언어 런타임(PHP 7.2.34)의 정확한 버전 정보가 노출되고 있습니다. 이는 공격자의 정보 수집(정찰) 단계에서 매우 유용하게 활용됩니다.",
      impact:
        "공격자가 해당 버전에 알려진 CVE를 손쉽게 찾아 표적 공격을 수행할 수 있습니다.",
      before_code:
        "# Apache — 버전 정보 노출\nServerTokens Full\nServerSignature On",
      after_code:
        "# 수정된 설정 — 버전 정보 최소화\nServerTokens Prod\nServerSignature Off\n# php.ini\nexpose_php = Off",
      fix_steps: [
        "Apache: ServerTokens Prod, ServerSignature Off로 변경하세요.",
        "Nginx: server_tokens off; 를 http 블록에 추가하세요.",
        "PHP: php.ini에서 expose_php = Off를 설정하세요.",
      ],
      fix_complexity: "simple",
      reference_urls: ["https://owasp.org/www-project-web-security-testing-guide/"],
    },
    {
      id: "vuln-012",
      template_id: "missing-csp",
      name: "Content Security Policy (CSP) Not Implemented",
      severity: "low",
      matched_at: "https://www.lingscars.com/",
      extracted_results: ["Content-Security-Policy header not found"],
      ai_analyzed: true,
      is_fixed: false,
      category: "misconfig",
      description:
        "Content-Security-Policy 헤더가 전혀 설정되지 않아 브라우저가 출처를 검증하지 않고 모든 스크립트·스타일을 실행합니다. XSS 공격이 성공했을 때 피해를 완화할 마지막 방어선이 없는 상태입니다.",
      impact:
        "CSP가 없으면 XSS 공격자가 외부 악성 스크립트를 자유롭게 로드·실행할 수 있어 피해 범위가 극대화됩니다.",
      before_code:
        "# CSP 헤더 없음\nHTTP/1.1 200 OK\nContent-Type: text/html",
      after_code:
        "# 기본 CSP 정책 추가\nHTTP/1.1 200 OK\nContent-Type: text/html\nContent-Security-Policy: default-src 'self'; script-src 'self' https://trusted.cdn.com; object-src 'none'; frame-ancestors 'none';",
      fix_steps: [
        "우선 Content-Security-Policy: default-src 'self' 로 시작해 가장 엄격한 정책을 적용하세요.",
        "Report-Only 모드(Content-Security-Policy-Report-Only)로 기존 기능 영향도를 먼저 확인하세요.",
        "외부 CDN, 폰트 등 실제로 사용하는 출처만 명시적으로 허용 목록에 추가하세요.",
      ],
      fix_complexity: "moderate",
      reference_urls: ["https://developer.mozilla.org/ko/docs/Web/HTTP/CSP"],
    },
  ],
  score_breakdown: [
    { template_id: "xss-reflected", name: "Reflected XSS", severity: "critical", locations: 3, base_deduction: 20, weight: 1.5, actual_deduction: 20 },
    { template_id: "sql-injection", name: "SQL Injection", severity: "critical", locations: 2, base_deduction: 18, weight: 1.5, actual_deduction: 18 },
    { template_id: "php-eol-version", name: "PHP EOL Version", severity: "critical", locations: 1, base_deduction: 15, weight: 1.5, actual_deduction: 15 },
    { template_id: "ssl-tls-weak-cipher", name: "Weak TLS Ciphers", severity: "high", locations: 1, base_deduction: 10, weight: 1.0, actual_deduction: 10 },
    { template_id: "http-missing-security-headers", name: "Missing Security Headers", severity: "high", locations: 1, base_deduction: 7, weight: 1.0, actual_deduction: 7 },
    { template_id: "cors-misconfig", name: "CORS Wildcard Misconfiguration", severity: "high", locations: 1, base_deduction: 6, weight: 1.0, actual_deduction: 6 },
    { template_id: "exposed-admin-panel", name: "Exposed Admin Panel", severity: "medium", locations: 1, base_deduction: 3, weight: 1.0, actual_deduction: 3 },
    { template_id: "directory-listing", name: "Directory Listing", severity: "medium", locations: 1, base_deduction: 2, weight: 1.0, actual_deduction: 2 },
    { template_id: "outdated-jquery", name: "Outdated jQuery", severity: "medium", locations: 1, base_deduction: 2, weight: 1.0, actual_deduction: 2 },
    { template_id: "cookie-no-httponly", name: "Cookie Missing Flags", severity: "low", locations: 1, base_deduction: 1, weight: 0.5, actual_deduction: 1 },
    { template_id: "sensitive-data-exposure", name: "Version Info Disclosure", severity: "low", locations: 1, base_deduction: 1, weight: 0.5, actual_deduction: 1 },
    { template_id: "missing-csp", name: "Missing CSP", severity: "low", locations: 1, base_deduction: 1, weight: 0.5, actual_deduction: 1 },
  ],
  started_at: new Date(Date.now() - 30000).toISOString(),
  completed_at: new Date().toISOString(),
};

const DEMO_REPO_RESULT: RepoScanResult = {
  scan_id: "demo-repo-lingscars-2024",
  status: "completed",
  repo_url: "https://github.com/lingscars/lingscars-web",
  repo_name: "lingscars/lingscars-web",
  branch: "main",
  commit_hash: "a1b2c3d4e5f6",
  progress: 100,
  current_stage: "complete",
  score: 28,
  grade: "F",
  summary: { secrets: 3, sast: 5, sca: 4, critical: 3, high: 4, medium: 3, low: 2, info: 0 },
  files_scanned: 214,
  vulnerabilities: [
    {
      id: "repo-001",
      vuln_type: "secret",
      name: "Hardcoded AWS Access Key ID",
      severity: "critical",
      file_path: "config/aws.php",
      line_number: 12,
      code_snippet: "define('AWS_ACCESS_KEY_ID', 'AKIA_REDACTED_EXAMPLE');",
      description:
        "소스코드에 AWS Access Key ID가 평문으로 하드코딩되어 있습니다. 이 파일이 공개 저장소에 올라가면 즉시 자동화 봇에 의해 탐지되어 악용됩니다.",
      fix_suggestion: "환경 변수 또는 AWS Secrets Manager를 통해 키를 관리하고, 즉시 기존 키를 폐기·재발급하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// config/aws.php\ndefine('AWS_ACCESS_KEY_ID', 'AKIA_REDACTED_EXAMPLE');\ndefine('AWS_SECRET_ACCESS_KEY', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');",
      after_code: "// config/aws.php — 환경 변수로 대체\ndefine('AWS_ACCESS_KEY_ID', getenv('AWS_ACCESS_KEY_ID'));\ndefine('AWS_SECRET_ACCESS_KEY', getenv('AWS_SECRET_ACCESS_KEY'));",
      fix_steps: [
        "즉시 AWS 콘솔에서 해당 Access Key를 비활성화하고 새 키를 발급하세요.",
        "키를 .env 파일 또는 AWS Secrets Manager로 이전하세요.",
        ".gitignore에 .env 파일을 추가해 실수로 커밋되지 않도록 하세요.",
        "git-secrets 또는 truffleHog로 저장소 전체 히스토리를 스캔하세요.",
      ],
    },
    {
      id: "repo-002",
      vuln_type: "secret",
      name: "Hardcoded Database Password",
      severity: "critical",
      file_path: "includes/db_connect.php",
      line_number: 8,
      code_snippet: "$conn = mysqli_connect('localhost', 'root', 'P@ssw0rd123!', 'lingscars_db');",
      description:
        "데이터베이스 연결 정보(호스트, 사용자명, 비밀번호, DB명)가 소스코드에 직접 하드코딩되어 있습니다. 코드 열람 권한이 있는 누구든 DB에 직접 접근할 수 있는 상태입니다.",
      fix_suggestion: "DB 접속 정보를 환경 변수나 설정 파일(.env)로 분리하고, 해당 파일은 .gitignore에 추가하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// includes/db_connect.php\n$conn = mysqli_connect('localhost', 'root', 'P@ssw0rd123!', 'lingscars_db');",
      after_code: "// includes/db_connect.php — 환경 변수로 대체\n$conn = mysqli_connect(\n  getenv('DB_HOST'),\n  getenv('DB_USER'),\n  getenv('DB_PASS'),\n  getenv('DB_NAME')\n);",
      fix_steps: [
        "프로젝트 루트에 .env 파일을 생성하고 DB 접속 정보를 이전하세요.",
        ".gitignore에 .env를 추가하세요.",
        "DB 사용자 계정의 비밀번호를 즉시 변경하세요.",
        "DB 계정 권한을 최소화(필요한 테이블만 SELECT/INSERT/UPDATE)하세요.",
      ],
    },
    {
      id: "repo-003",
      vuln_type: "secret",
      name: "Stripe Secret Key Exposed",
      severity: "critical",
      file_path: "payment/stripe_handler.php",
      line_number: 5,
      code_snippet: "\\Stripe\\Stripe::setApiKey('sk_live_XXXX_REDACTED_EXAMPLE_XXXX');",
      description:
        "Stripe 라이브 Secret Key가 소스코드에 하드코딩되어 있습니다. 이 키가 유출되면 공격자가 결제를 생성·취소하거나 고객 결제 정보를 조회할 수 있습니다.",
      fix_suggestion: "즉시 Stripe 대시보드에서 해당 키를 폐기하고, 환경 변수로 관리하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// payment/stripe_handler.php\n\\Stripe\\Stripe::setApiKey('sk_live_XXXX_REDACTED_EXAMPLE_XXXX');",
      after_code: "// payment/stripe_handler.php — 환경 변수로 대체\n\\Stripe\\Stripe::setApiKey(getenv('STRIPE_SECRET_KEY'));",
      fix_steps: [
        "즉시 Stripe 대시보드에서 해당 Secret Key를 롤(roll)하세요.",
        "새 키를 환경 변수(STRIPE_SECRET_KEY)로 설정하세요.",
        "결제 로그를 검토해 이상 거래 여부를 확인하세요.",
      ],
    },
    {
      id: "repo-004",
      vuln_type: "sast",
      name: "SQL Injection via Unsanitized Input",
      severity: "high",
      file_path: "search.php",
      line_number: 34,
      code_snippet: "$sql = \"SELECT * FROM cars WHERE model LIKE '%\" . $_GET['q'] . \"%'\";",
      description:
        "GET 파라미터 'q'가 아무런 검증 없이 SQL 쿼리에 직접 연결(concatenation)됩니다. 공격자가 악의적인 SQL 구문을 삽입해 데이터베이스 전체를 조작할 수 있습니다.",
      fix_suggestion: "PDO Prepared Statement 또는 mysqli_prepare()를 사용해 파라미터를 바인딩하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// search.php:34 — 취약한 쿼리\n$sql = \"SELECT * FROM cars WHERE model LIKE '%\" . $_GET['q'] . \"%'\";",
      after_code: "// search.php — Prepared Statement 적용\n$stmt = $pdo->prepare('SELECT * FROM cars WHERE model LIKE ?');\n$stmt->execute(['%' . $_GET['q'] . '%']);",
      fix_steps: [
        "문자열 연결 방식의 쿼리를 PDO/mysqli Prepared Statement로 교체하세요.",
        "입력값에 대해 서버 측 유효성 검사(길이, 패턴)를 추가하세요.",
        "DB 오류 메시지가 외부에 노출되지 않도록 error_reporting을 비활성화하세요.",
      ],
    },
    {
      id: "repo-005",
      vuln_type: "sast",
      name: "Remote Code Execution via eval()",
      severity: "high",
      file_path: "admin/template_engine.php",
      line_number: 89,
      code_snippet: "eval('?>' . $template_content);",
      description:
        "사용자가 제어할 수 있는 $template_content 변수가 eval()에 전달됩니다. 공격자가 악성 PHP 코드를 템플릿에 삽입해 서버에서 임의 코드를 실행할 수 있습니다.",
      fix_suggestion: "eval() 사용을 제거하고, Twig나 Smarty 같은 안전한 템플릿 엔진으로 교체하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// admin/template_engine.php:89\neval('?>' . $template_content);",
      after_code: "// Twig 템플릿 엔진으로 교체\n$loader = new \\Twig\\Loader\\ArrayLoader(['tmpl' => $template_content]);\n$twig = new \\Twig\\Environment($loader, ['sandbox' => true]);\necho $twig->render('tmpl', $vars);",
      fix_steps: [
        "eval()을 즉시 제거하고 Twig, Smarty 등의 템플릿 엔진으로 교체하세요.",
        "템플릿 편집 권한을 최소한의 신뢰된 관리자에게만 부여하세요.",
        "템플릿 콘텐츠를 저장·출력할 때 허용 태그 화이트리스트를 적용하세요.",
      ],
    },
    {
      id: "repo-006",
      vuln_type: "sast",
      name: "Cross-Site Scripting (XSS) via Unescaped Output",
      severity: "high",
      file_path: "cars/detail.php",
      line_number: 56,
      code_snippet: "echo '<h1>' . $_GET['name'] . '</h1>';",
      description:
        "GET 파라미터 'name'이 htmlspecialchars() 처리 없이 HTML에 직접 출력됩니다. 공격자가 스크립트 태그를 삽입해 방문자의 브라우저에서 JavaScript를 실행할 수 있습니다.",
      fix_suggestion: "모든 사용자 입력을 htmlspecialchars() 또는 htmlentities()로 이스케이프한 후 출력하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// cars/detail.php:56\necho '<h1>' . $_GET['name'] . '</h1>';",
      after_code: "// 수정된 코드 — HTML 이스케이프 적용\necho '<h1>' . htmlspecialchars($_GET['name'], ENT_QUOTES, 'UTF-8') . '</h1>';",
      fix_steps: [
        "출력 시 htmlspecialchars($var, ENT_QUOTES, 'UTF-8')를 항상 적용하세요.",
        "Content-Security-Policy 헤더를 설정해 인라인 스크립트 실행을 차단하세요.",
        "Twig 등 자동 이스케이프를 지원하는 템플릿 엔진 도입을 검토하세요.",
      ],
    },
    {
      id: "repo-007",
      vuln_type: "sast",
      name: "Path Traversal via File Upload",
      severity: "high",
      file_path: "upload/handler.php",
      line_number: 23,
      code_snippet: "move_uploaded_file($tmp, './uploads/' . $_FILES['file']['name']);",
      description:
        "업로드 파일명을 검증 없이 그대로 사용합니다. '../../../etc/passwd' 같은 파일명을 통해 서버의 임의 경로에 파일을 쓸 수 있습니다.",
      fix_suggestion: "파일명을 서버에서 UUID 등으로 재생성하고, 업로드 디렉토리를 웹 루트 외부에 두세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// upload/handler.php:23\nmove_uploaded_file($tmp, './uploads/' . $_FILES['file']['name']);",
      after_code: "// 수정된 코드 — 파일명 재생성 + 확장자 검증\n$ext = pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION);\n$allowed = ['jpg', 'jpeg', 'png', 'gif'];\nif (!in_array(strtolower($ext), $allowed)) { die('허용되지 않는 파일 형식'); }\n$safe_name = bin2hex(random_bytes(16)) . '.' . $ext;\nmove_uploaded_file($tmp, '/var/uploads/' . $safe_name);",
      fix_steps: [
        "파일명을 UUID 또는 random_bytes()로 재생성하세요.",
        "허용 확장자(화이트리스트)만 업로드 가능하도록 제한하세요.",
        "업로드 디렉토리를 웹 루트 외부로 이동하고 직접 접근을 차단하세요.",
        "업로드 파일의 MIME 타입을 서버에서 직접 검사(finfo_file())하세요.",
      ],
    },
    {
      id: "repo-008",
      vuln_type: "sast",
      name: "Missing CSRF Protection on Form",
      severity: "medium",
      file_path: "account/update_profile.php",
      line_number: 1,
      code_snippet: "// No CSRF token validation found in form handler",
      description:
        "프로필 수정 폼에 CSRF 토큰 검증이 없습니다. 공격자가 악성 사이트에서 피해자의 브라우저를 통해 프로필 수정 요청을 위조할 수 있습니다.",
      fix_suggestion: "세션 기반 CSRF 토큰을 생성해 폼에 포함하고, 서버에서 매 요청마다 검증하세요.",
      ai_analyzed: true,
      is_fixed: false,
      before_code: "// update_profile.php — CSRF 토큰 없음\nif ($_POST['email']) {\n  update_user_email($_POST['email']);\n}",
      after_code: "// CSRF 토큰 검증 추가\nif (!hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])) {\n  die('Invalid CSRF token');\n}\nif ($_POST['email']) {\n  update_user_email($_POST['email']);\n}",
      fix_steps: [
        "로그인 시 세션에 암호학적으로 안전한 CSRF 토큰을 생성·저장하세요.",
        "모든 상태 변경 폼(POST/PUT/DELETE)에 hidden 필드로 토큰을 포함하세요.",
        "서버에서 hash_equals()로 토큰을 검증하세요(타이밍 공격 방지).",
      ],
    },
    {
      id: "repo-009",
      vuln_type: "sca",
      name: "CVE-2023-44487 — HTTP/2 Rapid Reset (nghttp2 < 1.57.0)",
      severity: "high",
      file_path: "composer.lock",
      line_number: 312,
      package_name: "nghttp2",
      installed_version: "1.45.1",
      fixed_version: "1.57.0",
      cve_id: "CVE-2023-44487",
      description:
        "현재 사용 중인 nghttp2 1.45.1은 HTTP/2 Rapid Reset 공격(CVE-2023-44487)에 취약합니다. 공격자가 대량의 HTTP/2 스트림을 빠르게 열고 닫아 서버를 과부하 상태로 만드는 DDoS 공격입니다.",
      fix_suggestion: "nghttp2를 1.57.0 이상으로 업그레이드하세요.",
      ai_analyzed: true,
      is_fixed: false,
      fix_steps: [
        "composer.json에서 nghttp2 버전을 ^1.57.0으로 업데이트하세요.",
        "composer update nghttp2 명령으로 의존성을 갱신하세요.",
        "업그레이드 후 HTTP/2 통신 기능을 충분히 테스트하세요.",
      ],
    },
    {
      id: "repo-010",
      vuln_type: "sca",
      name: "CVE-2022-31629 — PHP Session Fixation (PHP < 8.1.12)",
      severity: "high",
      file_path: "composer.lock",
      line_number: 1,
      package_name: "php",
      installed_version: "7.2.34",
      fixed_version: "8.1.12",
      cve_id: "CVE-2022-31629",
      description:
        "PHP 7.2.34는 세션 고정 공격(CVE-2022-31629)에 취약합니다. 공격자가 피해자의 세션 ID를 사전에 설정해 인증을 우회할 수 있습니다.",
      fix_suggestion: "PHP를 8.1.12 이상(권장: 8.2 이상)으로 즉시 업그레이드하세요.",
      ai_analyzed: true,
      is_fixed: false,
      fix_steps: [
        "PHP를 8.2 이상 최신 안정 버전으로 업그레이드하세요.",
        "업그레이드 후 코드 호환성을 스테이징 환경에서 검증하세요.",
        "로그인 성공 시 session_regenerate_id(true)를 호출해 세션 ID를 갱신하세요.",
      ],
    },
    {
      id: "repo-011",
      vuln_type: "sca",
      name: "CVE-2021-44228 — Log4Shell (log4j-core < 2.15.0)",
      severity: "medium",
      file_path: "pom.xml",
      line_number: 45,
      package_name: "log4j-core",
      installed_version: "2.14.1",
      fixed_version: "2.17.1",
      cve_id: "CVE-2021-44228",
      description:
        "log4j-core 2.14.1은 Log4Shell 취약점(CVE-2021-44228)에 영향을 받습니다. 로그 메시지에 포함된 JNDI lookup 표현식이 원격 코드 실행으로 이어질 수 있습니다.",
      fix_suggestion: "log4j-core를 2.17.1 이상으로 업그레이드하세요.",
      ai_analyzed: true,
      is_fixed: false,
      fix_steps: [
        "pom.xml에서 log4j-core 버전을 2.17.1 이상으로 업데이트하세요.",
        "mvn dependency:tree로 transitive 의존성도 확인하세요.",
        "즉시 조치가 어렵다면 LOG4J_FORMAT_MSG_NO_LOOKUPS=true 환경 변수를 설정하세요.",
      ],
    },
    {
      id: "repo-012",
      vuln_type: "sca",
      name: "Outdated WordPress Core (5.9.3) with Multiple CVEs",
      severity: "medium",
      file_path: "wp-includes/version.php",
      line_number: 15,
      package_name: "wordpress",
      installed_version: "5.9.3",
      fixed_version: "6.4.3",
      description:
        "WordPress 5.9.3은 현재 최신 버전(6.4.3)보다 2년 이상 뒤처져 있으며, SQL Injection, XSS, 인증 우회 등 다수의 CVE가 패치되지 않은 상태입니다.",
      fix_suggestion: "WordPress를 6.4.3 이상 최신 버전으로 업데이트하고, 플러그인·테마도 함께 최신화하세요.",
      ai_analyzed: true,
      is_fixed: false,
      fix_steps: [
        "WordPress 관리자 패널 또는 WP-CLI(wp core update)로 최신 버전으로 업데이트하세요.",
        "업데이트 전 전체 백업(파일 + DB)을 반드시 수행하세요.",
        "사용 중인 플러그인과 테마도 모두 최신 버전으로 업데이트하세요.",
        "자동 업데이트를 활성화해 보안 패치가 즉시 적용되도록 설정하세요.",
      ],
    },
  ],
  score_breakdown: [
    { name: "Hardcoded AWS Key", pattern_id: "aws-access-key", severity: "critical", base_deduction: 20, location_weight: 1.5, raw_deduction: 20, capped_deduction: 20, location_count: 1 },
    { name: "Hardcoded DB Password", pattern_id: "db-password", severity: "critical", base_deduction: 18, location_weight: 1.5, raw_deduction: 18, capped_deduction: 18, location_count: 1 },
    { name: "Stripe Secret Key", pattern_id: "stripe-key", severity: "critical", base_deduction: 15, location_weight: 1.5, raw_deduction: 15, capped_deduction: 15, location_count: 1 },
    { name: "SQL Injection", pattern_id: "sql-injection", severity: "high", base_deduction: 8, location_weight: 1.0, raw_deduction: 8, capped_deduction: 8, location_count: 2 },
    { name: "Remote Code Execution (eval)", pattern_id: "eval-rce", severity: "high", base_deduction: 5, location_weight: 1.0, raw_deduction: 5, capped_deduction: 5, location_count: 1 },
    { name: "XSS Unescaped Output", pattern_id: "xss-output", severity: "high", base_deduction: 4, location_weight: 1.0, raw_deduction: 4, capped_deduction: 4, location_count: 3 },
    { name: "Path Traversal Upload", pattern_id: "path-traversal", severity: "high", base_deduction: 4, location_weight: 1.0, raw_deduction: 4, capped_deduction: 4, location_count: 1 },
    { name: "Missing CSRF Protection", pattern_id: "csrf", severity: "medium", base_deduction: 3, location_weight: 1.0, raw_deduction: 3, capped_deduction: 3, location_count: 1 },
    { name: "Log4Shell (CVE-2021-44228)", pattern_id: "log4shell", severity: "medium", base_deduction: 2, location_weight: 1.0, raw_deduction: 2, capped_deduction: 2, location_count: 1 },
    { name: "WordPress Outdated", pattern_id: "wordpress-outdated", severity: "medium", base_deduction: 2, location_weight: 1.0, raw_deduction: 2, capped_deduction: 2, location_count: 1 },
    { name: "HTTP/2 Rapid Reset", pattern_id: "http2-rapid-reset", severity: "low", base_deduction: 1, location_weight: 0.5, raw_deduction: 1, capped_deduction: 1, location_count: 1 },
    { name: "PHP Session Fixation", pattern_id: "session-fixation", severity: "low", base_deduction: 1, location_weight: 0.5, raw_deduction: 1, capped_deduction: 1, location_count: 1 },
  ],
  started_at: new Date(Date.now() - 30000).toISOString(),
  completed_at: new Date().toISOString(),
};

export type AppState = "landing" | "scanning" | "dashboard" | "mcp";

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim().toLowerCase());
    return u.origin + u.pathname.replace(/\/$/, "");
  } catch {
    return url.trim().toLowerCase();
  }
}

function isDemoTarget(target: string): boolean {
  const demo = normalizeUrl(DEMO_URL);
  const input = normalizeUrl(target);
  return input === demo || input === demo.replace(/\/$/, "");
}

function CheckoutHandler({ onMessage }: { onMessage: (msg: string | null) => void }) {
  const searchParams = useSearchParams();
  const checkout = searchParams.get("checkout");
  if (checkout === "success") {
    onMessage("Scan limit removed for local dev.");
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState({}, "", url.toString());
  }
  return null;
}

export function ClientApp() {
  const [appState, setAppState] = useState<AppState>("landing");
  const [scanTarget, setScanTarget] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isRepoScan, setIsRepoScan] = useState(false);
  const [repoScanResult, setRepoScanResult] = useState<RepoScanResult | null>(null);
  const [skipTransition, setSkipTransition] = useState(false);
  const subscription = useSubscription();
  const {
    permission, enabled, requestPermission,
    showDeniedGuide, setShowDeniedGuide, isIncognito,
    sendTestNotification, testSent, recheckPermission,
  } = useNotifications();

  const handleStartScan = async (target: string, repoFullName?: string | null) => {
    setScanTarget(target);
    setScanError(null);
    setIsRepoScan(false);
    setRepoScanResult(null);
    setAppState("scanning");
    trackScanStarted("url", target);

    if (isDemoTarget(target)) {
      setScanId("__demo__");
      return;
    }

    try {
      const response = await startScan(target, "quick", null, repoFullName ?? null);
      setScanId(response.scan_id);
    } catch (error) {
      console.error("Failed to start scan:", error);
      setScanError(error instanceof Error ? error.message : "Failed to start scan");
    }
  };

  const handleStartRepoScan = async (repoUrl: string, branch?: string) => {
    setScanTarget(repoUrl);
    setScanError(null);
    setIsRepoScan(true);
    setScanResult(null);
    setRepoScanResult(null);
    setAppState("scanning");
    trackScanStarted("repo", repoUrl);

    if (isDemoTarget(repoUrl)) {
      setScanId("__demo__");
      return;
    }

    try {
      const response = await startRepoScan(repoUrl, branch || undefined, "full", null);
      setScanId(response.scan_id);
    } catch (error) {
      if (error instanceof APIError && error.status === 429) {
        setAppState("landing");
        return;
      }
      console.error("Failed to start repo scan:", error);
      setScanError(error instanceof Error ? error.message : "Failed to start repo scan");
    }
  };

  const handleScanComplete = (result: ScanResult | RepoScanResult) => {
    if (isRepoScan) {
      setRepoScanResult(result as RepoScanResult);
    } else {
      setScanResult(result as ScanResult);
    }
    setAppState("dashboard");
    trackScanCompleted({
      type: isRepoScan ? "repo" : "url",
      score: result.score,
      grade: result.grade,
      vuln_count: result.vulnerabilities.length,
    });
    if (result.scan_id) {
      window.history.pushState(null, "", `/report/${result.scan_id}`);
    }
  };

  const handleScanError = (error: string) => {
    setScanError(error);
  };

  const handleNavigate = (state: AppState) => {
    setAppState(state);
  };

  const handleNewScan = () => {
    setSkipTransition(true);
    setScanId(null);
    setScanResult(null);
    setScanError(null);
    setIsRepoScan(false);
    setRepoScanResult(null);
    setAppState("landing");
    window.history.pushState(null, "", "/");
  };

  const handleViewReport = async (reportScanId: string) => {
    try {
      const result = await getScanStatus(reportScanId);
      setScanResult(result);
      setScanId(reportScanId);
      setIsRepoScan(false);
      setAppState("dashboard");
      window.history.pushState(null, "", `/report/${reportScanId}`);
    } catch (error) {
      console.error("Failed to load report:", error);
    }
  };

  const handleViewRepoReport = async (reportScanId: string) => {
    try {
      const result = await getRepoScanStatus(reportScanId);
      setRepoScanResult(result);
      setScanId(reportScanId);
      setIsRepoScan(true);
      setAppState("dashboard");
      window.history.pushState(null, "", `/report/${reportScanId}?type=repo`);
    } catch (error) {
      console.error("Failed to load repo report:", error);
    }
  };

  return (
    <main className="min-h-screen bg-background overflow-hidden relative" aria-live="polite">
      <Suspense>
        <CheckoutHandler onMessage={() => {}} />
      </Suspense>
      <PaddleLoader />
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 243, 255, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 243, 255, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-neon-cyan/5 rounded-full blur-[80px] pointer-events-none" style={{ transform: 'translateZ(0)' }} />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-neon-cyan/3 rounded-full blur-[60px] pointer-events-none" style={{ transform: 'translateZ(0)' }} />

      <LazyMotion features={domAnimation}>
        <AnimatePresence mode="wait" onExitComplete={() => { if (skipTransition) setSkipTransition(false); }}>
          {appState === "landing" && (
            <m.div
              key="landing"
              initial={skipTransition ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, y: -20 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <LandingView
                onStartScan={handleStartScan}
                onStartRepoScan={handleStartRepoScan}
                onViewReport={handleViewReport}
                onViewRepoReport={handleViewRepoReport}
                subscription={subscription}
                liveStats={null}
                notificationProps={{ permission, enabled, onToggle: requestPermission, showDeniedGuide, isIncognito, onDismissGuide: () => setShowDeniedGuide(false), onRecheckPermission: recheckPermission, onSendTest: sendTestNotification, testSent }}
              />
            </m.div>
          )}

          {appState === "scanning" && (
            <m.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <ScanningView
                target={scanTarget}
                scanId={scanId}
                isRepoScan={isRepoScan}
                onComplete={handleScanComplete}
                onError={handleScanError}
                initialError={scanError}
                onGoHome={handleNewScan}
                demoResult={scanId === "__demo__" ? (isRepoScan ? DEMO_REPO_RESULT : DEMO_RESULT) : null}
              />
            </m.div>
          )}

          {appState === "dashboard" && (
            <m.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, y: -20 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <DashboardView
                scanResult={scanResult}
                isRepoScan={isRepoScan}
                repoScanResult={repoScanResult}
                onNavigate={handleNavigate}
                onNewScan={handleNewScan}
                subscription={subscription}
              />
            </m.div>
          )}

          {appState === "mcp" && (
            <m.div
              key="mcp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={skipTransition ? { opacity: 0 } : { opacity: 0, x: -20 }}
              transition={{ duration: skipTransition ? 0 : 0.4 }}
            >
              <MCPView onNavigate={(s) => handleNavigate(s as AppState)} />
            </m.div>
          )}
        </AnimatePresence>
      </LazyMotion>
    </main>
  );
}
