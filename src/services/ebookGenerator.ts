import { anthropic } from '../config/openai';
import { BlogModel, EbookOutline, EbookChapterResult, EbookPreviewStructure, EbookPreviewSection, EbookPreviewChapter, EbookColorScheme } from '../types/index.d';
import { deduplicateTranscript, truncateTranscript } from './blogGenerator';

export { deduplicateTranscript, truncateTranscript };

const CLAUDE_MODEL = 'claude-sonnet-4-5';

// Anthropic 호출 헬퍼
async function callClaude(systemPrompt: string, userPrompt: string, maxTokens: number = 4096, temperature: number = 0.7): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt + '\n\n반드시 JSON만 반환하세요. 다른 텍스트 없이 순수 JSON만. 전체 JSON 응답은 반드시 20000자 이내로 작성하세요. 완전한 JSON을 반환하는 것이 가장 중요합니다.',
    messages: [{ role: 'user', content: userPrompt }],
  });
  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  if (!text) throw new Error('Claude 응답이 비어있습니다.');
  // JSON 블록 추출 (```json ... ``` 감싸는 경우 대비)
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Claude 응답에서 JSON을 찾을 수 없습니다: ' + text.slice(0, 200));
  let jsonStr = jsonMatch[1] || jsonMatch[0];

  // 잘린 JSON 복구
  try {
    JSON.parse(jsonStr);
  } catch {
    console.log('[ebook-gen] JSON 파싱 실패, 복구 시도...');
    let fixed = jsonStr;
    // 불완전한 문자열 닫기
    const quotes = (fixed.match(/(?<!\\)"/g) || []).length;
    if (quotes % 2 !== 0) fixed += '"';
    // 마지막 완전한 } 또는 ] 뒤를 찾아 자르기
    const lastBrace = fixed.lastIndexOf('}');
    const lastBracket = fixed.lastIndexOf(']');
    const cutPoint = Math.max(lastBrace, lastBracket);
    if (cutPoint > 0) {
      fixed = fixed.slice(0, cutPoint + 1);
    }
    // 브래킷 균형 맞추기
    const countChar = (s: string, c: string) => { let n = 0; for (const ch of s) if (ch === c) n++; return n; };
    const diffBrackets = countChar(fixed, '[') - countChar(fixed, ']');
    const diffBraces = countChar(fixed, '{') - countChar(fixed, '}');
    for (let i = 0; i < diffBrackets; i++) fixed += ']';
    for (let i = 0; i < diffBraces; i++) fixed += '}';
    try {
      JSON.parse(fixed);
      jsonStr = fixed;
      console.log('[ebook-gen] JSON 복구 성공');
    } catch (e2) {
      // 더 공격적으로: 마지막 완전한 챕터까지만 유지
      const chaptersMatch = fixed.match(/"chapters"\s*:\s*\[/);
      if (chaptersMatch) {
        const start = chaptersMatch.index! + chaptersMatch[0].length;
        // 챕터 객체들을 하나씩 파싱
        let depth = 0, lastEnd = start;
        for (let i = start; i < fixed.length; i++) {
          if (fixed[i] === '{') depth++;
          if (fixed[i] === '}') { depth--; if (depth === 0) lastEnd = i + 1; }
        }
        const trimmed = fixed.slice(0, lastEnd) + ']}';
        try {
          JSON.parse(trimmed);
          jsonStr = trimmed;
          console.log('[ebook-gen] JSON 챕터 단위 복구 성공');
        } catch { console.log('[ebook-gen] JSON 복구 최종 실패'); }
      }
    }
  }

  return jsonStr;
}

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
  model: BlogModel = 'gemini-2.0-flash',
): Promise<EbookOutline> {
  const chaptersText = chapters
    .map((c, i) => `[영상 ${i}] 제목: ${c.title}\n내용 미리보기: ${c.transcriptPreview}`)
    .join('\n\n');

  console.log(`[ebook] 아웃라인 생성 시작 (${chapters.length}개 영상, Claude Sonnet)`);

  const raw = await callClaude(
    OUTLINE_SYSTEM,
    `다음 ${chapters.length}개 영상으로 전자책을 구성해주세요:\n\n${chaptersText}`,
    2048, 0.7
  );

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
  model: BlogModel = 'gemini-2.0-flash',
): Promise<EbookChapterResult> {
  const trimmed = truncateTranscript(transcript, EBOOK_TRANSCRIPT_MAX);

  console.log(`[ebook] 챕터 ${chapterNum}/${totalChapters} 생성 시작: "${chapterTitle}"`);

  const userMsg = `전자책 "${ebookTitle}"의 제${chapterNum}장 (전체 ${totalChapters}장 중)
챕터 제목: "${chapterTitle}"

아래 트랜스크립트를 기반으로 이 챕터를 작성해주세요. 최소 2,000자 이상으로 깊이 있게 작성하세요:

${trimmed}`;

  const raw = await callClaude(CHAPTER_SYSTEM, userMsg, 8192, 0.6);

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
  model: BlogModel = 'gemini-2.0-flash',
): Promise<EbookChapterResult> {
  const systemMsg = type === 'intro' ? INTRO_SYSTEM : CONCLUSION_SYSTEM;
  const label = type === 'intro' ? '서론' : '결론';

  const chaptersInfo = chapterTitles
    .map((t, i) => `제${i + 1}장 "${t}": ${chapterSummaries[i] || ''}`)
    .join('\n');

  console.log(`[ebook] ${label} 생성 시작`);

  const raw = await callClaude(
    systemMsg,
    `전자책 제목: "${ebookTitle}"
부제: "${ebookSubtitle}"

챕터 구성:
${chaptersInfo}

${label} 작성 방향: ${direction}

위 내용을 바탕으로 ${label}을 작성해주세요.`,
    4096, 0.7
  );

  const parsed = JSON.parse(raw) as EbookChapterResult;
  if (!parsed.content) throw new Error(`${label} 응답에 content가 없습니다.`);

  console.log(`[ebook] ${label} 완료: ${parsed.content.length}자`);
  return parsed;
}

// ══════════════════════════════════════════════════════════════
// ── 맛보기 프리뷰 생성 (POST /api/taste-preview) ──
// ══════════════════════════════════════════════════════════════

export interface TastePreviewResult {
  title: string;
  subtitle: string;
  author: string;
  colorScheme: EbookColorScheme;
  chapters: Array<{ title: string; subtitle: string }>;  // 6챕터 아웃라인
  chapter1: EbookPreviewChapter;  // Ch.1 풀 콘텐츠
  totalPages: number;  // 풀버전 예상 페이지수
}

const TASTE_SYSTEM = `당신은 베스트셀러 전자책 작가이자 다이렉트 리스폰스 카피라이터입니다.
주어진 텍스트를 분석하여, 전자책 맛보기(표지 + 목차 + 1챕터)를 JSON으로 반환하세요.

## 팔리는 전자책의 원칙
전체 6챕터를 HPSSPA 공식으로 구성:
1장 Hook(고통 찌르기) — PAS 공식. 독자가 겪는 문제를 찌르고 해결책 암시.
2장 Promise(변신 약속) — Before/After를 선명하게.
3장 Story(증거) — 실제 사례와 스토리.
4장 System(방법론) — 핵심 프레임워크.
5장 Proof(숫자+반박) — ROI, 의심 제거.
6장 Action(지금 당장) — 체크리스트, 행동 유도.

## 작업
1. 전자책 제목, 부제, colorScheme을 정한다
2. 6챕터의 제목과 부제를 정한다 (HPSSPA 순서)
3. **1챕터(Hook)만 풀 콘텐츠로 작성한다** — 섹션 3개, 비주얼 요소 포함

## 1챕터 작성 원칙
- 독자의 고통을 정확히 찌르는 Hook 챕터
- 감정을 건드리는 첫 문장
- 구체적 숫자와 사례 포함
- 섹션 3개: 서로 다른 타입 (text, stats, list, quote, table, timeline, comparison 중 택3)
- stats items는 정확히 3개
- text는 4문장 이상
- 입력이 짧아도 풍부하게 확장

## 반환 JSON
{
  "title": "클릭하고 싶은 제목",
  "subtitle": "변신을 약속하는 부제",
  "author": "저자명",
  "colorScheme": "business|tech|education|creative|minimal",
  "chapters": [
    { "title": "1장 제목", "subtitle": "1장 부제" },
    { "title": "2장 제목", "subtitle": "2장 부제" },
    { "title": "3장 제목", "subtitle": "3장 부제" },
    { "title": "4장 제목", "subtitle": "4장 부제" },
    { "title": "5장 제목", "subtitle": "5장 부제" },
    { "title": "6장 제목", "subtitle": "6장 부제" }
  ],
  "chapter1": {
    "title": "1장 제목",
    "subtitle": "1장 부제",
    "sections": [
      { "type": "text", "content": { "text": "4문장 이상" } },
      { "type": "stats", "content": { "items": [{"value":"수치","label":"설명"},{"value":"수치","label":"설명"},{"value":"수치","label":"설명"}] } },
      { "type": "quote", "content": { "text": "밑줄 긋고 싶은 문장", "author": "출처" } }
    ]
  }
}`;

export async function generateTastePreview(
  content: string,
  titleOverride?: string,
  authorOverride?: string,
): Promise<TastePreviewResult> {
  console.log(`[taste] 맛보기 생성 시작 (입력 ${content.length}자)`);

  const raw = await callClaude(
    TASTE_SYSTEM,
    `다음 텍스트를 기반으로 전자책 맛보기(표지+목차+1챕터)를 만들어주세요.
HPSSPA 공식: 1장=Hook, 2장=Promise, 3장=Story, 4장=System, 5장=Proof, 6장=Action

원본 텍스트:\n\n${content}`,
    4096, 0.7
  );

  const parsed = JSON.parse(raw) as TastePreviewResult;

  if (titleOverride) parsed.title = titleOverride;
  if (authorOverride) parsed.author = authorOverride;
  if (!parsed.chapters || parsed.chapters.length < 6) {
    throw new Error('맛보기 응답에 6개 챕터 아웃라인이 없습니다.');
  }

  // chapter1이 없으면 chapters[0]에서 sections가 있는지 확인하여 복구
  if (!parsed.chapter1 || !parsed.chapter1.sections) {
    // Claude가 chapter1 키를 안 줬을 수 있음 — chapters[0]에 sections가 있으면 그걸 사용
    const ch0 = parsed.chapters[0] as any;
    if (ch0 && ch0.sections && Array.isArray(ch0.sections)) {
      parsed.chapter1 = {
        title: ch0.title,
        subtitle: ch0.subtitle || '',
        sections: ch0.sections,
      };
      console.log('[taste] chapter1을 chapters[0]에서 복구');
    } else {
      throw new Error('맛보기 응답에 chapter1 콘텐츠가 없습니다. chapters[0]에도 sections 없음.');
    }
  }

  // stats 보정
  if (parsed.chapter1?.sections) {
    for (const section of parsed.chapter1.sections) {
      if (section.type === 'stats' && Array.isArray(section.content?.items)) {
        const items = section.content.items as Array<{ value: string; label: string }>;
        while (items.length < 3) items.push({ value: '-', label: '-' });
        if (items.length > 3) section.content.items = items.slice(0, 3);
      }
    }
  }

  parsed.totalPages = 1 + 1 + 6 + 1; // 표지 + 목차 + 6챕터 + 브랜딩 = 9 (풀버전 기준)

  console.log(`[taste] 맛보기 완료: "${parsed.title}", 6챕터 아웃라인 + Ch.1 풀콘텐츠`);
  return parsed;
}

// ── 맛보기 HTML 생성 (표지 + 목차 + Ch.1 + 잠금 페이지) ──
export function generateTasteHtml(taste: TastePreviewResult): string {
  const scheme = COLOR_SCHEMES[taste.colorScheme] || COLOR_SCHEMES.business;
  const { bg, accent, gradientFrom, gradientTo } = scheme;
  const accentLight = accent + '15';
  const accentMedium = accent + '30';

  const renderSection = (section: EbookPreviewSection): string => {
    switch (section.type) {
      case 'text':
        return `<div class="text-section"><p>${section.content.text}</p></div>`;
      case 'stats':
        return `<div class="stat-grid">${
          (section.content.items as Array<any>)
            .slice(0, 3)
            .map((item: any) => {
              const val = item.value || item.stat || item.number || item.num || Object.values(item)[0] || '—';
              const lbl = item.label || item.description || item.desc || item.text || Object.values(item)[1] || '';
              return `<div class="stat-card"><div class="stat-num">${val}</div><div class="stat-label">${lbl}</div></div>`;
            })
            .join('')
        }</div>`;
      case 'list':
        return `<ul class="bullet-list">${
          (section.content.items as any[]).map((item: any) => {
            if (typeof item === 'string') return `<li>${item}</li>`;
            // 객체인 경우: {title, description} 또는 {text} 등
            const title = item.title || item.name || item.text || '';
            const desc = item.description || item.detail || item.content || '';
            return `<li><strong>${title}</strong>${desc ? ' — ' + desc : ''}</li>`;
          }).join('')
        }</ul>`;
      case 'quote':
        return `<div class="quote-box">
<div class="quote-mark">\u201C</div>
<p class="quote-text">${section.content.text}</p>
${section.content.author ? `<p class="quote-author">\u2014 ${section.content.author}</p>` : ''}
</div>`;
      case 'table':
        return `<div class="table-wrap"><table>${
          section.content.headers
            ? `<thead><tr>${(section.content.headers as string[]).map((h: string) => `<th>${h}</th>`).join('')}</tr></thead>`
            : ''
        }<tbody>${
          (section.content.rows as string[][]).map((row: string[], ri: number) =>
            `<tr class="${ri % 2 === 1 ? 'stripe' : ''}">${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`
          ).join('')
        }</tbody></table></div>`;
      case 'timeline':
        return `<div class="timeline">${
          (section.content.items as Array<any>)
            .map((item: any) => {
              const heading = item.title || item.period || item.step || '—';
              const desc = item.description || item.event || item.result || item.detail || '';
              const extra = item.result && item.event ? ` → ${item.result}` : '';
              return `<div class="tl-item"><div class="tl-dot"></div><div class="tl-content"><h4>${heading}</h4><p>${desc}${extra}</p></div></div>`;
            })
            .join('')
        }</div>`;
      case 'comparison': {
        // Claude가 { left: {title, items}, right: {title, items} } 또는 { title, items } 형태로 줄 수 있음
        const left = section.content.left;
        const right = section.content.right;
        if (left && right) {
          return `<div class="comparison-grid">
<div class="comp-side comp-left">
<h4>${left.title || left.label || 'Before'}</h4>
<ul class="bullet-list">${(left.items as string[] || []).map((i: string) => `<li>${i}</li>`).join('')}</ul>
</div>
<div class="comp-side comp-right">
<h4>${right.title || right.label || 'After'}</h4>
<ul class="bullet-list">${(right.items as string[] || []).map((i: string) => `<li>${i}</li>`).join('')}</ul>
</div>
</div>`;
        }
        // 폴백: { title, items } 단일 리스트 형태
        const items = section.content.items as string[] || [];
        const title = section.content.title || '비교';
        if (items.length > 0) {
          return `<ul class="bullet-list">${items.map((i: string) => `<li>${i}</li>`).join('')}</ul>`;
        }
        return '';
      }
      default:
        return `<div class="text-section"><p>${JSON.stringify(section.content)}</p></div>`;
    }
  };

  const ch1Sections = taste.chapter1.sections.map(renderSection).join('\n');

  const tocItems = taste.chapters.map((ch, i) =>
    `<div class="toc-item"><span class="toc-label">Chapter ${String(i + 1).padStart(2, '0')}</span><span class="toc-title">${ch.title}</span><span class="toc-dots"></span><span class="toc-page">${String(i + 3).padStart(2, '0')}</span></div>`
  ).join('\n');

  // 잠긴 챕터들 (Ch.2~6)
  const lockedChapters = taste.chapters.slice(1).map((ch, i) => `
<div class="page locked-page">
<div class="chapter-header">
<div class="ch-num">CHAPTER ${String(i + 2).padStart(2, '0')}</div>
<h2>${ch.title}</h2>
<p class="ch-sub">${ch.subtitle}</p>
</div>
<div class="lock-overlay">
<div class="lock-icon">🔒</div>
<p class="lock-text">풀버전에서 읽을 수 있습니다</p>
</div>
<span class="page-num">${String(i + 4).padStart(2, '0')}</span>
</div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${taste.title} — 맛보기</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;background:#f0f0f0;color:#1a1a1a;line-height:1.85;-webkit-font-smoothing:antialiased}
.page{width:210mm;min-height:297mm;margin:0 auto 20px;padding:55px 60px;background:#fff;box-shadow:0 4px 30px rgba(0,0,0,.12);position:relative;page-break-after:always;overflow:hidden}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:40px 50px}}
.cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,${gradientFrom},${bg},${gradientTo});color:#fff;padding:80px 60px}
.cover .ebook-label{font-size:13px;color:${accent};font-weight:700;letter-spacing:4px;text-transform:uppercase;padding:8px 24px;border:2px solid ${accent}40;border-radius:30px;display:inline-block}
.cover .accent-line{width:80px;height:4px;background:linear-gradient(90deg,${accent},${accent}99);margin:35px auto;border-radius:2px}
.cover h1{font-size:44px;font-weight:900;letter-spacing:-1px;line-height:1.3;max-width:600px}
.cover .subtitle{font-size:19px;font-weight:300;margin-top:18px;color:#bbb;max-width:500px;line-height:1.6}
.cover .author-name{font-size:17px;font-weight:500;margin-top:45px;color:${accent};letter-spacing:1px}
.cover .bottom-info{position:absolute;bottom:50px;font-size:12px;color:#555;letter-spacing:1px}
.cover .free-badge{margin-top:30px;padding:6px 20px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:20px;font-size:12px;color:#10b981;font-weight:600}
.toc-header{font-size:30px;font-weight:900;color:${bg};margin-bottom:8px}
.section-bar{width:60px;height:4px;background:linear-gradient(90deg,${accent},${accent}99);margin-bottom:35px;border-radius:2px}
.toc-item{display:flex;align-items:baseline;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;gap:10px}
.toc-label{color:${accent};font-weight:700;font-size:12px;letter-spacing:1px;min-width:85px}
.toc-title{font-weight:500;color:#333;flex-shrink:0}
.toc-dots{flex:1;border-bottom:2px dotted #ddd;margin:0 8px;min-width:20px;align-self:flex-end;margin-bottom:3px}
.toc-page{color:${accent};font-weight:700;font-size:15px;min-width:24px;text-align:right}
.page-num{position:absolute;bottom:30px;right:60px;font-size:12px;color:#999;font-weight:500}
.chapter-header{background:linear-gradient(135deg,${bg},${gradientTo});color:#fff;padding:28px 30px;border-radius:16px;margin-bottom:28px;position:relative;overflow:hidden}
.chapter-header::after{content:'';position:absolute;top:0;right:0;width:120px;height:120px;background:${accent}15;border-radius:0 0 0 120px}
.chapter-header .ch-num{font-size:12px;color:${accent};font-weight:700;letter-spacing:3px;text-transform:uppercase}
.chapter-header h2{font-size:26px;font-weight:900;margin-top:8px;line-height:1.3}
.chapter-header .ch-sub{font-size:13px;color:#999;margin-top:8px;font-weight:400}
.text-section{margin:16px 0}
.text-section p{font-size:14.5px;margin-bottom:14px;color:#333;line-height:1.85}
.text-section p strong{color:${bg};font-weight:700}
.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0}
.stat-card{background:linear-gradient(135deg,#f8f9fa,#fff);border:2px solid #f0f0f0;border-radius:14px;padding:22px 16px;text-align:center}
.stat-num{font-size:30px;font-weight:900;color:${accent};line-height:1.2;letter-spacing:-1px}
.stat-label{font-size:12px;color:#888;margin-top:8px;font-weight:500;line-height:1.4}
.bullet-list{list-style:none;padding:0;margin:16px 0}
.bullet-list li{position:relative;padding-left:22px;margin-bottom:12px;font-size:14px;color:#444;line-height:1.7}
.bullet-list li::before{content:'';position:absolute;left:0;top:9px;width:8px;height:8px;background:${accent};border-radius:50%}
.quote-box{background:linear-gradient(135deg,${accentLight},${accentMedium});border-left:4px solid ${accent};border-radius:0 16px 16px 0;padding:28px 30px;margin:22px 0}
.quote-mark{font-size:48px;color:${accent};opacity:.4;line-height:1;margin-bottom:5px;font-family:Georgia,serif}
.quote-text{font-size:16px;font-weight:600;color:#222;line-height:1.7;margin:0}
.quote-author{font-size:13px;color:${accent};font-weight:700;text-align:right;margin-top:12px}
.table-wrap{margin:20px 0;border-radius:12px;overflow:hidden;border:1px solid #e8e8e8}
.table-wrap table{width:100%;border-collapse:collapse;font-size:13px}
.table-wrap th{background:${bg};color:#fff;padding:12px 16px;text-align:left;font-weight:600;font-size:12px}
.table-wrap td{padding:11px 16px;border-bottom:1px solid #f0f0f0;color:#444}
.table-wrap tr.stripe{background:#f9fafb}
.timeline{border-left:3px solid ${accent};margin:22px 0 22px 16px;padding-left:28px}
.tl-item{margin-bottom:22px;position:relative}
.tl-dot{position:absolute;left:-36px;top:4px;width:14px;height:14px;background:${accent};border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px ${accent}}
.tl-content h4{font-size:15px;font-weight:700;color:${bg};margin-bottom:4px}
.tl-content p{font-size:13px;color:#555;line-height:1.7;margin:0}
.comparison-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:22px 0}
.comp-side{border-radius:14px;padding:22px}
.comp-left{background:#f8f9fa;border:2px solid ${accent}40}
.comp-left h4{color:${accent};font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${accent}30}
.comp-right{background:#f8f9fa;border:2px solid ${bg}40}
.comp-right h4{color:${bg};font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${bg}30}
.comp-side .bullet-list{margin:0}
.comp-side .bullet-list li{font-size:13px;margin-bottom:8px}
.locked-page{position:relative}
.lock-overlay{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;opacity:0.6}
.lock-icon{font-size:64px;margin-bottom:16px}
.lock-text{font-size:16px;color:#999;font-weight:500}
</style>
</head>
<body>

<!-- COVER -->
<div class="page cover">
<div>
<span class="ebook-label">E-BOOK</span>
<div class="accent-line"></div>
<h1>${taste.title}</h1>
<p class="subtitle">${taste.subtitle}</p>
<div class="accent-line"></div>
${taste.author ? `<p class="author-name">${taste.author}</p>` : ''}
<div class="free-badge">FREE PREVIEW \u00B7 \uB9DB\uBCF4\uAE30</div>
</div>
<p class="bottom-info">${new Date().getFullYear()} Edition \u00B7 Made with MetaPress</p>
</div>

<!-- TOC -->
<div class="page">
<h2 class="toc-header">\uBAA9\uCC28</h2>
<div class="section-bar"></div>
${tocItems}
<span class="page-num">02</span>
</div>

<!-- Ch.1 FULL -->
<div class="page">
<div class="chapter-header">
<div class="ch-num">CHAPTER 01</div>
<h2>${taste.chapter1.title}</h2>
<p class="ch-sub">${taste.chapter1.subtitle}</p>
</div>
${ch1Sections}
<span class="page-num">03</span>
</div>

<!-- LOCKED Ch.2~6 -->
${lockedChapters}

</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// ── 풀버전 생성 (POST /api/full-version) ──
// ══════════════════════════════════════════════════════════════

export interface FullVersionChapterResult {
  title: string;
  subtitle: string;
  sections: EbookPreviewSection[];
}

const FULLVER_CHAPTER_SYSTEM = `당신은 베스트셀러 전자책 작가이자 다이렉트 리스폰스 카피라이터입니다.
전자책의 특정 챕터를 풀 콘텐츠로 작성하세요.

## 글쓰기 원칙
- 독자에게 말을 걸어라. "~하세요", "~해보세요" 톤.
- 구체적으로 써라. 숫자, 이름, 사례 필수.
- 감정을 건드려라. 첫 문장은 독자의 감정을 자극.
- 액션을 줘라. 챕터 끝에 구체적 행동 1가지 이상.

## 포맷
- 정확히 3개의 서로 다른 섹션 (같은 타입 연속 금지)
- 최소 1개 비주얼 요소 (stats/table/timeline/comparison)
- stats items는 정확히 3개
- text는 4문장 이상
- list는 4항목 이상
- 입력이 짧아도 풍부하게 확장

## JSON 응답
{
  "title": "챕터 제목",
  "subtitle": "챕터 부제",
  "sections": [
    { "type": "text|stats|list|quote|table|timeline|comparison", "content": {...} }
  ]
}`;

export async function generateFullVersionChapter(
  content: string,
  chapterInfo: { title: string; subtitle: string },
  chapterNum: number,
  role: string, // HPSSPA 역할
  bookTitle: string,
): Promise<FullVersionChapterResult> {
  console.log(`[full-ver] Ch.${chapterNum} 생성 시작: "${chapterInfo.title}"`);

  const raw = await callClaude(
    FULLVER_CHAPTER_SYSTEM,
    `전자책 "${bookTitle}"의 제${chapterNum}장을 작성하세요.

챕터 제목: ${chapterInfo.title}
챕터 부제: ${chapterInfo.subtitle}
챕터 역할: ${role}

원본 텍스트를 기반으로 이 챕터에 맞는 내용을 풍부하게 작성하세요:

${content}`,
    4096, 0.7
  );

  const parsed = JSON.parse(raw) as FullVersionChapterResult;
  if (!parsed.sections || parsed.sections.length === 0) {
    throw new Error(`Ch.${chapterNum} 응답에 sections가 없습니다.`);
  }

  // stats 보정
  for (const section of parsed.sections) {
    if (section.type === 'stats' && Array.isArray(section.content?.items)) {
      const items = section.content.items as Array<{ value: string; label: string }>;
      while (items.length < 3) items.push({ value: '-', label: '-' });
      if (items.length > 3) section.content.items = items.slice(0, 3);
    }
  }

  console.log(`[full-ver] Ch.${chapterNum} 완료: ${parsed.sections.length}섹션`);
  return parsed;
}

// ══════════════════════════════════════════════════════════════
// ── 텍스트 전자책 (A 방식) — 마크다운 → 깔끔한 PDF ──
// ══════════════════════════════════════════════════════════════

export interface TextEbookResult {
  title: string;
  subtitle: string;
  author: string;
  chapters: Array<{ title: string; content: string }>; // 마크다운 본문
}

const TEXT_EBOOK_SYSTEM = `당신은 베스트셀러 전자책 작가이자 다이렉트 리스폰스 카피라이터입니다.
주어진 텍스트를 기반으로 전자책을 마크다운으로 작성하세요.

## 톤 & 스타일 (가장 중요)
- **독자에게 직접 말을 걸어라.** "~입니다"를 최소화하고 "~하세요", "~해보세요", "~하지 않나요?" 톤.
- **첫 문장은 감정을 찌른다.** 각 챕터의 첫 문장은 독자의 고통, 불안, 욕망을 자극해야 함. "매달 통장을 확인할 때마다 한숨이 나오지 않나요?" 이런 톤.
- **교과서처럼 쓰지 마라.** "~의 구조는 다음과 같습니다" 같은 딱딱한 표현 금지. 친구한테 설명하듯이.
- **구체적으로 써라.** "많은 돈" → "월 200만원", "한 사람" → "크몽 셀러 끝판왕Kim"
- **문단마다 후킹.** 독자가 중간에 그만 읽지 않게. 각 문단 끝에 다음 문단을 읽고 싶게 만드는 장치.
- 핵심 문장은 **볼드** 처리.
- 소제목(##)으로 섹션 구분. 챕터당 3~4개 소제목.
- 목록이 필요하면 - 불릿 사용.

## 분량 (매우 중요 — 반드시 지킬 것)
- **챕터당 최소 2,500자, 목표 3,000자.**
- 3챕터 합계 최소 7,500자.
- 각 소제목 아래 최소 3~4문단. 문단은 3~5문장.
- 짧게 쓰지 마세요. 독자가 돈 내고 산 전자책입니다.
- 사례, 비유, 구체적 상황 묘사를 넣어서 분량을 채우세요.

## 응답 형식 (구분자 기반 — JSON이 아닙니다!)
첫 줄에 제목, 둘째 줄에 부제, 셋째 줄에 저자명을 쓰고,
각 챕터는 ===CHAPTER=== 구분자로 시작합니다.
챕터 구분자 다음 줄에 챕터 제목, 그 다음부터 마크다운 본문입니다.

예시:
나의 전자책 제목
나의 부제
저자명
===CHAPTER===
1장. 챕터 제목
## 소제목
본문 내용...
===CHAPTER===
2장. 챕터 제목
## 소제목
본문 내용...

중요: 반드시 3개 챕터를 ===CHAPTER=== 구분자로 나눠서 작성하세요. JSON으로 감싸지 마세요.`;

// 구분자 기반 응답 파싱
function parseTextEbookResponse(raw: string): { title: string; subtitle: string; author: string; chapters: Array<{ title: string; content: string }> } {
  // callClaude가 JSON 추출을 시도하므로, 원본 텍스트를 직접 받아야 함
  // 구분자로 분할
  const parts = raw.split('===CHAPTER===').map(s => s.trim()).filter(s => s.length > 0);

  if (parts.length < 2) {
    throw new Error(`챕터 구분자를 찾을 수 없습니다. 응답 앞부분: ${raw.slice(0, 200)}`);
  }

  // 첫 파트에서 제목/부제/저자 추출
  const headerLines = parts[0].split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const title = headerLines[0] || '무제';
  const subtitle = headerLines[1] || '';
  const author = headerLines[2] || '';

  // 나머지 파트들이 챕터
  const chapters = parts.slice(1).map(chapterRaw => {
    const lines = chapterRaw.split('\n');
    const chTitle = lines[0]?.trim() || '무제';
    const chContent = lines.slice(1).join('\n').trim();
    return { title: chTitle, content: chContent };
  });

  return { title, subtitle, author, chapters };
}

export async function generateTextEbook(
  content: string,
  titleOverride?: string,
): Promise<TextEbookResult> {
  console.log(`[text-ebook] 텍스트 전자책 생성 시작 (입력 ${content.length}자)`);

  // callClaude가 JSON 추출을 하므로, 텍스트 모드용 별도 호출 함수
  const callClaudeText = async (systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> => {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    if (!text) throw new Error('Claude 응답이 비어있습니다.');
    return text;
  };

  // 1~3장
  const raw1 = await callClaudeText(
    TEXT_EBOOK_SYSTEM,
    `다음 텍스트를 기반으로 전자책의 1~3장을 작성하세요.
HPSSPA 공식: 1장=Hook(고통 찌르기), 2장=Promise(변신 약속), 3장=Story(증거)
각 챕터는 최소 2,500자 이상. 반드시 3개 챕터를 ===CHAPTER=== 구분자로 나눠서 작성하세요.
${titleOverride ? `제목: ${titleOverride}` : ''}

원본 텍스트:\n\n${content}`,
    8192
  );

  const part1 = parseTextEbookResponse(raw1);
  console.log(`[text-ebook] 1~3장 완료: ${part1.chapters.length}챕터, ${part1.chapters.reduce((s, c) => s + c.content.length, 0)}자`);

  // 4~6장
  const raw2 = await callClaudeText(
    TEXT_EBOOK_SYSTEM,
    `다음 텍스트를 기반으로 전자책의 4~6장을 작성하세요.
전자책 제목: "${part1.title}"
HPSSPA 공식: 4장=System(핵심 방법론), 5장=Proof(숫자+반박), 6장=Action(지금 당장)
각 챕터는 최소 2,500자 이상. 반드시 3개 챕터를 ===CHAPTER=== 구분자로 나눠서 작성하세요.
이미 작성된 1~3장 제목: ${part1.chapters.map(c => c.title).join(', ')}

원본 텍스트:\n\n${content}`,
    8192
  );

  const part2 = parseTextEbookResponse(raw2);
  console.log(`[text-ebook] 4~6장 완료: ${part2.chapters.length}챕터, ${part2.chapters.reduce((s, c) => s + c.content.length, 0)}자`);

  const result: TextEbookResult = {
    title: titleOverride || part1.title,
    subtitle: part1.subtitle || '',
    author: part1.author || '',
    chapters: [...part1.chapters, ...part2.chapters],
  };

  console.log(`[text-ebook] 전체 완료: "${result.title}", ${result.chapters.length}챕터`);
  return result;
}

// ── 텍스트 전자책 → 깔끔한 HTML ──
export function generateTextEbookHtml(book: TextEbookResult): string {
  const mdToHtml = (md: string): string => {
    return md
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3 class="section-title">$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      .replace(/^(?!<[hul])(.*\S.*)$/gm, '<p>$1</p>')
      .replace(/\n{2,}/g, '\n');
  };

  const tocHtml = book.chapters.map((ch, i) =>
    `<div class="toc-item"><span class="toc-num">${String(i + 1).padStart(2, '0')}</span><span class="toc-title">${ch.title}</span><span class="toc-dots"></span><span class="toc-page">${String(i + 3).padStart(2, '0')}</span></div>`
  ).join('\n');

  const chaptersHtml = book.chapters.map((ch, i) => `
<div class="page">
  <div class="ch-header">
    <span class="ch-num">Chapter ${String(i + 1).padStart(2, '0')}</span>
    <h2>${ch.title}</h2>
  </div>
  <div class="ch-body">${mdToHtml(ch.content)}</div>
  <div class="page-num">${String(i + 3).padStart(2, '0')}</div>
</div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${book.title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&family=Noto+Sans+KR:wght@400;500;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;background:#f5f5f0;color:#1a1a1a;line-height:1.9;-webkit-font-smoothing:antialiased}
.page{width:210mm;min-height:297mm;margin:0 auto 24px;padding:60px 65px;background:#fff;box-shadow:0 2px 20px rgba(0,0,0,.08);position:relative;page-break-after:always}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:50px 60px}}

/* Cover */
.cover{display:flex;flex-direction:column;justify-content:center;padding:80px 65px;background:#fff;border-bottom:6px solid #1a1a1a}
.cover .label{font-size:12px;font-weight:700;letter-spacing:6px;text-transform:uppercase;color:#888;margin-bottom:40px}
.cover h1{font-family:'Noto Serif KR',serif;font-size:42px;font-weight:900;line-height:1.25;letter-spacing:-1px;color:#1a1a1a;margin-bottom:16px}
.cover .subtitle{font-size:17px;color:#666;line-height:1.6;margin-bottom:48px}
.cover .author{font-size:15px;font-weight:700;color:#1a1a1a;padding-top:24px;border-top:2px solid #eee}
.cover .meta{position:absolute;bottom:60px;left:65px;font-size:11px;color:#bbb;letter-spacing:1px}

/* TOC */
.toc h2{font-family:'Noto Serif KR',serif;font-size:28px;font-weight:900;margin-bottom:32px;color:#1a1a1a}
.toc-item{display:flex;align-items:baseline;padding:12px 0;border-bottom:1px solid #f0f0f0;gap:12px}
.toc-num{font-size:13px;font-weight:700;color:#999;min-width:28px}
.toc-title{font-size:15px;font-weight:500;color:#333}
.toc-dots{flex:1;border-bottom:1px dotted #ddd;margin:0 8px;min-width:20px;align-self:flex-end;margin-bottom:4px}
.toc-page{font-size:14px;font-weight:700;color:#999;min-width:24px;text-align:right}

/* Chapter */
.ch-header{margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #1a1a1a}
.ch-num{font-size:12px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#999;display:block;margin-bottom:8px}
.ch-header h2{font-family:'Noto Serif KR',serif;font-size:28px;font-weight:900;line-height:1.3;color:#1a1a1a}
.ch-body{font-size:15px;color:#333;line-height:1.9}
.ch-body .section-title{font-family:'Noto Serif KR',serif;font-size:19px;font-weight:700;color:#1a1a1a;margin:32px 0 16px;padding-top:16px;border-top:1px solid #eee}
.ch-body p{margin-bottom:16px}
.ch-body strong{color:#1a1a1a;font-weight:700}
.ch-body ul{margin:12px 0 20px 0;padding-left:0;list-style:none}
.ch-body li{position:relative;padding-left:20px;margin-bottom:8px;line-height:1.7}
.ch-body li::before{content:'—';position:absolute;left:0;color:#999}
.ch-body h4{font-size:16px;font-weight:700;color:#1a1a1a;margin:24px 0 12px}

/* Page number */
.page-num{position:absolute;bottom:40px;right:65px;font-size:12px;color:#bbb;font-weight:500}

/* Ending */
.ending{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:80px 65px}
.ending h2{font-family:'Noto Serif KR',serif;font-size:28px;font-weight:900;margin-bottom:16px;color:#1a1a1a}
.ending p{font-size:15px;color:#888;margin-bottom:8px}
.ending .brand{margin-top:48px;font-size:12px;color:#bbb;letter-spacing:2px}
</style>
</head>
<body>

<!-- Cover -->
<div class="page cover">
  <div class="label">E-BOOK</div>
  <h1>${book.title}</h1>
  <p class="subtitle">${book.subtitle}</p>
  <p class="author">${book.author || 'MetaPress'}</p>
  <p class="meta">${new Date().getFullYear()} &middot; Made with MetaPress</p>
</div>

<!-- TOC -->
<div class="page toc">
  <h2>목차</h2>
  ${tocHtml}
  <div class="page-num">02</div>
</div>

<!-- Chapters -->
${chaptersHtml}

<!-- Ending -->
<div class="page ending">
  <h2>감사합니다</h2>
  <p>${book.title}</p>
  <p>${book.author || ''}</p>
  <div class="brand">METAPRESS &middot; AI 전자책 생성 엔진</div>
</div>

</body>
</html>`;
}

// ══════════════════════════════════════════════════════════════
// ── 전자책 프리뷰 생성 엔진 (POST /api/create-preview) — 레거시 ──
// ══════════════════════════════════════════════════════════════

const COLOR_SCHEMES: Record<EbookColorScheme, { bg: string; accent: string; gradientFrom: string; gradientTo: string }> = {
  business:  { bg: '#1a1a2e', accent: '#e94560', gradientFrom: '#0a0a0a', gradientTo: '#1a1a2e' },
  tech:      { bg: '#0f172a', accent: '#3b82f6', gradientFrom: '#020617', gradientTo: '#0f172a' },
  education: { bg: '#1a2e1a', accent: '#10b981', gradientFrom: '#0a1a0a', gradientTo: '#1a2e1a' },
  creative:  { bg: '#2e1a2e', accent: '#8b5cf6', gradientFrom: '#1a0a1a', gradientTo: '#2e1a2e' },
  minimal:   { bg: '#1a1a1a', accent: '#666666', gradientFrom: '#0a0a0a', gradientTo: '#1a1a1a' },
};

// ── a) AI 구조 분석 ──
export async function analyzePreviewContent(
  content: string,
  titleOverride?: string,
  authorOverride?: string,
): Promise<EbookPreviewStructure> {
  console.log(`[ebook-gen] analyzeContent 시작 (입력 ${content.length}자)`);

  const systemPrompt = `당신은 베스트셀러 전자책 작가이자 다이렉트 리스폰스 카피라이터입니다.
주어진 텍스트를 분석하여, **독자가 돈을 내고 살 만한** 전자책 구조를 JSON으로 반환하세요.

## 팔리는 전자책의 원칙 (이것이 핵심)

당신이 만드는 전자책은 정보 나열이 아닙니다. **독자의 변신(Transformation)을 약속하는 여정**입니다.

### 구조 공식: HPSSPA
전체 6챕터를 아래 역할에 맞게 구성하세요:

1장 **Hook (고통 찌르기)** — PAS 공식 적용. 독자가 지금 겪는 문제를 정확히 짚고, 그 고통을 증폭시키고, 해결책이 있다고 암시. "왜 당신은 아직도 ~하는가?" 톤.
2장 **Promise (변신 약속)** — 이 책을 다 읽으면 독자가 어떻게 변하는지 구체적으로 보여줌. Before/After를 선명하게. 숫자와 기한 포함.
3장 **Story (증거와 스토리)** — 실제 사례, 창업자 스토리, 성공/실패담. 독자가 "나도 할 수 있겠다"고 느끼게. 추상적 조언 금지, 구체적 이름/숫자/상황 필수.
4장 **System (핵심 방법론)** — 이 책만의 프레임워크/시스템을 제시. 3~5단계로 정리. 독자가 따라할 수 있는 체계. 이 챕터가 책의 핵심 가치.
5장 **Proof (숫자와 반박)** — 수익 시나리오, 비용 계산, ROI. "근데 이건 안 되지 않나?"에 대한 반박. 의심을 제거.
6장 **Action (지금 당장)** — 오늘/이번 주/이번 달 할 것. 체크리스트 형태. 읽고 바로 행동할 수 있게. 마지막에 강렬한 한 줄로 마무리.

### 글쓰기 원칙
- **독자에게 말을 걸어라.** "~입니다"보다 "~하세요", "~해보세요" 톤. 강의가 아니라 1:1 대화.
- **구체적으로 써라.** "많은 돈" → "월 200만원", "성공한 사람" → "Nathan Barry, 전자책 3권으로 $500K"
- **감정을 건드려라.** 각 챕터 첫 문장은 독자의 감정(불안, 욕망, 호기심)을 자극해야 함.
- **액션을 줘라.** 모든 챕터 끝에 독자가 할 수 있는 구체적 행동 1가지 이상.

## 포맷 규칙

1. **전체 챕터 수는 정확히 6개**. 절대 초과하지 마세요.
2. **각 챕터에 정확히 3개의 서로 다른 섹션**. 같은 타입 연속 사용 금지. 3개를 초과하지 마세요.
3. **모든 챕터에 최소 1개의 비주얼 요소** (stats, table, timeline, comparison 중 택1).
4. **stats items는 정확히 3개** (3열 그리드).
5. **text 섹션은 3~4문장**. 빈약하지도, 너무 길지도 않게.
6. **list 항목은 4개 이상**. 각 항목은 설명 포함.
7. **quote는 독자가 밑줄 긋고 싶은 문장**. 15자 이상.
8. colorScheme은 내용에 맞게 자동 결정 (business|tech|education|creative|minimal).
9. 한국어로 작성.
10. 입력 텍스트가 짧아도 각 챕터를 풍부하게 확장. 배경지식, 사례, 분석 적극 추가.

## 반환 JSON 스키마
{
  "title": "독자가 클릭하고 싶은 제목 (혜택 또는 숫자 포함)",
  "subtitle": "구체적 변신을 약속하는 부제",
  "author": "저자명",
  "colorScheme": "business|tech|education|creative|minimal",
  "chapters": [
    {
      "title": "챕터 제목 (독자의 감정을 건드리는)",
      "subtitle": "챕터 부제",
      "sections": [
        { "type": "text", "content": { "text": "HTML 가능. 최소 4문장." } },
        { "type": "stats", "content": { "items": [{"value":"수치","label":"설명"},{"value":"수치","label":"설명"},{"value":"수치","label":"설명"}] } },
        { "type": "list", "content": { "items": ["항목1: 설명","항목2: 설명","항목3: 설명","항목4: 설명"] } },
        { "type": "quote", "content": { "text": "밑줄 긋고 싶은 문장", "author": "출처" } },
        { "type": "table", "content": { "headers": ["A","B","C"], "rows": [["1","2","3"]] } },
        { "type": "timeline", "content": { "items": [{"title":"단계","description":"설명 2문장 이상"}] } },
        { "type": "comparison", "content": { "left": {"title":"A","items":["1","2","3","4"]}, "right": {"title":"B","items":["1","2","3","4"]} } }
      ]
    }
  ]
}`;

  const raw = await callClaude(
    systemPrompt,
    `다음 텍스트를 "팔리는 전자책"으로 변환해주세요.

HPSSPA 공식을 따라 6챕터로 구성하세요:
1장=Hook(고통 찌르기), 2장=Promise(변신 약속), 3장=Story(증거), 4장=System(방법론), 5장=Proof(숫자+반박), 6장=Action(지금 당장)

정보 나열이 아니라, 독자의 문제를 풀어주고 변신을 약속하는 구조로 써주세요.
각 챕터 첫 문장은 독자의 감정을 건드려야 합니다.

원본 텍스트:\n\n${content}`,
    16384, 0.7
  );

  const parsed = JSON.parse(raw) as EbookPreviewStructure;

  if (titleOverride) parsed.title = titleOverride;
  if (authorOverride) parsed.author = authorOverride;

  // 후처리: stats items가 3개가 아닌 경우 보정
  for (const chapter of parsed.chapters) {
    for (const section of chapter.sections) {
      if (section.type === 'stats' && Array.isArray(section.content?.items)) {
        const items = section.content.items as Array<{ value: string; label: string }>;
        if (items.length < 3) {
          while (items.length < 3) {
            items.push({ value: '-', label: '-' });
          }
        } else if (items.length > 3) {
          section.content.items = items.slice(0, 3);
        }
      }
    }
  }

  // totalPages: 표지(1) + 목차(1) + 챕터수 + 브랜딩(1)
  parsed.totalPages = 1 + 1 + parsed.chapters.length + 1;

  console.log(`[ebook-gen] 구조 분석 완료: ${parsed.chapters.length}챕터, ${parsed.totalPages}페이지`);
  return parsed;
}

// ── b) HTML 생성 ──
export function generatePreviewHtml(structure: EbookPreviewStructure): string {
  const scheme = COLOR_SCHEMES[structure.colorScheme] || COLOR_SCHEMES.business;
  const { bg, accent, gradientFrom, gradientTo } = scheme;

  // accent 색상의 밝은 버전 계산 (배경용)
  const accentLight = accent + '15';
  const accentMedium = accent + '30';

  const renderSection = (section: EbookPreviewSection): string => {
    switch (section.type) {
      case 'text':
        return `<div class="text-section"><p>${section.content.text}</p></div>`;

      case 'stats':
        return `<div class="stat-grid">${
          (section.content.items as Array<any>)
            .slice(0, 3)
            .map((item: any) => {
              const val = item.value || item.stat || item.number || item.num || Object.values(item)[0] || '—';
              const lbl = item.label || item.description || item.desc || item.text || Object.values(item)[1] || '';
              return `<div class="stat-card"><div class="stat-num">${val}</div><div class="stat-label">${lbl}</div></div>`;
            })
            .join('')
        }</div>`;

      case 'list':
        return `<ul class="bullet-list">${
          (section.content.items as string[])
            .map((item: string) => `<li>${item}</li>`)
            .join('')
        }</ul>`;

      case 'quote':
        return `<div class="quote-box">
<div class="quote-mark">\u201C</div>
<p class="quote-text">${section.content.text}</p>
${section.content.author ? `<p class="quote-author">\u2014 ${section.content.author}</p>` : ''}
</div>`;

      case 'table':
        return `<div class="table-wrap"><table>${
          section.content.headers
            ? `<thead><tr>${(section.content.headers as string[]).map((h: string) => `<th>${h}</th>`).join('')}</tr></thead>`
            : ''
        }<tbody>${
          (section.content.rows as string[][]).map((row: string[], ri: number) =>
            `<tr class="${ri % 2 === 1 ? 'stripe' : ''}">${row.map((cell: string) => `<td>${cell}</td>`).join('')}</tr>`
          ).join('')
        }</tbody></table></div>`;

      case 'timeline':
        return `<div class="timeline">${
          (section.content.items as Array<any>)
            .map((item: any) => {
              const heading = item.title || item.period || item.step || '—';
              const desc = item.description || item.event || item.result || item.detail || '';
              const extra = item.result && item.event ? ` → ${item.result}` : '';
              return `<div class="tl-item"><div class="tl-dot"></div><div class="tl-content"><h4>${heading}</h4><p>${desc}${extra}</p></div></div>`;
            })
            .join('')
        }</div>`;

      case 'comparison': {
        // Claude가 { left: {title, items}, right: {title, items} } 또는 { title, items } 형태로 줄 수 있음
        const left = section.content.left;
        const right = section.content.right;
        if (left && right) {
          return `<div class="comparison-grid">
<div class="comp-side comp-left">
<h4>${left.title || left.label || 'Before'}</h4>
<ul class="bullet-list">${(left.items as string[] || []).map((i: string) => `<li>${i}</li>`).join('')}</ul>
</div>
<div class="comp-side comp-right">
<h4>${right.title || right.label || 'After'}</h4>
<ul class="bullet-list">${(right.items as string[] || []).map((i: string) => `<li>${i}</li>`).join('')}</ul>
</div>
</div>`;
        }
        // 폴백: { title, items } 단일 리스트 형태
        const items = section.content.items as string[] || [];
        const title = section.content.title || '비교';
        if (items.length > 0) {
          return `<ul class="bullet-list">${items.map((i: string) => `<li>${i}</li>`).join('')}</ul>`;
        }
        return '';
      }

      default:
        return `<div class="text-section"><p>${JSON.stringify(section.content)}</p></div>`;
    }
  };

  const renderChapter = (chapter: EbookPreviewChapter, index: number, pageNum: number): string => {
    const chapterNum = String(index + 1).padStart(2, '0');
    const sectionsHtml = chapter.sections.map(renderSection).join('\n');
    return `
<!-- PAGE ${pageNum}: Chapter ${chapterNum} -->
<div class="page">
<div class="chapter-header">
<div class="ch-num">CHAPTER ${chapterNum}</div>
<h2>${chapter.title}</h2>
${chapter.subtitle ? `<p class="ch-sub">${chapter.subtitle}</p>` : ''}
</div>
${sectionsHtml}
<span class="page-num">${String(pageNum).padStart(2, '0')}</span>
</div>`;
  };

  const tocItems = structure.chapters.map((ch, i) => {
    const pageNum = i + 3;
    return `<div class="toc-item"><span class="toc-label">Chapter ${String(i + 1).padStart(2, '0')}</span><span class="toc-title">${ch.title}</span><span class="toc-dots"></span><span class="toc-page">${String(pageNum).padStart(2, '0')}</span></div>`;
  }).join('\n');

  const chaptersHtml = structure.chapters.map((ch, i) => renderChapter(ch, i, i + 3)).join('\n');
  const lastPage = structure.totalPages;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${structure.title}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');

/* ── Reset & Base ── */
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;background:#f0f0f0;color:#1a1a1a;line-height:1.85;-webkit-font-smoothing:antialiased}

/* ── Page ── */
.page{width:210mm;min-height:297mm;margin:0 auto 20px;padding:55px 60px;background:#fff;box-shadow:0 4px 30px rgba(0,0,0,.12);position:relative;page-break-after:always;overflow:hidden}
@media print{body{background:#fff}.page{box-shadow:none;margin:0;padding:40px 50px;overflow:visible}}

/* ── Cover Page ── */
.cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,${gradientFrom} 0%,${bg} 40%,${gradientTo} 100%);color:#fff;padding:80px 60px}
.cover .ebook-label{font-size:13px;color:${accent};font-weight:700;letter-spacing:4px;text-transform:uppercase;padding:8px 24px;border:2px solid ${accent}40;border-radius:30px;display:inline-block}
.cover .accent-line{width:80px;height:4px;background:linear-gradient(90deg,${accent},${accent}99);margin:35px auto;border-radius:2px}
.cover h1{font-size:44px;font-weight:900;letter-spacing:-1px;line-height:1.3;max-width:600px}
.cover h1 span{color:${accent}}
.cover .subtitle{font-size:19px;font-weight:300;margin-top:18px;color:#bbb;max-width:500px;line-height:1.6}
.cover .author-name{font-size:17px;font-weight:500;margin-top:45px;color:${accent};letter-spacing:1px}
.cover .bottom-info{position:absolute;bottom:50px;font-size:12px;color:#555;letter-spacing:1px}

/* ── TOC ── */
.toc-header{font-size:30px;font-weight:900;color:${bg};margin-bottom:8px}
.section-bar{width:60px;height:4px;background:linear-gradient(90deg,${accent},${accent}99);margin-bottom:35px;border-radius:2px}
.toc-item{display:flex;align-items:baseline;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px;gap:10px}
.toc-label{color:${accent};font-weight:700;font-size:12px;letter-spacing:1px;min-width:85px}
.toc-title{font-weight:500;color:#333;flex-shrink:0}
.toc-dots{flex:1;border-bottom:2px dotted #ddd;margin:0 8px;min-width:20px;align-self:flex-end;margin-bottom:3px}
.toc-page{color:${accent};font-weight:700;font-size:15px;min-width:24px;text-align:right}

/* ── Page Numbers ── */
.page-num{position:absolute;bottom:30px;right:60px;font-size:12px;color:#999;font-weight:500}

/* ── Chapter Header ── */
.chapter-header{background:linear-gradient(135deg,${bg},${gradientTo});color:#fff;padding:28px 30px;border-radius:16px;margin-bottom:28px;position:relative;overflow:hidden}
.chapter-header::after{content:'';position:absolute;top:0;right:0;width:120px;height:120px;background:${accent}15;border-radius:0 0 0 120px}
.chapter-header .ch-num{font-size:12px;color:${accent};font-weight:700;letter-spacing:3px;text-transform:uppercase}
.chapter-header h2{font-size:26px;font-weight:900;margin-top:8px;line-height:1.3}
.chapter-header .ch-sub{font-size:13px;color:#999;margin-top:8px;font-weight:400}

/* ── Text Section ── */
.text-section{margin:16px 0}
.text-section p{font-size:14.5px;margin-bottom:14px;color:#333;line-height:1.85}
.text-section p strong{color:${bg};font-weight:700}

/* ── Stats Grid ── */
.stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:22px 0}
.stat-card{background:linear-gradient(135deg,#f8f9fa,#fff);border:2px solid #f0f0f0;border-radius:14px;padding:22px 16px;text-align:center;transition:border-color .2s}
.stat-num{font-size:30px;font-weight:900;color:${accent};line-height:1.2;letter-spacing:-1px}
.stat-label{font-size:12px;color:#888;margin-top:8px;font-weight:500;line-height:1.4}

/* ── Bullet List ── */
.bullet-list{list-style:none;padding:0;margin:16px 0}
.bullet-list li{position:relative;padding-left:22px;margin-bottom:12px;font-size:14px;color:#444;line-height:1.7}
.bullet-list li::before{content:'';position:absolute;left:0;top:9px;width:8px;height:8px;background:${accent};border-radius:50%}
.bullet-list li strong{color:${bg}}

/* ── Quote Box ── */
.quote-box{background:linear-gradient(135deg,${accentLight},${accentMedium});border-left:4px solid ${accent};border-radius:0 16px 16px 0;padding:28px 30px;margin:22px 0;position:relative}
.quote-mark{font-size:48px;color:${accent};opacity:.4;line-height:1;margin-bottom:5px;font-family:Georgia,serif}
.quote-text{font-size:16px;font-weight:600;color:#222;line-height:1.7;margin:0}
.quote-author{font-size:13px;color:${accent};font-weight:700;text-align:right;margin-top:12px}

/* ── Table ── */
.table-wrap{margin:20px 0;border-radius:12px;overflow:hidden;border:1px solid #e8e8e8}
.table-wrap table{width:100%;border-collapse:collapse;font-size:13px}
.table-wrap th{background:${bg};color:#fff;padding:12px 16px;text-align:left;font-weight:600;font-size:12px;letter-spacing:.5px}
.table-wrap td{padding:11px 16px;border-bottom:1px solid #f0f0f0;color:#444}
.table-wrap tr.stripe{background:#f9fafb}
.table-wrap tr:last-child td{border-bottom:none}

/* ── Timeline ── */
.timeline{border-left:3px solid ${accent};margin:22px 0 22px 16px;padding-left:28px}
.tl-item{margin-bottom:22px;position:relative}
.tl-dot{position:absolute;left:-36px;top:4px;width:14px;height:14px;background:${accent};border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px ${accent}}
.tl-content h4{font-size:15px;font-weight:700;color:${bg};margin-bottom:4px}
.tl-content p{font-size:13px;color:#555;line-height:1.7;margin:0}

/* ── Comparison ── */
.comparison-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:22px 0}
.comp-side{border-radius:14px;padding:22px;position:relative}
.comp-left{background:#f8f9fa;border:2px solid ${accent}40}
.comp-left h4{color:${accent};font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${accent}30}
.comp-right{background:#f8f9fa;border:2px solid ${bg}40}
.comp-right h4{color:${bg};font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${bg}30}
.comp-side .bullet-list{margin:0}
.comp-side .bullet-list li{font-size:13px;margin-bottom:8px}

/* ── Ending Page ── */
.ending{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,${gradientFrom} 0%,${bg} 50%,${gradientTo} 100%);color:#fff;padding:80px 60px}
.ending .end-icon{font-size:48px;margin-bottom:20px;opacity:.6}
.ending h2{font-size:32px;font-weight:900;margin-bottom:15px;line-height:1.3}
.ending .end-subtitle{color:#999;font-size:15px;margin-bottom:50px;line-height:1.6}
.ending .brand-divider{width:60px;height:3px;background:linear-gradient(90deg,${accent},${accent}99);margin:0 auto 30px;border-radius:2px}
.ending .brand-logo{font-size:28px;font-weight:900;color:${accent};letter-spacing:3px;margin-bottom:12px}
.ending .brand-tagline{font-size:13px;color:#666;letter-spacing:1px}
.ending .cta-box{margin-top:50px;padding:20px 40px;border:2px solid ${accent}40;border-radius:30px}
.ending .cta-text{font-size:14px;color:${accent};font-weight:600}
</style>
</head>
<body>

<!-- PAGE 1: COVER -->
<div class="page cover">
<div>
<span class="ebook-label">E-BOOK</span>
<div class="accent-line"></div>
<h1>${structure.title}</h1>
<p class="subtitle">${structure.subtitle}</p>
<div class="accent-line"></div>
${structure.author ? `<p class="author-name">${structure.author}</p>` : ''}
</div>
<p class="bottom-info">${new Date().getFullYear()} Edition &middot; Made with MetaPress</p>
</div>

<!-- PAGE 2: TOC -->
<div class="page">
<h2 class="toc-header">\uBAA9\uCC28</h2>
<div class="section-bar"></div>
${tocItems}
<span class="page-num">02</span>
</div>

${chaptersHtml}

<!-- PAGE ${lastPage}: BRANDING -->
<div class="page ending">
<div>
<div class="end-icon">&#9670;</div>
<h2>\uB2F9\uC2E0\uC758 \uAE00\uB3C4<br>\uC804\uC790\uCC45\uC774 \uB420 \uC218 \uC788\uC2B5\uB2C8\uB2E4</h2>
<p class="end-subtitle">${structure.title}${structure.author ? ` \u00B7 ${structure.author}` : ''}</p>
<div class="brand-divider"></div>
<div class="brand-logo">MetaPress</div>
<p class="brand-tagline">AI \uAE30\uBC18 \uC804\uC790\uCC45 \uC790\uB3D9 \uC0DD\uC131 \uC5D4\uC9C4</p>
<div class="cta-box">
<p class="cta-text" style="margin:0">metapress.co &middot; \uBE14\uB85C\uADF8\uC5D0\uC11C \uC804\uC790\uCC45\uAE4C\uC9C0, \uD55C \uBC88\uC5D0</p>
</div>
</div>
</div>

</body>
</html>`;
}

// ── c) Playwright PDF 생성 ──
export async function generatePreviewPdf(htmlPath: string, pdfPath: string): Promise<string> {
  console.log(`[ebook-gen] PDF 변환 시작: ${htmlPath}`);

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });

  await browser.close();
  console.log(`[ebook-gen] PDF 변환 완료: ${pdfPath}`);
  return pdfPath;
}
