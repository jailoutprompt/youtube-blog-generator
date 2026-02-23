import { Router, Request, Response } from 'express';
import { validateChannelUrl, getChannelVideos } from '../services/channel';
import { getTranscript } from '../services/youtube';

const router = Router();

/**
 * POST /api/channel/videos
 * 채널 또는 재생목록의 영상 목록 가져오기 (50개씩 페이지네이션)
 */
router.post('/channel/videos', async (req: Request, res: Response) => {
  try {
    const { channelUrl, page = 1, limit = 50 } = req.body;

    if (!channelUrl || typeof channelUrl !== 'string') {
      res.status(400).json({ success: false, error: '채널 URL을 입력해주세요.' });
      return;
    }

    if (!validateChannelUrl(channelUrl.trim())) {
      res.status(400).json({
        success: false,
        error: '유효한 YouTube 채널 URL이 아닙니다. (예: youtube.com/@channelname)',
      });
      return;
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
    const start = (pageNum - 1) * limitNum + 1;
    const end = pageNum * limitNum;

    const result = await getChannelVideos(channelUrl.trim(), start, end);

    res.json({
      success: true,
      data: {
        videos: result.videos,
        hasMore: result.hasMore,
        page: pageNum,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[channel] 영상 목록 에러:', msg);

    const isTimeout = msg.includes('timeout') || msg.includes('ETIMEDOUT');
    res.status(isTimeout ? 504 : 500).json({
      success: false,
      error: isTimeout
        ? '채널 정보를 가져오는 데 시간이 초과되었습니다. 다시 시도해주세요.'
        : '채널 영상 목록을 가져올 수 없습니다. URL을 확인해주세요.',
    });
  }
});

/**
 * POST /api/channel/transcript
 * 단일 영상 스크립트 추출
 */
router.post('/channel/transcript', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.body;

    if (!videoId || typeof videoId !== 'string') {
      res.status(400).json({ success: false, error: '영상 ID가 필요합니다.' });
      return;
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[channel] 스크립트 추출 시작: ${videoId}`);

    const result = await getTranscript(url);

    console.log(
      `[channel] 스크립트 추출 완료: ${videoId} (${result.text.length}자, ${result.source})`,
    );

    res.json({
      success: true,
      data: {
        videoId,
        transcript: result.text,
        source: result.source,
        length: result.text.length,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[channel] 스크립트 추출 에러 (${req.body?.videoId}):`, msg);

    res.status(500).json({
      success: false,
      error: msg || '스크립트를 추출할 수 없습니다.',
    });
  }
});

export default router;
