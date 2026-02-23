import openai from '../config/openai';
import { BlogData, BlogTone, BlogModel, BlogTemplate } from '../types/index.d';
import { TEMPLATE_PROMPTS } from './templates';

const BASE_PROMPT = `당신은 10년 경력의 전문 블로그 콘텐츠 라이터입니다.
유튜브 영상의 자막(트랜스크립트)을 전달받으면, 이를 기반으로 **독립적인 블로그 글**을 작성합니다.

## 작성 원칙

### 구조
1. **도입부**: 독자의 관심을 끄는 hook 문장으로 시작. 이 글에서 다룰 내용을 1-2문장으로 소개.
2. **본론**: 3~6개 섹션으로 나눠 H2(##) 소제목 사용. 각 섹션은 2~4문단. 필요시 H3(###)으로 세분화.
3. **결론**: 핵심 내용 요약 + 독자에게 한마디 (행동 유도 또는 생각거리).

### 분량 (가장 중요한 규칙 — 위반 시 실패로 간주)
- content 필드의 총 글자 수: **최소 3,000자, 목표 4,000~5,000자**
- 참고: 한국어 3,000자 = 대략 A4 2페이지 분량. 이 정도는 써야 함
- H2 섹션 수: **최소 5개** (도입부 제외, 결론 포함)
- 각 H2 섹션: **최소 3~4문단, 500자 이상**씩 작성. 한 문단은 2~3문장
- 아웃라인은 5~6개 항목
- 요약(summary)은 3~5문장
- 트랜스크립트의 구체적 사례, 인용, 수치, 에피소드를 **하나도 빠뜨리지 말고** 본문에 상세히 풀어 쓸 것
- 추상적 요약 금지. 트랜스크립트 내용을 구체적으로 서술할 것
- **작성 후 스스로 글자 수를 세어보고, 3,000자 미만이면 각 섹션에 내용을 보충할 것**

### 절대 금지
- "이 영상에서는", "영상을 보면", "유튜버가 말하길" 등 **영상을 직접 참조하는 표현 사용 금지**
- 이 글은 독립적인 블로그 포스트이므로, 원본이 영상이라는 사실을 드러내지 않음
- 뜬구름 잡는 일반론 금지 → 트랜스크립트에 있는 **구체적 정보, 수치, 사례** 위주로 작성
- 트랜스크립트에 없는 내용을 지어내지 않음

### SEO 최적화
- title은 검색에 잘 걸리도록 핵심 키워드 포함, 30자 내외
- tags는 관련 키워드 5~8개`;

const TONE_PROMPTS: Record<BlogTone, string> = {
  informative: `
### 톤 & 스타일: 정보형
- 한국어, **"~입니다/합니다"** 체 사용
- 객관적이고 분석적인 톤. 데이터와 사실 중심 서술
- 핵심 키워드와 중요 문장은 **볼드** 처리
- 적절한 비유, 예시, 비교를 활용해 이해를 도움
- 리스트(불릿/숫자)를 적극 활용해 가독성 확보
- 문단이 5줄 이상 넘어가지 않도록 적절히 끊기`,

  casual: `
### 톤 & 스타일: 캐주얼
- 한국어, **"~해요/~거든요/~인데요"** 체 사용 (친근한 존댓말)
- 친구에게 이야기하듯 편하고 자연스러운 대화체
- 이모지는 사용하지 않되, 감탄사("와", "진짜", "대박")는 자연스럽게 사용
- 독자에게 직접 말 거는 느낌 ("혹시 ~해본 적 있으세요?", "이거 진짜 중요한 부분인데요")
- 핵심 포인트는 **볼드** 처리
- 짧은 문단, 한 문단에 2~3문장
- 중간중간 독자 공감 유도 ("이런 경험 다들 있죠?")`,

  expert: `
### 톤 & 스타일: 전문가
- 한국어, **"~이다/~한다"** 체 사용 (전문 칼럼 스타일)
- 깊이 있는 분석과 인사이트 중심. 피상적 설명 지양
- 업계 전문 용어를 적절히 사용하되 필요시 괄호 안에 간단한 설명 추가
- 논리적 흐름: 주장 → 근거 → 시사점
- "주목할 점은", "핵심은", "결론적으로" 등 분석적 표현 활용
- 비교/대조, 원인/결과 구조를 통해 깊이 있는 논점 전개
- 마지막에 전문가적 관점에서의 전망이나 제언 포함`,
};

const RESPONSE_FORMAT = `
## 응답 형식
반드시 아래 JSON으로만 응답하세요:
{
  "title": "SEO 친화적 블로그 제목 (30자 내외)",
  "subtitle": "부제목 — 한 줄로 글의 핵심 요약",
  "outline": ["섹션1 제목", "섹션2 제목", ...],
  "content": "## 소제목\\n\\n본문 (최소 400자)...\\n\\n## 소제목\\n\\n본문 (최소 400자)... (마크다운, 총 3000자 이상 필수)",
  "tags": ["키워드1", "키워드2", ...],
  "summary": "이 글의 핵심을 3~5문장으로 요약"
}

⚠️ content 필드는 반드시 한국어 3,000자 이상이어야 합니다. 짧은 글은 허용되지 않습니다.`;

function buildSystemPrompt(tone: BlogTone, template: BlogTemplate = 'general'): string {
  return BASE_PROMPT + TONE_PROMPTS[tone] + TEMPLATE_PROMPTS[template] + RESPONSE_FORMAT;
}

const MAX_TRANSCRIPT_LENGTH = 20000;

/**
 * 자동 자막 특유의 반복/중복 문장 제거
 */
export function deduplicateTranscript(transcript: string): string {
  const sentences = transcript.split(/(?<=[.!?])\s+/);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const sentence of sentences) {
    const normalized = sentence.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length < 5) continue;

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

      if (seen.size > 50) {
        const first = seen.values().next().value;
        if (first !== undefined) seen.delete(first);
      }
    }
  }

  return result.join(' ');
}

export function truncateTranscript(transcript: string, maxLength: number = MAX_TRANSCRIPT_LENGTH): string {
  const cleaned = deduplicateTranscript(transcript);

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const chunkSize = Math.floor(maxLength / 3);
  const start = cleaned.slice(0, chunkSize);
  const midStart = Math.floor(cleaned.length / 2 - chunkSize / 2);
  const middle = cleaned.slice(midStart, midStart + chunkSize);
  const end = cleaned.slice(-chunkSize);

  return `[앞부분]\n${start}\n\n[중간부분]\n${middle}\n\n[뒷부분]\n${end}`;
}

export interface GenerateOptions {
  tone?: BlogTone;
  model?: BlogModel;
  template?: BlogTemplate;
}

export async function generateFromTranscript(
  transcript: string,
  options: GenerateOptions = {}
): Promise<BlogData> {
  const tone = options.tone || 'informative';
  const model = options.model || 'gpt-4o-mini';
  const template = options.template || 'general';
  const trimmed = truncateTranscript(transcript);

  console.log(`[blog-gen] tone=${tone}, model=${model}, template=${template}`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(tone, template) },
      {
        role: 'user',
        content: `다음 텍스트를 기반으로 블로그 글을 작성해주세요. content는 반드시 3,000자 이상으로, 각 섹션을 깊이 있게 풀어서 작성해주세요:\n\n${trimmed}`,
      },
    ],
    temperature: tone === 'expert' ? 0.5 : tone === 'casual' ? 0.8 : 0.7,
    max_tokens: 8192,
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

  parsed.subtitle = parsed.subtitle || '';
  parsed.tags = parsed.tags || [];
  parsed.summary = parsed.summary || '';

  // 본문이 너무 짧으면 확장 요청
  if (parsed.content.length < 3000) {
    console.log(`[blog-gen] 본문 ${parsed.content.length}자 → 확장 요청`);
    const expanded = await expandContent(parsed, model);
    parsed.content = expanded;
  }

  console.log(`[blog-gen] 최종 본문 길이: ${parsed.content.length}자`);
  return parsed;
}

const EXPAND_PROMPT = `당신은 블로그 글 편집자입니다. 아래 블로그 글이 너무 짧습니다.
각 섹션의 내용을 2~3배로 확장해주세요.

규칙:
- 기존 구조(## 소제목)를 유지하되, 각 섹션에 문단을 추가
- 구체적 설명, 예시, 배경 정보를 풍성하게 추가
- 새로운 섹션을 추가하지 말고 기존 섹션을 깊이 있게 확장
- 총 3,000자 이상으로 만들 것
- 마크다운 형식 유지
- 확장된 content만 응답 (JSON 아님, 마크다운 본문만)`;

async function expandContent(blog: BlogData, model: BlogModel): Promise<string> {
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: EXPAND_PROMPT },
      {
        role: 'user',
        content: `제목: ${blog.title}\n\n${blog.content}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 8192,
  });

  const expanded = response.choices[0]?.message?.content;
  if (expanded && expanded.length > blog.content.length) {
    return expanded;
  }
  return blog.content;
}
