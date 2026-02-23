import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface ChannelVideo {
  id: string;
  title: string;
  duration: string;
}

export function validateChannelUrl(url: string): boolean {
  return url.includes('youtube.com/') || url.includes('youtu.be/');
}

/**
 * yt-dlp --flat-playlist로 채널/재생목록의 영상 목록 추출
 * start: 1-indexed, end: inclusive
 */
export async function getChannelVideos(
  channelUrl: string,
  start: number = 1,
  end: number = 50,
): Promise<{ videos: ChannelVideo[]; hasMore: boolean }> {
  const fetchEnd = end + 1; // 1개 더 가져와서 hasMore 판단

  // 채널 URL에 /videos 없으면 붙여주기 (재생목록은 제외)
  let url = channelUrl;
  if (!url.includes('/playlist') && !url.includes('/videos') && (url.includes('/@') || url.includes('/channel/') || url.includes('/c/') || url.includes('/user/'))) {
    url = url.replace(/\/?$/, '/videos');
  }

  console.log(`[channel] yt-dlp 영상 목록: ${url} (${start}-${end})`);

  const { stdout } = await execFileAsync(
    'yt-dlp',
    [
      '--flat-playlist',
      '--print', '%(id)s|||%(title)s|||%(duration_string)s',
      '--playlist-start', String(start),
      '--playlist-end', String(fetchEnd),
      '--no-warnings',
      url,
    ],
    { timeout: 120_000 },
  );

  const lines = stdout.trim().split('\n').filter(Boolean);
  const expectedCount = end - start + 1;
  const hasMore = lines.length > expectedCount;
  const videoLines = hasMore ? lines.slice(0, expectedCount) : lines;

  const videos: ChannelVideo[] = videoLines
    .map((line) => {
      const [id, title, duration] = line.split('|||');
      return {
        id: (id || '').trim(),
        title: (title || '제목 없음').trim(),
        duration: (duration || '').trim(),
      };
    })
    .filter((v) => v.id);

  console.log(`[channel] ${videos.length}개 영상 파싱, hasMore=${hasMore}`);

  return { videos, hasMore };
}
