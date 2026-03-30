# MetaPress 개발 스펙

> BlogBot → MetaPress SaaS 전환을 위한 기술 문서
> 2026-03-11

---

## 1. 현재 아키텍처

```
youtube-blog-generator/
├── src/
│   ├── index.ts                 # Express 서버 (포트 3000)
│   ├── config/openai.ts         # OpenAI 클라이언트
│   ├── routes/
│   │   ├── generate.ts          # POST /generate-blog
│   │   ├── history.ts           # GET/DELETE /api/history
│   │   ├── channel.ts           # /api/channel/* (채널 스크립트)
│   │   └── ebook.ts             # /api/ebook/*, /api/create-preview ⭐
│   ├── services/
│   │   ├── youtube.ts           # yt-dlp + Whisper 자막 추출
│   │   ├── blogGenerator.ts     # OpenAI 블로그 생성
│   │   ├── ebookGenerator.ts    # 전자책 엔진 ⭐ (핵심)
│   │   ├── templates.ts         # 블로그 템플릿 5종
│   │   ├── database.ts          # SQLite (better-sqlite3)
│   │   └── channel.ts           # 채널 스크립트 추출
│   └── types/index.d.ts         # 타입 정의
├── public/
│   ├── index.html               # BlogBot 프론트엔드
│   ├── ebooks/                  # 생성된 전자책 HTML/PDF
│   └── artifacts/               # 놀이터 아티팩트
├── data/blogbot.db              # SQLite DB
└── package.json                 # Express + OpenAI + Playwright + Puppeteer
```

### 핵심 엔진: `ebookGenerator.ts`

현재 2개 파이프라인 존재:

**파이프라인 A: 유튜브 → 전자책 (다단계)**
```
유튜브 영상 선택 → POST /api/ebook/outline (아웃라인)
                → POST /api/ebook/chapter (챕터별 생성, 반복)
                → POST /api/ebook/intro-conclusion
                → POST /api/ebook/pdf (HTML→PDF, Puppeteer)
```

**파이프라인 B: 텍스트 → 전자책 (원클릭) ⭐ MetaPress 핵심**
```
텍스트 입력 → POST /api/create-preview
           → analyzePreviewContent() : GPT-4o가 구조 분석 → JSON
           → generatePreviewHtml()   : JSON → HTML (A4 페이지 레이아웃)
           → generatePreviewPdf()    : Playwright → PDF
           → /ebooks/{orderId}.html + .pdf 반환
```

### 현재 기술 스택

| 항목 | 현재 |
|------|------|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| AI | OpenAI (gpt-4o, gpt-4o-mini) |
| DB | SQLite (better-sqlite3) |
| PDF | Playwright (create-preview) + Puppeteer (레거시) |
| Frontend | Vanilla HTML/JS (public/index.html) |
| 배포 | Docker + Render |

---

## 2. MetaPress SaaS로 전환 — 빌드 목록

### Phase 1: 최소 SaaS (Week 1~2)

**목표:** 외부 유저가 전자책을 만들고 결제할 수 있는 상태

#### 1-1. 랜딩페이지 (`/metapress`)

```
public/metapress/index.html (또는 별도 도메인)
```

- 히어로: "전자책 30초 만에 만들기"
- CTA: "무료로 시작하기" → 생성 페이지로
- 샘플 전자책 갤러리
- 가격표 (무료 / ₩3,900/권 / ₩14,900/월)

#### 1-2. 전자책 생성 페이지 (`/metapress/create`)

```
public/metapress/create.html
```

현재 create-preview API를 프론트엔드로 감싸기:

- 텍스트 입력 (textarea, 최소 100자)
- 제목/저자 입력 (선택)
- "생성하기" 버튼 → POST /api/create-preview 호출
- 로딩 상태 (20~40초 소요)
- 결과: HTML 미리보기 + PDF 다운로드 버튼

#### 1-3. 워터마크 로직

`ebookGenerator.ts` 수정:

```typescript
// generatePreviewHtml()에 워터마크 옵션 추가
export function generatePreviewHtml(
  structure: EbookPreviewStructure,
  options?: { watermark?: boolean }
): string {
  // watermark === true일 때:
  // 1. 각 페이지에 반투명 "MetaPress Free" 워터마크 오버레이
  // 2. 마지막 페이지 CTA를 더 강하게
  // 3. PDF 다운로드 시에도 워터마크 포함
}
```

**무료:** 워터마크 O, 월 1권
**유료:** 워터마크 X

#### 1-4. 결제 연동

새 파일: `src/routes/payment.ts`

```
POST /api/payment/create    — 토스페이먼츠 결제 요청 생성
POST /api/payment/confirm   — 결제 승인 (토스 콜백)
GET  /api/payment/status    — 결제 상태 확인
```

토스페이먼츠 SDK:
```bash
npm install @tosspayments/payment-sdk
```

DB 스키마 추가 (`database.ts`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,           -- UUID
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',      -- free | pay_per_book | pro | business
  books_remaining INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,        -- 토스 orderId
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending | confirmed | failed
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ebooks (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  order_id TEXT NOT NULL,        -- 파일명용 ID
  title TEXT,
  pages INTEGER,
  html_path TEXT,
  pdf_path TEXT,
  watermark BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 1-5. 간단한 인증

초기엔 복잡한 로그인 없이 **이메일 기반 매직링크**:

```
POST /api/auth/send-link  — 이메일로 로그인 링크 발송
GET  /api/auth/verify      — 링크 클릭 시 세션 생성
GET  /api/auth/me          — 현재 유저 정보
```

의존성:
```bash
npm install nodemailer jsonwebtoken
```

또는 더 간단하게: **이메일 입력만으로 식별** (결제 시에만 인증)

---

### Phase 2: 품질 + 템플릿 (Week 3~4)

#### 2-1. 템플릿 다양화

현재 colorScheme 5종 (business/tech/education/creative/minimal)에 더해:

```typescript
// 새 타입
export type EbookTemplate =
  | 'modern-dark'      // 현재 기본 (다크 헤더)
  | 'clean-light'      // 밝은 배경, 미니멀
  | 'magazine'         // 매거진 스타일 (2단 레이아웃)
  | 'academic'         // 논문/보고서 스타일
  | 'startup-pitch'    // 피치덱 느낌
  | 'creative-bold'    // 대담한 타이포그래피
  ;
```

`generatePreviewHtml()`에 template 파라미터 추가.

#### 2-2. AI 커버 디자인

새 함수: `generateCoverImage()`

```typescript
// DALL-E 3 또는 GPT-4o 이미지 생성
export async function generateCoverImage(
  title: string,
  subtitle: string,
  colorScheme: EbookColorScheme
): Promise<string> {
  // OpenAI DALL-E 3 API 호출
  // → 커버 이미지 URL 반환
  // → 표지 페이지에 삽입
}
```

#### 2-3. ePub 출력

의존성:
```bash
npm install epub-gen-memory  # 또는 epub-gen
```

새 함수: `generateEpub()`

```typescript
export async function generateEpub(
  structure: EbookPreviewStructure,
  pdfPath?: string
): Promise<Buffer> {
  // HTML 챕터들을 ePub 포맷으로 변환
}
```

새 API:
```
POST /api/ebook/epub  — ePub 다운로드
```

#### 2-4. 페이지 수 보장 로직

현재 문제: 짧은 입력 → 빈약한 전자책
해결: `analyzePreviewContent()` 프롬프트에 최소 페이지 수 강제

```typescript
// 현재: "전체 챕터 수는 8~12개"
// 변경: 입력 길이에 따라 동적 조절
const minChapters = Math.max(8, Math.ceil(content.length / 500));
const targetPages = Math.max(25, minChapters + 5);
```

---

### Phase 3: 유통 자동화 (Month 2~3)

#### 3-1. 유통 채널 연동

새 서비스: `src/services/distribution.ts`

```typescript
export interface DistributionChannel {
  name: string;
  publish(ebook: EbookData): Promise<{ url: string; status: string }>;
}

// 구현할 채널들:
export class GumroadChannel implements DistributionChannel { ... }
export class KmongChannel implements DistributionChannel { ... }  // 수동 안내
export class NotionChannel implements DistributionChannel { ... }
```

새 API:
```
POST /api/distribute          — 전자책 유통 시작
GET  /api/distribute/:id      — 유통 상태 확인
GET  /api/distribute/channels — 사용 가능한 채널 목록
```

#### 3-2. Gumroad 연동

```typescript
// Gumroad API v2
const GUMROAD_API = 'https://api.gumroad.com/v2';

export async function publishToGumroad(ebook: {
  title: string;
  description: string;
  price: number;      // cents
  pdfBuffer: Buffer;
  coverUrl?: string;
}): Promise<{ productId: string; url: string }> {
  // POST /products — 상품 생성
  // PUT /products/:id/files — PDF 업로드
}
```

#### 3-3. 배치 생성 큐

대량 생성 시 순차 처리:

```bash
npm install bullmq ioredis
```

```typescript
// src/services/queue.ts
import { Queue, Worker } from 'bullmq';

const ebookQueue = new Queue('ebook-generation');

// 큐에 추가
export async function enqueueEbook(request: EbookPreviewRequest): Promise<string> {
  const job = await ebookQueue.add('generate', request);
  return job.id;
}

// 워커
const worker = new Worker('ebook-generation', async (job) => {
  const { content, title, author } = job.data;
  const structure = await analyzePreviewContent(content, title, author);
  const html = generatePreviewHtml(structure);
  // ... PDF 생성, DB 저장
});
```

---

### Phase 4: API 공개 + B2B (Month 4~6)

#### 4-1. API 키 시스템

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  key_hash TEXT UNIQUE NOT NULL,   -- SHA-256
  name TEXT,
  rate_limit INTEGER DEFAULT 100,  -- 시간당
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

미들웨어:
```typescript
// src/middleware/apiAuth.ts
export function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'];
  // key 검증 → user 정보 주입
}
```

#### 4-2. 공개 API 엔드포인트

```
POST /v1/ebooks              — 전자책 생성
GET  /v1/ebooks/:id          — 전자책 조회
GET  /v1/ebooks/:id/pdf      — PDF 다운로드
GET  /v1/ebooks/:id/html     — HTML 다운로드
GET  /v1/ebooks/:id/epub     — ePub 다운로드
GET  /v1/usage               — API 사용량 조회
```

요청:
```json
POST /v1/ebooks
{
  "content": "텍스트 내용...",
  "title": "제목 (선택)",
  "author": "저자 (선택)",
  "template": "modern-dark",
  "format": ["pdf", "html", "epub"],
  "watermark": false
}
```

응답:
```json
{
  "id": "abc123",
  "status": "completed",
  "title": "AI가 정한 제목",
  "pages": 28,
  "urls": {
    "html": "/v1/ebooks/abc123/html",
    "pdf": "/v1/ebooks/abc123/pdf"
  },
  "created_at": "2026-03-11T..."
}
```

---

## 3. 수정이 필요한 기존 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/index.ts` | metapress 라우터 등록, 인증 미들웨어 추가 |
| `src/services/ebookGenerator.ts` | 워터마크 옵션, 템플릿 파라미터, 커버 이미지 |
| `src/services/database.ts` | users, payments, ebooks, api_keys 테이블 |
| `src/types/index.d.ts` | 새 타입 추가 (User, Payment, EbookTemplate 등) |
| `src/routes/ebook.ts` | 인증 체크, 사용량 차감 로직 |
| `package.json` | 새 의존성 추가 |

## 4. 새로 만들 파일

| 파일 | 용도 |
|------|------|
| `src/routes/payment.ts` | 토스페이먼츠 결제 |
| `src/routes/auth.ts` | 인증 (매직링크) |
| `src/routes/metapress.ts` | MetaPress SaaS API |
| `src/routes/distribute.ts` | 유통 자동화 |
| `src/routes/apiV1.ts` | 공개 API v1 |
| `src/middleware/apiAuth.ts` | API 키 인증 |
| `src/services/distribution.ts` | 유통 채널 연동 |
| `src/services/queue.ts` | BullMQ 배치 큐 |
| `public/metapress/index.html` | 랜딩페이지 |
| `public/metapress/create.html` | 생성 페이지 |
| `public/metapress/pricing.html` | 가격 페이지 |
| `public/metapress/dashboard.html` | 유저 대시보드 |

---

## 5. 의존성 추가 계획

```bash
# Phase 1
npm install @tosspayments/payment-sdk  # 결제
npm install nodemailer                  # 이메일 발송
npm install jsonwebtoken                # JWT 토큰

# Phase 2
npm install epub-gen-memory             # ePub 생성

# Phase 3
npm install bullmq ioredis              # 배치 큐 (Redis 필요)
```

---

## 6. 환경 변수 추가

```env
# 기존
OPENAI_API_KEY=
PORT=3000

# Phase 1 추가
TOSS_CLIENT_KEY=            # 토스 클라이언트 키
TOSS_SECRET_KEY=            # 토스 시크릿 키
JWT_SECRET=                 # JWT 서명용
SMTP_HOST=                  # 이메일 서버
SMTP_USER=
SMTP_PASS=
BASE_URL=http://localhost:3000

# Phase 3 추가
GUMROAD_ACCESS_TOKEN=       # Gumroad API
REDIS_URL=                  # BullMQ용 Redis
```

---

## 7. 개발 순서 (우선순위)

```
[1] 워터마크 로직 추가 (ebookGenerator.ts) ← 30분
[2] ebooks 테이블 + 생성 기록 저장 ← 1시간
[3] 생성 페이지 (create.html) ← 2시간
[4] 랜딩페이지 (index.html) ← 2시간
[5] 이메일 기반 유저 식별 ← 1시간
[6] 토스페이먼츠 결제 ← 3시간
[7] 유저 대시보드 ← 2시간
────── 여기까지 = 최소 SaaS (1~2주) ──────
[8] 템플릿 추가 (3종) ← 4시간
[9] AI 커버 이미지 ← 2시간
[10] ePub 출력 ← 2시간
────── 여기까지 = 경쟁력 있는 SaaS (3~4주) ──────
[11] Gumroad 연동 ← 3시간
[12] 배치 큐 ← 4시간
[13] 공개 API v1 ← 4시간
────── 여기까지 = 풀 플랫폼 (2~3개월) ──────
```

---

## 8. create-preview API 현재 스펙 (참고)

MetaPress 핵심 엔진. 이미 작동 중:

```
POST /api/create-preview
Content-Type: application/json

{
  "content": "텍스트 (최소 100자)",
  "title": "제목 (선택)",
  "author": "저자 (선택)"
}

→ 200 OK
{
  "success": true,
  "previewUrl": "/ebooks/{orderId}.html",
  "pdfUrl": "/ebooks/{orderId}.pdf",
  "pages": 28,
  "orderId": "m1a2b3c4"
}
```

내부 플로우:
1. `analyzePreviewContent()` — GPT-4o, JSON 구조 분석 (8~12챕터, 섹션 타입 7종)
2. `generatePreviewHtml()` — HTML 생성 (A4 페이지 레이아웃, 컬러 스킴)
3. `generatePreviewPdf()` — Playwright chromium → PDF

소요 시간: 20~40초
비용: GPT-4o 1회 호출 (~$0.05~$0.15)

---

## 9. 현재 전자책 디자인 시스템

`ebookGenerator.ts`의 `generatePreviewHtml()`이 생성하는 HTML 구성:

| 페이지 | 내용 |
|--------|------|
| 1 | 표지 (그라디언트 배경 + 제목 + 저자) |
| 2 | 목차 (자동 생성) |
| 3~N | 챕터 (헤더 + 섹션들) |
| N+1 | 브랜딩 (MetaPress CTA) |

섹션 타입 7종:
- `text` — 본문 텍스트 (HTML 태그 가능)
- `stats` — 3열 수치 그리드
- `list` — 불릿 리스트
- `quote` — 인용 박스
- `table` — 테이블
- `timeline` — 타임라인 (세로)
- `comparison` — 2열 비교

컬러 스킴 5종:
- `business` (다크네이비 + 레드)
- `tech` (다크블루 + 블루)
- `education` (다크그린 + 그린)
- `creative` (다크퍼플 + 퍼플)
- `minimal` (다크 + 그레이)
