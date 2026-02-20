import { Router, Request, Response } from 'express';
import { getHistory, getHistoryById, deleteHistoryById, getHistoryCount } from '../services/database';

const router = Router();

// 히스토리 목록
router.get('/history', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const items = getHistory(limit, offset);
    const total = getHistoryCount();

    res.json({
      success: true,
      data: {
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          youtube_url: item.youtube_url,
          video_id: item.video_id,
          tone: item.tone,
          model: item.model,
          source: item.source,
          tags: item.tags,
          created_at: item.created_at,
        })),
        total,
      },
    });
  } catch (err) {
    console.error('[history] list error:', err);
    res.status(500).json({ success: false, error: '히스토리를 불러올 수 없습니다.' });
  }
});

// 히스토리 상세
router.get('/history/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' });
      return;
    }

    const item = getHistoryById(id);
    if (!item) {
      res.status(404).json({ success: false, error: '해당 기록을 찾을 수 없습니다.' });
      return;
    }

    res.json({ success: true, data: item });
  } catch (err) {
    console.error('[history] get error:', err);
    res.status(500).json({ success: false, error: '기록을 불러올 수 없습니다.' });
  }
});

// 히스토리 삭제
router.delete('/history/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' });
      return;
    }

    const deleted = deleteHistoryById(id);
    if (!deleted) {
      res.status(404).json({ success: false, error: '해당 기록을 찾을 수 없습니다.' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[history] delete error:', err);
    res.status(500).json({ success: false, error: '기록을 삭제할 수 없습니다.' });
  }
});

export default router;
