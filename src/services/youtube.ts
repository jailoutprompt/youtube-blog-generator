import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { TranscriptResult } from '../types/index.d';

const execFileAsync = promisify(execFile);

const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/;

const WHISPER_MODEL = 'small';
const WHISPER_TIMEOUT = 300000; // 5분

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

export function validateYoutubeUrl(url: string): boolean {
  return YOUTUBE_URL_REGEX.test(url);
}

function parseSrt(srt: string): string {
  return srt
    .split('\n')
    .filter((line) => {
      if (!line.trim()) return false;
      if (/^\d+$/.test(line.trim())) return false;
      if (/-->/.test(line)) return false;
      return true;
    })
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean)
    .join(' ');
}

/**
 * Supadata API로 자막 추출 (클라우드 서버 전용, 가장 안정적)
 */
async function fetchTranscriptSupadata(videoId: string): Promise<string | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) return null;

  try {
    console.log('[transcript] Supadata API 시도...');
    const url = `https://api.supadata.ai/v1/transcript?url=https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      console.log(`[transcript] Supadata 실패: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as { lang?: string; content?: Array<{ text: string }> };
    if (data.content && data.content.length > 0) {
      const text = data.content.map((seg: { text: string }) => seg.text).join(' ').trim();
      if (text.length > 50) {
        console.log(`[transcript] Supadata 성공 (${data.lang}). 글자 수: ${text.length}`);
        return text;
      }
    }
  } catch (err) {
    console.log('[transcript] Supadata 에러:', (err as Error).message?.slice(0, 100));
  }

  return null;
}

/**
 * Python youtube-transcript-api로 자막 추출 (로컬/일부 서버 호환)
 */
async function fetchTranscriptPython(videoId: string): Promise<string | null> {
  const script = `
import json, sys
from youtube_transcript_api import YouTubeTranscriptApi
ytt = YouTubeTranscriptApi()
for lang in ['ko', 'en', 'ja']:
    try:
        result = ytt.fetch('${videoId}', languages=[lang])
        text = ' '.join([s.text for s in result.snippets])
        if len(text) > 50:
            print(json.dumps({"text": text, "lang": lang}))
            sys.exit(0)
    except:
        pass
print(json.dumps({"text": "", "lang": ""}))
`;

  try {
    console.log('[transcript] python youtube-transcript-api 시도...');
    const { stdout } = await execFileAsync('python3', ['-c', script], { timeout: 30000 });
    const result = JSON.parse(stdout.trim());
    if (result.text && result.text.length > 50) {
      console.log(`[transcript] python API 성공 (${result.lang}). 글자 수: ${result.text.length}`);
      return result.text;
    }
  } catch (err) {
    console.log('[transcript] python API 실패:', (err as Error).message?.slice(0, 100));
  }

  return null;
}

/**
 * yt-dlp로 오디오만 다운로드
 */
async function downloadAudio(url: string, tmpDir: string): Promise<string> {
  const audioPath = path.join(tmpDir, 'audio.m4a');

  console.log('[whisper] 오디오 다운로드 시작...');

  await execFileAsync('yt-dlp', [
    '-f', 'bestaudio[ext=m4a]/bestaudio',
    '--no-playlist',
    '-o', audioPath,
    url,
  ], { timeout: 60000 });

  const files = await fs.readdir(tmpDir);
  const audioFile = files.find((f) => f.startsWith('audio'));
  if (!audioFile) throw new Error('오디오 다운로드 실패');

  return path.join(tmpDir, audioFile);
}

/**
 * Whisper CLI로 음성→텍스트 변환
 */
async function transcribeWithWhisper(audioPath: string, tmpDir: string): Promise<string> {
  console.log(`[whisper] STT 변환 시작 (모델: ${WHISPER_MODEL})...`);

  await execFileAsync('whisper', [
    audioPath,
    '--model', WHISPER_MODEL,
    '--language', 'ko',
    '--output_format', 'txt',
    '--output_dir', tmpDir,
  ], { timeout: WHISPER_TIMEOUT });

  const files = await fs.readdir(tmpDir);
  const txtFile = files.find((f) => f.endsWith('.txt'));
  if (!txtFile) throw new Error('Whisper 변환 결과를 찾을 수 없습니다.');

  const text = await fs.readFile(path.join(tmpDir, txtFile), 'utf-8');
  return text.trim();
}

export async function getTranscript(url: string): Promise<TranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('영상 ID를 추출할 수 없습니다.');

  // 1) Supadata API (클라우드 서버에서 가장 안정적)
  const supadataText = await fetchTranscriptSupadata(videoId);
  if (supadataText) {
    return { text: supadataText, source: 'subtitle' };
  }

  // 2) Python youtube-transcript-api (로컬 또는 비차단 서버)
  const pyText = await fetchTranscriptPython(videoId);
  if (pyText) {
    return { text: pyText, source: 'subtitle' };
  }

  // 3) yt-dlp로 자막 시도 (로컬 환경 fallback)
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-sub-'));
  const outTemplate = path.join(tmpDir, videoId);

  try {
    for (const lang of ['ko', 'en']) {
      try {
        await execFileAsync('yt-dlp', [
          '--write-auto-sub',
          '--sub-lang',
          lang,
          '--sub-format',
          'srt',
          '--skip-download',
          '-o',
          outTemplate,
          url,
        ]);

        const srtPath = `${outTemplate}.${lang}.srt`;
        const srt = await fs.readFile(srtPath, 'utf-8');
        const text = parseSrt(srt);

        if (text.length > 50) {
          return { text, source: 'subtitle' };
        }
      } catch {
        // 이 언어 자막 없음, 다음 시도
      }
    }

    // 4) 서버 환경이면 여기서 명확한 에러 반환
    if (process.env.NODE_ENV === 'production') {
      throw new Error('자막을 추출할 수 없습니다. 이 영상에 자막(자동 생성 포함)이 있는지 확인해주세요.');
    }

    // 5) 로컬 전용: 오디오 다운로드 + Whisper STT
    console.log('[whisper] 자막 없음. Whisper fallback 시작...');

    const audioPath = await downloadAudio(url, tmpDir);
    const text = await transcribeWithWhisper(audioPath, tmpDir);

    if (text.length < 30) {
      throw new Error('음성 인식 결과가 너무 짧습니다. 음성이 있는 영상인지 확인해주세요.');
    }

    console.log(`[whisper] STT 완료. 글자 수: ${text.length}`);
    return { text, source: 'whisper' };

  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
