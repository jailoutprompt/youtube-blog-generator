import openai from '../config/openai';
import { BlogData } from '../types/index.d';

const SYSTEM_PROMPT = `당신은 10년 경력의 전문 블로그 콘텐츠 라이터입니다.
유튜브 영상의 자막(트랜스크립트)을 전달받으면, 이를 기반으로 **독립적인 블로그 글**을 작성합니다.

## 작성 원칙

### 구조
1. **도입부**: 독자의 관심을 끄는 hook 문장으로 시작. 이 글에서 다룰 내용을 1-2문장으로 소개.
2. **본론**: 3~6개 섹션으로 나눠 H2(##) 소제목 사용. 각 섹션은 2~4문단. 필요시 H3(###)으로 세분화.
3. **결론**: 핵심 내용 요약 + 독자에게 한마디 (행동 유도 또는 생각거리).

### 톤 & 스타일
- 한국어, 반말/존댓말 혼합 가능하되 **"~입니다/합니다"** 체 기본 사용
- 핵심 키워드와 중요 문장은 **볼드(**) 처리
- 적절한 비유, 예시, 비교를 활용해 이해를 도움
- 리스트(불릿/숫자)를 적극 활용해 가독성 확보
- 문단이 5줄 이상 넘어가지 않도록 적절히 끊기
- 딱딱한 논문체 ❌ → 읽기 편한 블로그체 ✅

### 분량
- 본문(content)은 **최소 2,000자, 권장 3,000~4,000자**
- 아웃라인은 3~6개 항목
- 요약(summary)은 3~5문장

### 절대 금지
- "이 영상에서는", "영상을 보면", "유튜버가 말하길" 등 **영상을 직접 참조하는 표현 사용 금지**
- 이 글은 독립적인 블로그 포스트이므로, 원본이 영상이라는 사실을 드러내지 않음
- 뜬구름 잡는 일반론 ❌ → 트랜스크립트에 있는 **구체적 정보, 수치, 사례** 위주로 작성
- 트랜스크립트에 없는 내용을 지어내지 않음

### SEO 최적화
- title은 검색에 잘 걸리도록 핵심 키워드 포함, 30자 내외
- tags는 관련 키워드 5~8개

## 응답 형식
반드시 아래 JSON으로만 응답하세요:
{
  "title": "SEO 친화적 블로그 제목 (30자 내외)",
  "subtitle": "부제목 — 한 줄로 글의 핵심 요약",
  "outline": ["섹션1 제목", "섹션2 제목", ...],
  "content": "## 소제목\\n\\n본문...\\n\\n## 소제목\\n\\n본문... (마크다운)",
  "tags": ["키워드1", "키워드2", ...],
  "summary": "이 글의 핵심을 3~5문장으로 요약"
}`;

const MAX_TRANSCRIPT_LENGTH = 20000;

/**
 * 자동 자막 특유의 반복/중복 문장 제거
 */
function deduplicateTranscript(transcript: string): string {
  const sentences = transcript.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 5) continue;

    // 이미 본 문장과 80% 이상 겹치면 스킵
    let isDuplicate = false;
    for (const prev of seen) {
      if (prev.length > 10 && normalized.includes(prev.slice(0, Math.floor(prev.length * 0.8)))) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.add(normalized);
      result.push(sentence.trim());

      // seen이 너무 커지지 않도록 최근 50개만 유지
      if (seen.size > 50) {
        const first = seen.values().next().value;
        if (first !== undefined) seen.delete(first);
      }
    }
  }

  return result.join(' ');
}

function truncateTranscript(transcript: string): string {
  // 먼저 중복 제거
  const cleaned = deduplicateTranscript(transcript);

  if (cleaned.length <= MAX_TRANSCRIPT_LENGTH) {
    return cleaned;
  }

  const chunkSize = Math.floor(MAX_TRANSCRIPT_LENGTH / 3);
  const start = cleaned.slice(0, chunkSize);
  const midStart = Math.floor(cleaned.length / 2 - chunkSize / 2);
  const middle = cleaned.slice(midStart, midStart + chunkSize);
  const end = cleaned.slice(-chunkSize);

  return `[앞부분]\n${start}\n\n[중간부분]\n${middle}\n\n[뒷부분]\n${end}`;
}

export async function generateFromTranscript(
  transcript: string
): Promise<BlogData> {
  const trimmed = truncateTranscript(transcript);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `다음 텍스트를 기반으로 블로그 글을 작성해주세요:\n\n${trimmed}`,
      },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('OpenAI 응답이 비어있습니다.');
  }

  const parsed = JSON.parse(raw) as BlogData;

  if (!parsed.title || !parsed.outline || !parsed.content) {
    throw new Error('OpenAI 응답 형식이 올바르지 않습니다.');
  }

  // 새 필드 기본값 보장
  parsed.subtitle = parsed.subtitle || '';
  parsed.tags = parsed.tags || [];
  parsed.summary = parsed.summary || '';

  return parsed;
}
