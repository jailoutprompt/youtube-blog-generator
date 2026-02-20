import { Router, Request, Response } from 'express';
import { validateYoutubeUrl, getTranscript } from '../services/youtube';
import { generateFromTranscript } from '../services/blogGenerator';
import { GenerateBlogRequest, BlogData, ApiResponse } from '../types/index.d';

const router = Router();

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up')
  );
}

function classifyError(err: unknown): { status: number; message: string } {
  if (!(err instanceof Error)) {
    return { status: 500, message: '알 수 없는 오류가 발생했습니다.' };
  }

  const msg = err.message;

  // 자막/영상 관련
  if (msg.includes('영상 ID를 추출할 수 없')) {
    return { status: 400, message: msg };
  }
  if (msg.includes('자막을 가져올 수 없') || msg.includes('음성 인식 결과가 너무 짧')) {
    return { status: 422, message: msg };
  }

  // OpenAI 관련
  if (msg.includes('OpenAI') || msg.includes('API key')) {
    return { status: 502, message: 'AI 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.' };
  }

  // Rate limit
  if (msg.includes('429') || msg.includes('rate limit')) {
    return { status: 429, message: '요청이 너무 빈번합니다. 잠시 후 다시 시도해주세요.' };
  }

  // Timeout
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return { status: 504, message: '처리 시간이 초과되었습니다. 더 짧은 영상으로 시도해주세요.' };
  }

  return { status: 500, message: msg };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const waitMs = RETRY_DELAY_MS * (attempt + 1);
        console.log(`[${label}] 재시도 ${attempt + 1}/${MAX_RETRIES} (${waitMs}ms 후)...`);
        await delay(waitMs);
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}

router.post(
  '/generate-blog',
  async (req: Request<object, object, GenerateBlogRequest>, res: Response) => {
    try {
      const { youtubeUrl } = req.body;

      if (!youtubeUrl || typeof youtubeUrl !== 'string') {
        res.status(400).json({
          success: false,
          error: 'YouTube URL을 입력해주세요.',
        } satisfies ApiResponse);
        return;
      }

      if (!validateYoutubeUrl(youtubeUrl)) {
        res.status(400).json({
          success: false,
          error: '유효한 YouTube URL이 아닙니다. (예: youtube.com/watch?v=...)',
        } satisfies ApiResponse);
        return;
      }

      // 자막 추출 (재시도 포함)
      const transcript = await withRetry(
        () => getTranscript(youtubeUrl),
        'transcript'
      );

      console.log(
        `[transcript] source=${transcript.source}, length=${transcript.text.length}`
      );

      // 블로그 생성 (재시도 포함)
      const blogData = await withRetry(
        () => generateFromTranscript(transcript.text),
        'blog-gen'
      );

      res.json({
        success: true,
        data: {
          ...blogData,
          transcript: transcript.text.slice(0, 500) + (transcript.text.length > 500 ? '...' : ''),
          source: transcript.source,
        },
      } satisfies ApiResponse<BlogData & { transcript: string; source: string }>);
    } catch (err) {
      const { status, message } = classifyError(err);
      console.error(`[generate-blog] ${status} error:`, err instanceof Error ? err.message : err);
      res.status(status).json({
        success: false,
        error: message,
      } satisfies ApiResponse);
    }
  }
);

export default router;
