# BlogBot — YouTube → Blog Generator

## 프로젝트 개요
YouTube URL을 입력하면 자막을 추출하고 OpenAI로 블로그 글을 자동 생성하는 웹 서비스.

## 기술 스택
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **AI**: OpenAI API (gpt-4o-mini / gpt-4o 선택 가능)
- **DB**: SQLite (better-sqlite3) — 히스토리 저장
- **자막 추출**: yt-dlp (CLI)
- **음성 인식**: OpenAI Whisper (CLI, 로컬)
- **프론트엔드**: 단일 HTML (public/index.html), 프레임워크 없음
- **배포**: Docker + docker-compose, Render 지원

## 프로젝트 구조
```
youtube-blog-generator/
├── src/
│   ├── index.ts              # Express 서버 진입점
│   ├── config/
│   │   └── openai.ts         # OpenAI 클라이언트 초기화
│   ├── routes/
│   │   ├── generate.ts       # POST /generate-blog (재시도/에러 분류/히스토리 저장)
│   │   └── history.ts        # GET/DELETE /api/history — 히스토리 CRUD
│   ├── services/
│   │   ├── youtube.ts        # 자막 추출 (yt-dlp) + Whisper STT fallback
│   │   ├── blogGenerator.ts  # 톤/템플릿별 프롬프트 + OpenAI 블로그 생성
│   │   ├── templates.ts      # 블로그 포맷 템플릿 5종 (일반/리뷰/튜토리얼/뉴스/에세이)
│   │   └── database.ts       # SQLite DB 초기화 + CRUD
│   └── types/
│       └── index.d.ts        # 공유 타입 (BlogTone, BlogModel, BlogTemplate 등)
├── public/
│   └── index.html            # 프론트엔드 (BlogBot UI)
├── data/
│   └── blogbot.db            # SQLite DB 파일 (자동 생성, gitignore)
├── Dockerfile                # Node.js + yt-dlp + Whisper
├── docker-compose.yml
├── render.yaml               # Render 배포 설정
├── .env                      # OPENAI_API_KEY, PORT
└── dist/                     # 컴파일된 JS (gitignore)
```

## 실행 방법
```bash
npm run build    # TypeScript 컴파일
npm start        # 서버 실행 (localhost:3000)
npm run dev      # ts-node로 개발 모드 실행
```

## Docker 실행
```bash
docker-compose up --build
```

## 외부 의존성 (로컬 실행 시 시스템에 설치 필요)
- `yt-dlp` — YouTube 자막/오디오 다운로드 (`brew install yt-dlp`)
- `whisper` — 음성→텍스트 변환 (`pip3 install openai-whisper`)

## 환경 변수
- `OPENAI_API_KEY` — OpenAI API 키 (필수)
- `PORT` — 서버 포트 (기본값: 3000)

## 코딩 컨벤션
- TypeScript strict mode
- 한국어 에러 메시지 사용
- 로그는 `[태그]` 접두사 (`[transcript]`, `[whisper]`, `[blog-gen]`, `[history]`)
- `satisfies` 키워드로 API 응답 타입 검증
- 프론트엔드는 vanilla JS, CSS 변수(var(--primary) 등) 활용

## 주요 기능
- **톤 선택**: 정보형 / 캐주얼 / 전문가 (프롬프트 분기)
- **모델 선택**: gpt-4o-mini (빠름) / gpt-4o (고품질)
- **템플릿**: 일반 / 리뷰 / 튜토리얼 / 뉴스 / 에세이 (각각 전용 프롬프트)
- **히스토리**: SQLite에 자동 저장, 사이드 패널에서 조회/다시보기/삭제
- **Whisper fallback**: 자막 없는 영상 → 오디오 다운로드 → STT 자동 변환
- **자동 재시도**: 429/네트워크 에러 시 점진적 대기 후 재시도 (최대 2회)

## API 엔드포인트
- `POST /generate-blog` — 블로그 생성 (body: youtubeUrl, tone?, model?, template?)
- `GET /api/history` — 히스토리 목록 (query: limit, offset)
- `GET /api/history/:id` — 히스토리 상세
- `DELETE /api/history/:id` — 히스토리 삭제
- `GET /health` — 서버 상태 확인
