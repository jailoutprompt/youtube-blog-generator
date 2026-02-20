# BlogBot — YouTube → Blog Generator

## 프로젝트 개요
YouTube URL을 입력하면 자막을 추출하고 OpenAI로 블로그 글을 자동 생성하는 웹 서비스.

## 기술 스택
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **AI**: OpenAI API (gpt-4o-mini)
- **자막 추출**: yt-dlp (CLI)
- **음성 인식**: OpenAI Whisper (CLI, 로컬)
- **프론트엔드**: 단일 HTML (public/index.html), 프레임워크 없음

## 프로젝트 구조
```
youtube-blog-generator/
├── src/
│   ├── index.ts              # Express 서버 진입점
│   ├── config/
│   │   └── openai.ts         # OpenAI 클라이언트 초기화
│   ├── routes/
│   │   └── generate.ts       # POST /generate-blog 라우트 (재시도/에러 분류 포함)
│   ├── services/
│   │   ├── youtube.ts        # 자막 추출 (yt-dlp) + Whisper STT fallback
│   │   └── blogGenerator.ts  # 시스템 프롬프트 + OpenAI 블로그 생성
│   └── types/
│       └── index.d.ts        # 공유 타입 정의
├── public/
│   └── index.html            # 프론트엔드 (Lilys AI 스타일 UI)
├── .env                      # OPENAI_API_KEY, PORT
└── dist/                     # 컴파일된 JS (git ignore)
```

## 실행 방법
```bash
npm run build    # TypeScript 컴파일
npm start        # 서버 실행 (localhost:3000)
npm run dev      # ts-node로 개발 모드 실행
```

## 외부 의존성 (시스템에 설치 필요)
- `yt-dlp` — YouTube 자막/오디오 다운로드 (`brew install yt-dlp`)
- `whisper` — 음성→텍스트 변환 (`pip3 install openai-whisper`)

## 환경 변수
- `OPENAI_API_KEY` — OpenAI API 키 (필수)
- `PORT` — 서버 포트 (기본값: 3000)

## 코딩 컨벤션
- TypeScript strict mode
- 한국어 에러 메시지 사용
- 사용자 메시지는 한국어, 로그는 `[태그]` 접두사 사용 (`[transcript]`, `[whisper]`, `[generate-blog]`)
- `satisfies` 키워드로 API 응답 타입 검증
- 프론트엔드는 프레임워크 없이 vanilla JS, CSS 변수 활용

## 자막 추출 흐름
1. yt-dlp로 한국어 자막 시도 (자동 자막 포함)
2. 실패 시 영어 자막 시도
3. 모두 실패 시 → yt-dlp로 오디오 다운로드 → Whisper STT (small 모델, 한국어)

## 블로그 생성 흐름
1. 트랜스크립트 중복 문장 제거 (자동 자막 정제)
2. 20,000자 초과 시 앞/중간/뒤 3분할 트렁케이션
3. 상세 시스템 프롬프트로 OpenAI에 블로그 생성 요청
4. JSON 응답: title, subtitle, outline, content, tags, summary

## 에러 처리
- yt-dlp 429/네트워크 에러: 자동 재시도 (최대 2회, 점진적 대기)
- OpenAI 에러: 자동 재시도 + 사용자 친화적 메시지 반환
- 에러 분류: 400 (잘못된 입력) / 422 (자막 없음) / 429 (과다 요청) / 502 (AI 서비스) / 504 (타임아웃)
