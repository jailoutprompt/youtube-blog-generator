import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import {
  generateEbookOutline,
  generateEbookChapter,
  generateEbookIntroConclusion,
  analyzePreviewContent,
  generatePreviewHtml,
  generatePreviewPdf,
  generateTastePreview,
  generateTasteHtml,
  generateFullVersionChapter,
  generateTextEbook,
  generateTextEbookHtml,
  generatePreviewPdf as generatePdf,
  ChapterInput,
  TastePreviewResult,
} from '../services/ebookGenerator';
import { BlogModel, EbookPreviewRequest } from '../types/index.d';

const router = Router();

/**
 * POST /api/ebook/outline
 * 전자책 아웃라인 (제목, 챕터 순서, 서론/결론 방향) 생성
 */
router.post('/ebook/outline', async (req: Request, res: Response) => {
  try {
    const { chapters, model = 'gpt-4o-mini' } = req.body as {
      chapters: ChapterInput[];
      model?: BlogModel;
    };

    if (!chapters || !Array.isArray(chapters) || chapters.length < 2) {
      res.status(400).json({ success: false, error: '최소 2개 이상의 영상이 필요합니다.' });
      return;
    }

    if (chapters.length > 20) {
      res.status(400).json({ success: false, error: '최대 20개까지 선택할 수 있습니다.' });
      return;
    }

    const outline = await generateEbookOutline(chapters, model);

    res.json({ success: true, data: outline });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ebook] 아웃라인 에러:', msg);
    res.status(500).json({ success: false, error: msg || '아웃라인 생성에 실패했습니다.' });
  }
});

/**
 * POST /api/ebook/chapter
 * 단일 챕터 생성
 */
router.post('/ebook/chapter', async (req: Request, res: Response) => {
  try {
    const {
      transcript,
      chapterTitle,
      chapterNum,
      totalChapters,
      ebookTitle,
      model = 'gpt-4o-mini',
    } = req.body as {
      transcript: string;
      chapterTitle: string;
      chapterNum: number;
      totalChapters: number;
      ebookTitle: string;
      model?: BlogModel;
    };

    if (!transcript || !chapterTitle) {
      res.status(400).json({ success: false, error: '트랜스크립트와 챕터 제목이 필요합니다.' });
      return;
    }

    const result = await generateEbookChapter(
      transcript,
      chapterTitle,
      chapterNum,
      totalChapters,
      ebookTitle,
      model,
    );

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ebook] 챕터 생성 에러:`, msg);
    res.status(500).json({ success: false, error: msg || '챕터 생성에 실패했습니다.' });
  }
});

/**
 * POST /api/ebook/intro-conclusion
 * 서론 또는 결론 생성
 */
router.post('/ebook/intro-conclusion', async (req: Request, res: Response) => {
  try {
    const {
      type,
      ebookTitle,
      ebookSubtitle,
      chapterTitles,
      chapterSummaries,
      direction,
      model = 'gpt-4o-mini',
    } = req.body as {
      type: 'intro' | 'conclusion';
      ebookTitle: string;
      ebookSubtitle: string;
      chapterTitles: string[];
      chapterSummaries: string[];
      direction: string;
      model?: BlogModel;
    };

    if (!type || !['intro', 'conclusion'].includes(type)) {
      res.status(400).json({ success: false, error: 'type은 intro 또는 conclusion이어야 합니다.' });
      return;
    }

    const result = await generateEbookIntroConclusion(
      type,
      ebookTitle || '',
      ebookSubtitle || '',
      chapterTitles || [],
      chapterSummaries || [],
      direction || '',
      model,
    );

    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[ebook] intro/conclusion 생성 에러:`, msg);
    res.status(500).json({ success: false, error: msg || '생성에 실패했습니다.' });
  }
});

/**
 * POST /api/ebook/pdf
 * HTML → PDF 변환
 */
router.post('/ebook/pdf', async (req: Request, res: Response) => {
  let browser;
  try {
    const { html, title } = req.body as { html: string; title?: string };

    if (!html) {
      res.status(400).json({ success: false, error: 'HTML 내용이 필요합니다.' });
      return;
    }

    console.log('[ebook] PDF 생성 시작');

    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '40px', right: '40px', bottom: '40px', left: '40px' },
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;text-align:center;font-size:9px;color:#999;padding:10px 0;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
    });

    console.log(`[ebook] PDF 생성 완료: ${pdfBuffer.length} bytes`);

    const filename = `${(title || 'ebook').replace(/[\/\\:*?"<>|]/g, '_')}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ebook] PDF 생성 에러:', msg);
    res.status(500).json({ success: false, error: 'PDF 생성에 실패했습니다.' });
  } finally {
    if (browser) await browser.close();
  }
});

/**
 * POST /api/taste-preview
 * 맛보기 생성: 텍스트 → AI 분석 → 표지+목차+Ch.1 HTML → URL 반환
 * 비용: ~₩50 (Claude 1회, 짧은 출력)
 */
router.post('/taste-preview', async (req: Request, res: Response) => {
  try {
    const { content, title, author } = req.body as EbookPreviewRequest;

    if (!content || typeof content !== 'string' || content.length < 100) {
      res.status(400).json({ success: false, error: '최소 100자 이상의 텍스트가 필요합니다.' });
      return;
    }

    console.log(`[taste-api] 맛보기 생성 시작 (${content.length}자)`);

    // 1) AI 맛보기 생성
    const taste = await generateTastePreview(content, title, author);

    // 2) HTML 생성
    const html = generateTasteHtml(taste);

    // 3) 파일 저장
    const orderId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ebooksDir = path.join(__dirname, '..', '..', 'public', 'ebooks');
    if (!fs.existsSync(ebooksDir)) {
      fs.mkdirSync(ebooksDir, { recursive: true });
    }

    const htmlPath = path.join(ebooksDir, `${orderId}-taste.html`);
    fs.writeFileSync(htmlPath, html, 'utf-8');

    // 4) 메타데이터 저장 (풀버전 생성 시 참조)
    const metaPath = path.join(ebooksDir, `${orderId}.json`);
    fs.writeFileSync(metaPath, JSON.stringify({
      orderId,
      taste,
      originalContent: content,
      createdAt: new Date().toISOString(),
    }, null, 2), 'utf-8');

    // 5) 응답
    res.json({
      success: true,
      orderId,
      previewUrl: `/ebooks/${orderId}-taste.html`,
      title: taste.title,
      subtitle: taste.subtitle,
      chapters: taste.chapters,
      totalPages: taste.totalPages,
    });

    console.log(`[taste-api] 맛보기 완료: orderId=${orderId}, "${taste.title}"`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[taste-api] 맛보기 에러:', msg);
    res.status(500).json({ success: false, error: msg || '맛보기 생성에 실패했습니다.' });
  }
});

/**
 * POST /api/full-version
 * 풀버전 생성: 맛보기 orderId → Ch.2~6 생성 → 전체 HTML+PDF → URL 반환
 * 비용: ~₩200 (Claude 5회 호출)
 */
router.post('/full-version', async (req: Request, res: Response) => {
  try {
    const { orderId, email } = req.body as { orderId: string; email?: string };

    // 풀버전 생성은 5챕터 순차 호출이라 최대 5분 소요
    req.setTimeout(600000);
    res.setTimeout(600000);

    if (!orderId) {
      res.status(400).json({ success: false, error: 'orderId가 필요합니다.' });
      return;
    }

    const ebooksDir = path.join(__dirname, '..', '..', 'public', 'ebooks');
    const metaPath = path.join(ebooksDir, `${orderId}.json`);

    if (!fs.existsSync(metaPath)) {
      res.status(404).json({ success: false, error: '맛보기 데이터를 찾을 수 없습니다.' });
      return;
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const taste = meta.taste as TastePreviewResult;
    const content = meta.originalContent as string;

    console.log(`[full-ver-api] 풀버전 생성 시작: orderId=${orderId}, "${taste.title}"`);

    const hpsspaRoles = [
      'Hook (고통 찌르기)', // Ch.1 — 이미 있음
      'Promise (변신 약속)',
      'Story (증거와 스토리)',
      'System (핵심 방법론)',
      'Proof (숫자와 반박)',
      'Action (지금 당장)',
    ];

    // Ch.2~6 순차 생성 (병렬 시 rate limit + JSON 깨짐 방지)
    const generatedChapters: any[] = [];
    for (let i = 0; i < 5; i++) {
      const ch = taste.chapters[i + 1];
      let result = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await generateFullVersionChapter(content, ch, i + 2, hpsspaRoles[i + 1], taste.title);
          break;
        } catch (err) {
          console.error(`[full-ver-api] Ch.${i + 2} 시도 ${attempt + 1} 실패:`, err instanceof Error ? err.message : err);
          if (attempt === 1) throw err;
        }
      }
      generatedChapters.push(result!);
    }

    // 풀 구조 조립: Ch.1 (맛보기) + Ch.2~6 (새로 생성)
    const allChapters = [
      taste.chapter1,
      ...generatedChapters,
    ];

    // generatePreviewHtml 호환 구조로 변환
    const fullStructure = {
      title: taste.title,
      subtitle: taste.subtitle,
      author: taste.author,
      colorScheme: taste.colorScheme,
      chapters: allChapters as any,
      totalPages: 1 + 1 + 6 + 1, // cover + toc + 6ch + branding
    };

    const html = generatePreviewHtml(fullStructure);
    const htmlPath = path.join(ebooksDir, `${orderId}-full.html`);
    const pdfPath = path.join(ebooksDir, `${orderId}-full.pdf`);

    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`[full-ver-api] 풀버전 HTML 저장: ${htmlPath}`);

    // PDF 생성
    await generatePreviewPdf(htmlPath, pdfPath);

    // 메타데이터 업데이트
    meta.fullVersionCreatedAt = new Date().toISOString();
    meta.email = email;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    res.json({
      success: true,
      orderId,
      htmlUrl: `/ebooks/${orderId}-full.html`,
      pdfUrl: `/ebooks/${orderId}-full.pdf`,
      pages: fullStructure.totalPages,
      title: taste.title,
    });

    console.log(`[full-ver-api] 풀버전 완료: orderId=${orderId}, ${fullStructure.totalPages}페이지`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[full-ver-api] 풀버전 에러:', msg);
    res.status(500).json({ success: false, error: msg || '풀버전 생성에 실패했습니다.' });
  }
});

/**
 * POST /api/text-ebook
 * 텍스트 전자책 (A 방식): 마크다운 → 깔끔한 PDF
 * 비용: ~₩150 (Claude 2회 호출)
 */
router.post('/text-ebook', async (req: Request, res: Response) => {
  try {
    const { content, title } = req.body as { content: string; title?: string };

    if (!content || typeof content !== 'string' || content.length < 100) {
      res.status(400).json({ success: false, error: '최소 100자 이상의 텍스트가 필요합니다.' });
      return;
    }

    req.setTimeout(300000);
    res.setTimeout(300000);

    console.log(`[text-ebook-api] 생성 시작 (${content.length}자)`);

    const book = await generateTextEbook(content, title);
    const html = generateTextEbookHtml(book);

    const orderId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ebooksDir = path.join(__dirname, '..', '..', 'public', 'ebooks');
    if (!fs.existsSync(ebooksDir)) fs.mkdirSync(ebooksDir, { recursive: true });

    const htmlPath = path.join(ebooksDir, `${orderId}-text.html`);
    const pdfPath = path.join(ebooksDir, `${orderId}-text.pdf`);

    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`[text-ebook-api] HTML 저장: ${htmlPath}`);

    await generatePdf(htmlPath, pdfPath);

    const totalChars = book.chapters.reduce((sum, ch) => sum + ch.content.length, 0);

    res.json({
      success: true,
      orderId,
      htmlUrl: `/ebooks/${orderId}-text.html`,
      pdfUrl: `/ebooks/${orderId}-text.pdf`,
      title: book.title,
      chapters: book.chapters.length,
      totalChars,
      pages: book.chapters.length + 3, // cover + toc + chapters + ending
    });

    console.log(`[text-ebook-api] 완료: "${book.title}", ${book.chapters.length}챕터, ${totalChars}자`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[text-ebook-api] 에러:', msg);
    res.status(500).json({ success: false, error: msg || '전자책 생성에 실패했습니다.' });
  }
});

/**
 * POST /api/create-preview (레거시)
 * 텍스트 → AI 구조 분석 → HTML 전자책 → Playwright PDF → URL 반환
 */
router.post('/create-preview', async (req: Request, res: Response) => {
  try {
    const { content, title, author } = req.body as EbookPreviewRequest;

    if (!content || typeof content !== 'string' || content.length < 100) {
      res.status(400).json({
        success: false,
        error: '최소 100자 이상의 텍스트가 필요합니다.',
      });
      return;
    }

    console.log(`[ebook-api] create-preview 시작 (${content.length}자)`);

    // 1) AI 구조 분석
    const structure = await analyzePreviewContent(content, title, author);

    // 2) HTML 생성
    const html = generatePreviewHtml(structure);

    // 3) 파일 저장
    const orderId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ebooksDir = path.join(__dirname, '..', '..', 'public', 'ebooks');
    if (!fs.existsSync(ebooksDir)) {
      fs.mkdirSync(ebooksDir, { recursive: true });
    }

    const htmlPath = path.join(ebooksDir, `${orderId}.html`);
    const pdfPath = path.join(ebooksDir, `${orderId}.pdf`);

    fs.writeFileSync(htmlPath, html, 'utf-8');
    console.log(`[ebook-api] HTML 저장: ${htmlPath}`);

    // 4) PDF 변환
    await generatePreviewPdf(htmlPath, pdfPath);

    // 5) 응답
    res.json({
      success: true,
      previewUrl: `/ebooks/${orderId}.html`,
      pdfUrl: `/ebooks/${orderId}.pdf`,
      pages: structure.totalPages,
      orderId,
    });

    console.log(`[ebook-api] create-preview 완료: orderId=${orderId}, ${structure.totalPages}페이지`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[ebook-api] create-preview 에러:', msg);
    res.status(500).json({
      success: false,
      error: msg || '전자책 생성에 실패했습니다.',
    });
  }
});

export default router;
