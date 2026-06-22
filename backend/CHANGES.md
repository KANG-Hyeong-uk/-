# CHANGES.md

**작성일**: 2026-06-22

## 개요

이번 변경사항은 AI 모델을 Claude에서 Gemini로, 데이터베이스를 Supabase에서 PostgreSQL(asyncpg)로 마이그레이션하며, 인증 방식을 Supabase JWT에서 PyJWT 자체 검증으로 전환합니다. 배포 환경도 Cloud Run에서 EC2 1-tier 구성으로 변경됩니다.

---

## 변경 항목 상세

### 1. AI 모델 변경: Claude → Gemini ⚠️ BREAKING CHANGE

**영향받는 파일**: `app/services/claude_analyzer.py`

- **제거**: `anthropic` SDK
- **도입**: `google-genai` SDK
- **사용 모델**: `gemini-2.5-flash`
- **API 키 환경변수**: `CLAUDE_API_KEY` → `GEMINI_API_KEY`
- **모듈명 유지**: 기존 `claude_analyzer.py` 유지 (모듈명 변경 불필요)

**requirements.txt 변경**:
```
anthropic>=0.18.0 → 제거
google-genai>=1.0.0 → 추가
```

---

### 2. 데이터베이스 변경: Supabase → PostgreSQL ⚠️ BREAKING CHANGE

**영향받는 파일**: `app/services/supabase_client.py`

#### 주요 변경사항

- **Supabase Python SDK 완전 제거**
- **asyncpg 기반 커넥션 풀 구현**
- **모든 DB 쿼리를 Raw SQL로 변환** (SELECT, INSERT, UPDATE, DELETE, UPSERT)

#### 새로운 함수

- `init_db_pool()`: 앱 시작 시 호출 → asyncpg 풀 초기화
- `close_db_pool()`: 앱 종료 시 호출 → 풀 종료

**requirements.txt 변경**:
```
supabase>=2.3.0 → 제거
asyncpg>=0.29.0 → 추가
```

---

### 3. 인증 변경: Supabase JWT → PyJWT 자체 검증 ⚠️ BREAKING CHANGE

**영향받는 파일**: `app/api/auth.py`

- **제거**: `supabase.client.auth.get_user(token)` 호출
- **도입**: PyJWT를 사용한 HS256 알고리즘 직접 검증
- **필수 환경변수**: `JWT_SECRET` (토큰 서명 키)

---

### 4. 설정 관리 변경: config.py ⚠️ BREAKING CHANGE

**제거 항목**:
- `supabase_url`
- `supabase_service_role_key`
- `supabase_anon_key`

**추가 항목**:
- `database_url` (PostgreSQL DSN 형식)
- `jwt_secret` (JWT 검증 키)

---

### 5. 앱 라이프사이클 변경: main.py

**시작 시 (애플리케이션 초기화)**:
```python
await init_db_pool()  # asyncpg 풀 초기화
```

**종료 시 (애플리케이션 셧다운)**:
```python
await close_db_pool()  # asyncpg 풀 종료
```

**영향**: Admin 엔드포인트에서 Supabase 직접 호출 제거

---

### 6. 신규 파일

#### `backend/schema.sql`
PostgreSQL 테이블 스키마 정의

**포함 테이블**:
- users
- subscriptions
- scans
- vulnerabilities
- ai_cache
- trust_badges
- scheduled_scans
- repo_scans
- repo_vulnerabilities
- github_connections
- vercel_connections
- push_subscriptions
- fix_quality_metrics
- mcp_usage

#### `backend/docker-compose.yml`
1-tier 배포 구성 (PostgreSQL + FastAPI)

**구성**:
- PostgreSQL 16 Alpine 이미지
- FastAPI 백엔드 서비스
- schema.sql 자동 초기화

#### `backend/.env.example`
EC2 배포용 환경변수 템플릿

**변경사항**:
- `CLAUDE_API_KEY` → `GEMINI_API_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` → 제거
- `DATABASE_URL` 추가 (PostgreSQL DSN)
- `JWT_SECRET` 추가

---

## 환경변수 변경표

| 항목 | 이전 | 현재 | 비고 |
|------|------|------|------|
| AI API 키 | `CLAUDE_API_KEY` | `GEMINI_API_KEY` | Gemini API 키 필수 |
| Supabase URL | `SUPABASE_URL` | ❌ 제거 | PostgreSQL 직접 연결 |
| Supabase Service Key | `SUPABASE_SERVICE_ROLE_KEY` | ❌ 제거 | - |
| Supabase Anon Key | `SUPABASE_ANON_KEY` | ❌ 제거 | - |
| DB 연결 | - | `DATABASE_URL` | PostgreSQL DSN 형식 |
| JWT 검증 | - | `JWT_SECRET` | HS256 서명 키 |

---

## EC2 배포 가이드

### 사전 요구사항

- EC2 인스턴스 (Amazon Linux 2 또는 Ubuntu 권장)
- Docker, Docker Compose 설치

### 배포 절차

1. **저장소 클론**
   ```bash
   cd /opt
   git clone <repository-url>
   cd trust-security-scanner/backend
   ```

2. **환경변수 설정**
   ```bash
   cp .env.example .env
   # .env 파일 수정: GEMINI_API_KEY, DATABASE_URL, JWT_SECRET 등 입력
   nano .env
   ```

3. **Docker Compose로 실행**
   ```bash
   docker compose up -d
   ```

   - PostgreSQL 자동 초기화 (schema.sql 실행)
   - FastAPI 서버 시작

4. **로그 확인**
   ```bash
   docker compose logs -f
   ```

5. **배포 중지**
   ```bash
   docker compose down
   ```

### PostgreSQL 접근 (로컬 테스트용)

```bash
docker compose exec postgres psql -U postgres -d trust_scanner
```

---

## 마이그레이션 체크리스트

- [ ] `GEMINI_API_KEY` 발급 및 설정
- [ ] PostgreSQL `DATABASE_URL` 준비 (docker-compose.yml 사용 권장)
- [ ] `JWT_SECRET` 생성 (충분한 길이의 무작위 문자열)
- [ ] `requirements.txt` 업데이트 수행
- [ ] `schema.sql` 실행 (docker-compose.yml이 자동 처리)
- [ ] `.env.example` → `.env` 복사 및 수정
- [ ] 로컬 테스트 (docker compose up)
- [ ] EC2 배포 및 서버 정상 작동 확인

---

## 주요 Breaking Changes 요약

| 항목 | 영향도 | 처리 방법 |
|------|--------|----------|
| Claude → Gemini | **높음** | API 키 변경, 모델명 확인 |
| Supabase → PostgreSQL | **높음** | DB 마이그레이션, 쿼리 재작성 |
| Supabase JWT → PyJWT | **높음** | JWT_SECRET 설정, 인증 로직 재검증 |
| 배포 환경 변경 | **중간** | docker-compose.yml로 1-tier 구성 |
| 환경변수 명 변경 | **중간** | .env 파일 재작성 |

---

## 지원 및 문의

변경사항 관련 문제 발생 시 아래 항목 확인:

- PostgreSQL 연결 상태 (`DATABASE_URL` 형식 확인)
- Gemini API 할당량 및 활성화 상태
- JWT_SECRET 길이 및 인코딩
- Docker Compose 네트워크 설정 (postgres ↔ app 통신 확인)
