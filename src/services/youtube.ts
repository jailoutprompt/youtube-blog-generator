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

  // 실제 파일명 확인 (yt-dlp가 확장자 바꿀 수 있음)
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

  // 결과 txt 파일 찾기
  const files = await fs.readdir(tmpDir);
  const txtFile = files.find((f) => f.endsWith('.txt'));
  if (!txtFile) throw new Error('Whisper 변환 결과를 찾을 수 없습니다.');

  const text = await fs.readFile(path.join(tmpDir, txtFile), 'utf-8');
  return text.trim();
}

export async function getTranscript(url: string): Promise<TranscriptResult> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('영상 ID를 추출할 수 없습니다.');

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-sub-'));
  const outTemplate = path.join(tmpDir, videoId);

  try {
    // 1) 자막 시도 (한국어 → 영어)
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

    // 2) 자막 없음 → 오디오 다운로드 + Whisper STT
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
