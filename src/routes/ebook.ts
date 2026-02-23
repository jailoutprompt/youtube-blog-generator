import { Router, Request, Response } from 'express';
import puppeteer from 'puppeteer';
import {
  generateEbookOutline,
  generateEbookChapter,
  generateEbookIntroConclusion,
  ChapterInput,
} from '../services/ebookGenerator';
import { BlogModel } from '../types/index.d';

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

export default router;
