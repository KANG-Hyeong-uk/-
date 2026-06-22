# Auto-Fix 범용화 요구사항서

> 작성일: 2026-03-03
> 대상: 후임 개발자
> 선행 문서: `docs/HANDOVER_CONTEXT_AWARE_FIX.md` (현재 상태, DB 스키마, 아키텍처 제약사항)

---

## 현재 상황

Auto-Fix PR 생성 기능이 존재하지만, **코드 매칭 성공률이 레포에 따라 41~70%** 수준.
이는 특정 레포에서만 작동하는 수준이며, **범용 SaaS 서비스로 제공하기에 부족**함.

### 핵심 병목 3가지

| 병목 | 영향도 | 현재 상태 |
|------|--------|-----------|
| AI가 실제 코드 대신 예시 코드를 생성 | SAST 전체 | before_code가 파일에 존재하지 않음 |
| SCA 패키지 매칭 실패 | SCA 전체 | package.json 외 미지원, JSON 파싱 실패 |
| 매칭 전략이 취약 | 전체 | exact 실패 시 대안이 부실 |

---

## 요구사항 1: AI 출력 품질 보장 (최우선)

### 문제

`claude_analyzer.py`의 `REPO_SYSTEM_PROMPT`에 "before_code는 파일 내용에서 그대로 복사해야 한다"고 지시하지만, AI가 이를 무시하고 일반적인 예시 코드를 생성하는 경우가 빈번함.

```
실제 파일: const userInput = req.body.username;
AI 생성:   // Example of vulnerable code pattern:\nconst userInput = ...
```

### 해결해야 할 것

#### 1-1. 프롬프트 강화

**파일**: `backend/app/services/claude_analyzer.py` — `REPO_SYSTEM_PROMPT`, `_build_repo_analysis_prompt()`

- "DO NOT generate example code. DO NOT paraphrase." 수준의 명시적 금지 지시 추가
- few-shot 예시를 프롬프트에 포함 (올바른 예시 1개 + 잘못된 예시 1개 + 왜 잘못됐는지)
- SCA 취약점 전용 지시 추가: package.json/requirements.txt 등의 before/after는 반드시 `"패키지명": "이전버전"` → `"패키지명": "수정버전"` 형태로만 생성하도록 강제
- `temperature=0` 설정 (현재 미설정 상태 — `analyze_repo_vulnerability()` 609줄)

#### 1-2. AI 출력 검증 레이어 추가 (신규)

**위치**: `claude_analyzer.py` — `analyze_repo_vulnerability()` 내부, AI 응답 파싱 후

- AI가 반환한 `before_code`가 실제 `file_content`에 존재하는지 **검증**
- 존재하지 않으면:
  - 1차: whitespace 정규화 후 재검색
  - 2차: `difflib.SequenceMatcher`로 가장 유사한 블록 찾아서 before_code를 **교정**
  - 3차: 그래도 실패하면 before_code를 빈 문자열로 설정 (PR 생성 시 해당 취약점 스킵)
- 검증 결과를 로그에 기록 (`ai_output_validated: true/false, correction_applied: true/false`)

#### 1-3. 취약점 유형별 프롬프트 분기

**현재**: 모든 취약점 유형(SAST, SCA, Secret)에 동일한 프롬프트 사용

**개선**: `_build_repo_analysis_prompt()`에서 `vuln_type`에 따라 다른 지시를 제공

- **SAST**: "before_code는 file_content의 line_number 주변 코드를 정확히 복사하라"
- **SCA**: "before_code/after_code는 반드시 `\"패키지명\": \"버전\"` JSON 형태로만 작성하라. 전체 JSON 구조를 만들지 마라."
- **Secret**: "before_code는 시크릿이 노출된 줄을 그대로 복사하라. after_code는 환경변수로 교체한 코드를 작성하라."

---

## 요구사항 2: SCA 매칭 범용화

### 문제

현재 `_apply_package_json_fix()`는 npm package.json만 지원. Python(requirements.txt, pyproject.toml), Go(go.mod), Java(pom.xml), Ruby(Gemfile) 등은 미지원. 또한 AI가 생성하는 JSON 구조가 일관되지 않아 파싱 실패.

### 해결해야 할 것

#### 2-1. `_apply_package_json_fix()` 견고화

**파일**: `backend/app/api/routes/github.py` (112~153줄)

현재 로직:
1. AI의 before/after를 JSON.parse
2. dependencies 섹션에서 패키지명+버전 추출
3. regex로 실제 파일에서 해당 버전 교체

**개선**:
- JSON 파싱 실패 시 **정규식 폴백**: `"패키지명"\s*:\s*"버전"` 패턴으로 직접 추출
- AI가 `{"marked": "0.3.5"}` (section 없이)로 생성해도 작동하도록 처리
- `package-lock.json`은 스킵 (lock 파일은 `npm install`로 자동 갱신됨)
- 취약점 데이터에 `package_name`, `installed_version`, `fixed_version` 필드가 이미 존재함 (scanner가 제공) — AI 출력에 의존하지 않고 이 필드들을 **직접 사용**하는 경로 추가

#### 2-2. 멀티 에코시스템 SCA 지원 (신규)

**파일**: `backend/app/api/routes/github.py`에 새 함수 추가

| 파일 | 형식 | 교체 전략 |
|------|------|-----------|
| `package.json` | `"pkg": "^1.2.3"` | 버전 문자열 교체 (기존) |
| `requirements.txt` | `pkg==1.2.3` | 줄 단위 교체 |
| `pyproject.toml` | `pkg = ">=1.2.3"` | TOML 파싱 또는 regex |
| `go.mod` | `module v1.2.3` | regex |
| `pom.xml` | `<version>1.2.3</version>` | XML 파싱 또는 regex |
| `Gemfile` | `gem 'pkg', '~> 1.2'` | regex |

핵심 원칙: **AI 출력의 before_code/after_code에 의존하지 말고, 스캐너가 제공하는 `package_name` + `installed_version` + `fixed_version`을 직접 사용**하여 버전을 교체할 것. AI 출력은 설명(description, fix_steps)에만 활용.

#### 2-3. create_fix_pr()에서 SCA 분기 개선

**파일**: `backend/app/api/routes/github.py` (354~363줄)

현재:
```python
if is_package_json:
    modified, strategy = _apply_package_json_fix(modified, before, after)
else:
    modified, strategy = _apply_code_fix(modified, before, after)
```

개선:
```python
if is_dependency_file(file_path):  # package.json, requirements.txt, go.mod, etc.
    modified, strategy = _apply_dependency_fix(modified, v)  # v에서 직접 package_name/version 추출
else:
    modified, strategy = _apply_code_fix(modified, before, after)
```

---

## 요구사항 3: 코드 매칭 전략 강화

### 문제

`_apply_code_fix()`의 3단계 전략(exact → whitespace → line_by_line)이 불충분. line_by_line은 "가장 긴 줄"을 키로 사용하는데, 공통 패턴이 많은 파일에서 잘못된 위치를 매칭할 수 있음.

### 해결해야 할 것

#### 3-1. fuzzy matching 4단계 추가

**파일**: `backend/app/api/routes/github.py` — `_apply_code_fix()` (156~227줄)

현재 3단계 후에 **4단계: fuzzy matching** 추가:
- `difflib.SequenceMatcher`를 사용하여 before_code와 가장 유사한 블록을 찾음
- 유사도 임계값: 0.7 이상이면 매칭 성공으로 판단
- 매칭된 블록을 after_code로 교체
- 전략명: `"fuzzy"` (fix_quality_metrics에 기록)

#### 3-2. line_number 기반 매칭 활용

취약점 데이터에 `line_number`가 포함되어 있음. 현재 매칭 전략은 이를 전혀 활용하지 않음.

- exact/whitespace 실패 시, `line_number` 주변 ±5줄 범위에서 before_code를 검색
- 범위를 좁혀서 오매칭을 방지

#### 3-3. 들여쓰기 정규화

현재 whitespace 정규화는 `[ \t]+`를 단일 공백으로 변환하지만, 탭 vs 스페이스 차이는 처리하지 않음.

- 탭 → 4스페이스 변환 후 비교하는 단계 추가
- 줄 끝 공백(trailing whitespace) 제거 후 비교

---

## 요구사항 4: 파일 경로 정규화 완성

### 문제

`_normalize_file_path()`가 `/tmp/trust_repo_XXX/` 패턴만 처리. 다른 임시 경로 패턴이나 절대 경로가 남아있으면 PR 생성 시 파일을 못 찾음.

### 해결해야 할 것

**파일**: `backend/app/api/routes/github.py` (104~109줄)

```python
# 현재
cleaned = _re.sub(r"^/tmp/trust_repo_[^/]+/", "", file_path)

# 개선: 다양한 패턴 지원
patterns = [
    r"^/tmp/trust_repo_[^/]+/",
    r"^/tmp/[^/]+/",          # 기타 /tmp 하위
    r"^/var/folders/[^/]+/",   # macOS 임시 폴더
    r"^.*?/(?=[\w.-]+/)",      # 절대 경로에서 레포 루트 추정 (위험 — 주의 필요)
]
```

추가로, `repo_scanner.py`의 `_enrich_with_file_content()`에서 file_content를 읽을 때 **경로 정규화를 먼저 수행**하도록 변경.

---

## 요구사항 5: 매칭률 측정 자동화 및 대시보드

### 문제

현재 매칭률 확인은 Supabase 대시보드에서 직접 SQL을 실행해야 함. 서비스 품질 모니터링이 불가.

### 해결해야 할 것

#### 5-1. 매칭률 API 엔드포인트 (Admin용)

**파일**: `backend/app/api/routes/github.py` 또는 새 파일

```
GET /api/admin/fix-metrics?days=30
```

응답:
```json
{
  "total_fixes": 150,
  "match_rate": 72.5,
  "by_strategy": {
    "exact": 45, "whitespace": 12, "line_by_line": 8,
    "fuzzy": 5, "failed": 30
  },
  "by_vuln_type": {
    "sast": {"total": 80, "match_rate": 85.0},
    "sca": {"total": 50, "match_rate": 52.0},
    "secret": {"total": 20, "match_rate": 70.0}
  },
  "pr_merge_rate": 45.2,
  "user_feedback": {"positive": 30, "negative": 8}
}
```

#### 5-2. 자동 회귀 테스트 (선택)

CI에서 알려진 레포 3~5개를 대상으로 스캔 → Fix PR 시뮬레이션(실제 PR 생성 없이 매칭만 테스트) → 매칭률이 임계값(70%) 미만이면 경고.

---

## 요구사항 6: False Positive 필터링

### 문제

스캐너가 탐지한 취약점 중 실제로 안전한 코드도 있음. 현재는 모든 탐지 결과에 대해 Fix를 제안하므로, 불필요한 PR 변경이 포함됨.

### 해결해야 할 것

**파일**: `backend/app/services/claude_analyzer.py`

- AI 분석 시 `is_false_positive` 필드 추가: AI가 file_content를 보고 "이 코드는 실제로 안전함"이라고 판단하면 `true` 반환
- `REPO_SYSTEM_PROMPT`에 false positive 판별 지시 추가
- `create_fix_pr()`에서 `is_false_positive: true`인 취약점은 스킵
- DB에 `false_positive_count` 기록하여 스캐너 정확도 추적

---

## 검증 기준

### 목표 매칭률

| 취약점 유형 | 현재 추정 | 목표 |
|-------------|-----------|------|
| SAST | ~60% | 85%+ |
| SCA | ~30% | 90%+ (scanner 필드 직접 사용 시) |
| Secret | ~50% | 80%+ |
| **전체** | **~45%** | **80%+** |

### 테스트 레포 (최소 5개, 다양한 에코시스템)

| 레포 | 언어 | SCA 타입 | 목적 |
|------|------|----------|------|
| OWASP/NodeGoat | Node.js | package.json | SAST + SCA 동시 |
| OWASP/WebGoat | Java | pom.xml | Java 에코시스템 |
| expressjs/express | Node.js | package.json | 대규모 실제 프로젝트 |
| django/django (소규모 포크) | Python | requirements.txt | Python 에코시스템 |
| 자체 테스트 레포 | 혼합 | 혼합 | 엣지 케이스 |

### 성공 기준 체크리스트

- [ ] SAST 취약점: before_code가 실제 파일 내용과 100% 일치 (exact 매칭)
- [ ] SCA 취약점: AI 출력에 의존하지 않고 scanner 데이터로 버전 교체 성공
- [ ] Secret 취약점: 파일 경로가 정규화되어 PR에 정상 반영
- [ ] 매칭 실패 시 fuzzy matching으로 복구되는 비율 측정
- [ ] 5개 테스트 레포 전체에서 80% 이상 매칭률
- [ ] false positive 취약점이 Fix PR에 포함되지 않음
- [ ] 매칭률 API로 실시간 모니터링 가능

---

## 구현 우선순위

```
1. AI 출력 검증 레이어 (요구사항 1-2)     ← 즉시 효과, 모든 유형에 영향
2. SCA scanner 필드 직접 사용 (요구사항 2-1, 2-3) ← SCA 매칭률 30%→90%
3. AI 프롬프트 강화 (요구사항 1-1, 1-3)    ← SAST 매칭률 근본 개선
4. fuzzy matching 추가 (요구사항 3-1)       ← 잔여 실패 케이스 복구
5. 파일 경로 정규화 (요구사항 4)            ← Secret 취약점 수정
6. 멀티 에코시스템 SCA (요구사항 2-2)       ← Python/Java/Go 지원 확대
7. false positive 필터링 (요구사항 6)       ← PR 품질 향상
8. 매칭률 대시보드 (요구사항 5)             ← 운영 모니터링
```

---

## 주의사항 (반드시 읽을 것)

1. **Pro 게이팅**: AI 자동 분석, Fix PR, Fix Prompt 생성은 모두 Pro 전용. 새 기능 추가 시 반드시 게이팅 확인. 무단으로 Free 유저에게 열지 말 것.
2. **file_content 수명**: DB에 저장되지 않음. 스캔 백그라운드 태스크 내에서만 존재. 이 구조를 변경하려면 DB 스키마 변경 + 비용 검토 필요.
3. **기존 코드 수정 시**: 기존 동작을 먼저 이해하고, 변경 전에 비교 테스트(before/after) 수행할 것.
4. **Claude API 비용**: semaphore 3으로 제한 중. max_tokens 증가 시 rate limit 주의.
5. **인수인계 문서**: `docs/HANDOVER_CONTEXT_AWARE_FIX.md` — DB 스키마, 아키텍처 흐름, 수정된 파일 목록 포함.
