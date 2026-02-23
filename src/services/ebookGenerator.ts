import openai from '../config/openai';
import { BlogModel, EbookOutline, EbookChapterResult } from '../types/index.d';
import { deduplicateTranscript, truncateTranscript } from './blogGenerator';

export { deduplicateTranscript, truncateTranscript };

const EBOOK_TRANSCRIPT_MAX = 25000;

// ─── 1) 아웃라인 생성 ───

export interface ChapterInput {
  videoId: string;
  title: string;
  transcriptPreview: string; // 앞 500자
}

const OUTLINE_SYSTEM = `당신은 전문 출판 편집자입니다. 유튜브 영상 시리즈를 기반으로 전자책 구성을 설계합니다.

## 작업
각 영상의 제목과 내용 미리보기를 보고:
1. 전자책 전체 **제목**과 **부제**를 정합니다
2. 영상들을 가장 논리적인 읽기 순서로 **재배열**합니다
3. 각 영상의 **챕터 제목**을 전자책에 맞게 다듬습니다 (영상 느낌 제거)
4. **서론** 작성 방향을 2~3문장으로 정합니다
5. **결론** 작성 방향을 2~3문장으로 정합니다

## 원칙
- 제목은 전자책답게 전문적이고 매력적으로
- 챕터 제목에서 "유튜브", "영상", "구독" 등 영상 관련 표현 제거
- 한국어로 작성

## 응답 형식 (JSON만)
{
  "title": "전자책 제목",
  "subtitle": "부제",
  "chapterOrder": [원래인덱스 순서, 예: 2, 0, 1, 3],
  "chapterTitles": ["챕터1 제목", "챕터2 제목", ...],
  "introDirection": "서론에서 다룰 내용과 방향",
  "conclusionDirection": "결론에서 다룰 내용과 방향"
}`;

export async function generateEbookOutline(
  chapters: ChapterInput[],
  model: BlogModel = 'gpt-4o-mini',
): Promise<EbookOutline> {
  const chaptersText = chapters
    .map((c, i) => `[영상 ${i}] 제목: ${c.title}\n내용 미리보기: ${c.transcriptPreview}`)
    .join('\n\n');

  console.log(`[ebook] 아웃라인 생성 시작 (${chapters.length}개 영상, model=${model})`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: OUTLINE_SYSTEM },
      { role: 'user', content: `다음 ${chapters.length}개 영상으로 전자책을 구성해주세요:\n\n${chaptersText}` },
    ],
    temperature: 0.7,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('아웃라인 생성 응답이 비어있습니다.');

  const parsed = JSON.parse(raw) as EbookOutline;

  if (!parsed.title || !parsed.chapterOrder || !parsed.chapterTitles) {
    throw new Error('아웃라인 응답 형식이 올바르지 않습니다.');
  }

  console.log(`[ebook] 아웃라인 완료: "${parsed.title}" (${parsed.chapterTitles.length}장)`);
  return parsed;
}

// ─── 2) 챕터 생성 ───

const CHAPTER_SYSTEM = `당신은 전문 전자책 작가입니다. 유튜브 영상의 트랜스크립트를 전자책의 한 챕터로 변환합니다.

## 작성 원칙
- 이 글은 독립적인 전자책 챕터. 원본이 영상이라는 사실을 절대 드러내지 않음
- "영상에서", "유튜버가", "구독" 등 영상 관련 표현 사용 금지
- **최소 2,000자, 목표 3,000~4,000자**
- H2(##)로 섹션 구분, 2~4개 섹션
- 트랜스크립트의 구체적 사례, 인용, 수치를 빠뜨리지 말고 상세히 서술
- 한국어, "~입니다/합니다" 체
- 각 섹션은 최소 3문단, 충분한 깊이로 작성

## 응답 형식 (JSON만)
{ "content": "## 섹션 제목\\n\\n본문...\\n\\n## 섹션 제목\\n\\n본문..." }`;

export async function generateEbookChapter(
  transcript: string,
  chapterTitle: string,
  chapterNum: number,
  totalChapters: number,
  ebookTitle: string,
  model: BlogModel = 'gpt-4o-mini',
): Promise<EbookChapterResult> {
  const trimmed = truncateTranscript(transcript, EBOOK_TRANSCRIPT_MAX);

  console.log(`[ebook] 챕터 ${chapterNum}/${totalChapters} 생성 시작: "${chapterTitle}"`);

  const userMsg = `전자책 "${ebookTitle}"의 제${chapterNum}장 (전체 ${totalChapters}장 중)
챕터 제목: "${chapterTitle}"

아래 트랜스크립트를 기반으로 이 챕터를 작성해주세요. 최소 2,000자 이상으로 깊이 있게 작성하세요:

${trimmed}`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: CHAPTER_SYSTEM },
      { role: 'user', content: userMsg },
    ],
    temperature: 0.6,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error(`챕터 ${chapterNum} 생성 응답이 비어있습니다.`);

  const parsed = JSON.parse(raw) as EbookChapterResult;
  if (!parsed.content) throw new Error(`챕터 ${chapterNum} 응답에 content가 없습니다.`);

  console.log(`[ebook] 챕터 ${chapterNum} 완료: ${parsed.content.length}자`);
  return parsed;
}

// ─── 3) 서론/결론 생성 ───

const INTRO_SYSTEM = `당신은 전문 전자책 작가입니다. 전자책의 서론을 작성합니다.

## 원칙
- 독자의 관심을 끌면서도 책의 전체 내용을 자연스럽게 소개
- 각 챕터가 다루는 핵심 내용을 흐름 있게 언급
- 독자가 이 책을 통해 얻을 수 있는 가치를 명확히 전달
- 한국어, "~입니다/합니다" 체
- 800~1,500자
- 영상, 유튜브 관련 표현 사용 금지

## 응답 형식 (JSON만)
{ "content": "서론 본문..." }`;

const CONCLUSION_SYSTEM = `당신은 전문 전자책 작가입니다. 전자책의 결론을 작성합니다.

## 원칙
- 각 챕터에서 다룬 핵심 내용을 종합적으로 정리
- 독자에게 실질적인 행동 지침이나 영감을 전달
- 책 전체를 관통하는 메시지를 강조
- 한국어, "~입니다/합니다" 체
- 800~1,500자
- 영상, 유튜브 관련 표현 사용 금지

## 응답 형식 (JSON만)
{ "content": "결론 본문..." }`;

export async function generateEbookIntroConclusion(
  type: 'intro' | 'conclusion',
  ebookTitle: string,
  ebookSubtitle: string,
  chapterTitles: string[],
  chapterSummaries: string[],
  direction: string,
  model: BlogModel = 'gpt-4o-mini',
): Promise<EbookChapterResult> {
  const systemMsg = type === 'intro' ? INTRO_SYSTEM : CONCLUSION_SYSTEM;
  const label = type === 'intro' ? '서론' : '결론';

  const chaptersInfo = chapterTitles
    .map((t, i) => `제${i + 1}장 "${t}": ${chapterSummaries[i] || ''}`)
    .join('\n');

  console.log(`[ebook] ${label} 생성 시작`);

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemMsg },
      {
        role: 'user',
        content: `전자책 제목: "${ebookTitle}"
부제: "${ebookSubtitle}"

챕터 구성:
${chaptersInfo}

${label} 작성 방향: ${direction}

위 내용을 바탕으로 ${label}을 작성해주세요.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error(`${label} 생성 응답이 비어있습니다.`);

  const parsed = JSON.parse(raw) as EbookChapterResult;
  if (!parsed.content) throw new Error(`${label} 응답에 content가 없습니다.`);

  console.log(`[ebook] ${label} 완료: ${parsed.content.length}자`);
  return parsed;
}
