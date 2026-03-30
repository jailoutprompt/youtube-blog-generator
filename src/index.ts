import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import express from 'express';
import rateLimit from 'express-rate-limit';
import generateRouter from './routes/generate';
import historyRouter from './routes/history';
import channelRouter from './routes/channel';
import ebookRouter from './routes/ebook';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// 인메모리 로그 수집 (원격 디버깅용)
interface LogEntry { timestamp: string; level: string; message: string; }
const serverLogs: LogEntry[] = [];
const MAX_LOGS = 200;
function addLog(level: string, message: string) {
  serverLogs.push({ timestamp: new Date().toISOString(), level, message });
  if (serverLogs.length > MAX_LOGS) serverLogs.splice(0, serverLogs.length - MAX_LOGS);
}
const origLog = console.log.bind(console);
const origError = console.error.bind(console);
console.log = (...args: unknown[]) => { origLog(...args); addLog('info', args.map(String).join(' ')); };
console.error = (...args: unknown[]) => { origError(...args); addLog('error', args.map(String).join(' ')); };

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
// 아티팩트 HTML에 놀이터 홈 버튼 + 메모 기능 자동 주입
app.get('/artifacts/*', (req, res, next) => {
  if (!req.path.endsWith('.html')) return next();
  const decodedPath = decodeURIComponent(req.path);
  const filePath = path.join(__dirname, '..', 'public', decodedPath);
  if (!fs.existsSync(filePath)) return next();
  let html = fs.readFileSync(filePath, 'utf-8');

  // 메모 키 계산
  const rel = decodedPath.replace('/artifacts/', '');
  const memosPath = path.join(__dirname, '..', 'public', 'artifacts', '.memos.json');
  let memos: Record<string, string> = {};
  try { memos = JSON.parse(fs.readFileSync(memosPath, 'utf-8')); } catch { /* */ }
  const currentMemo = (memos[rel] || '').replace(/'/g, "\\'").replace(/\n/g, "\\n");

  const inject = `
<div id="_nl_bar" style="position:fixed;top:16px;left:16px;z-index:9999;display:flex;gap:6px;font-family:-apple-system,system-ui,sans-serif">
  <a href="/artifacts" style="background:rgba(17,17,25,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:100px;padding:8px 16px;color:#a78bfa;text-decoration:none;font-size:13px;font-weight:600;backdrop-filter:blur(8px);transition:all 0.2s;box-shadow:0 4px 12px rgba(0,0,0,0.3)" onmouseover="this.style.background='rgba(139,92,246,0.2)'" onmouseout="this.style.background='rgba(17,17,25,0.9)'">← 놀이터 홈</a>
  <button onclick="document.getElementById('_nl_memo').style.display=document.getElementById('_nl_memo').style.display==='none'?'flex':'none'" style="background:rgba(17,17,25,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:100px;padding:8px 14px;color:${memos[rel] ? '#a78bfa' : '#64748b'};font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.2s" onmouseover="this.style.background='rgba(139,92,246,0.2)'" onmouseout="this.style.background='rgba(17,17,25,0.9)'">📝 메모</button>
  <button onclick="document.getElementById('_nl_rules').style.display=document.getElementById('_nl_rules').style.display==='none'?'flex':'none'" style="background:rgba(17,17,25,0.9);border:1px solid rgba(255,255,255,0.1);border-radius:100px;padding:8px 14px;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:all 0.2s" onmouseover="this.style.background='rgba(139,92,246,0.2)';this.style.color='#a78bfa'" onmouseout="this.style.background='rgba(17,17,25,0.9)';this.style.color='#64748b'">📏 정리 규칙</button>
</div>
<div id="_nl_rules" style="display:none;position:fixed;top:56px;right:16px;z-index:9999;flex-direction:column;gap:6px;width:360px;max-width:calc(100vw - 32px);max-height:80vh;overflow-y:auto;background:rgba(17,17,25,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:-apple-system,system-ui,sans-serif">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
    <div style="font-size:14px;font-weight:700;color:#f1f5f9">📏 정리 규칙</div>
    <button onclick="document.getElementById('_nl_rules').style.display='none'" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px">✕</button>
  </div>
  <div style="font-size:10px;color:#5a6480;text-transform:uppercase;letter-spacing:1px;margin:4px 0">제목</div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">파일명 = title = h1</div>
    <div style="font-size:11px;color:#8892b0;margin-top:2px">전부 같아야 함. 다르면 헷갈림</div>
  </div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">같은 종류 여러 개 → — 뒤에 구분</div>
    <div style="font-size:11px;color:#8892b0;margin-top:2px">시안 v1 — 다크 / 시안 v2 — 라이트</div>
  </div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">만들 때마다 제목 확인</div>
    <div style="font-size:11px;color:#8892b0;margin-top:2px">Claude가 "제목 이거 맞아?" 물어봄. OK 전까지 저장 안 함</div>
  </div>
  <div style="font-size:10px;color:#5a6480;text-transform:uppercase;letter-spacing:1px;margin:8px 0 4px">폴더</div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">폴더 = 프로젝트 (법인/서비스 단위)</div>
    <div style="font-size:11px;color:#8892b0;margin-top:2px">제품별 안 쪼갬. 무무익선/에 뇌울림+물음표+AI녹음기 전부</div>
  </div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">같은 프로젝트 파일은 한 폴더에</div>
  </div>
  <div style="font-size:10px;color:#5a6480;text-transform:uppercase;letter-spacing:1px;margin:8px 0 4px">정리</div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">배포된 파일 건드리지 마</div>
    <div style="font-size:11px;color:#8892b0;margin-top:2px">한울/ v1~v6 = GitHub Pages 배포됨</div>
  </div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">중복 → 큰 파일만 남기고 삭제</div>
  </div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02);margin-bottom:4px">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">버전 파일은 세트 (하나만 못 지움)</div>
  </div>
  <div style="padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);background:rgba(255,255,255,0.02)">
    <div style="font-size:12px;font-weight:600;color:#ccd6f6">만들기 전 기존 파일 확인</div>
    <div style="font-size:11px;color:#8892b0;margin-top:2px">같은 주제면 새로 안 만들고 기존 파일 업데이트</div>
  </div>
</div>
<div id="_nl_memo" style="display:none;position:fixed;top:56px;left:16px;z-index:9999;flex-direction:column;gap:8px;width:340px;max-width:calc(100vw - 32px);background:rgba(17,17,25,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:16px;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.5);font-family:-apple-system,system-ui,sans-serif">
  <textarea id="_nl_memo_text" style="width:100%;height:100px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;font-size:13px;color:#f1f5f9;font-family:inherit;resize:vertical;outline:none" placeholder="이 아티팩트에 대한 메모...">${currentMemo.replace(/\\n/g, '\n').replace(/\\'/g, "'")}</textarea>
  <div style="display:flex;gap:6px">
    <button onclick="document.getElementById('_nl_memo').style.display='none'" style="flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:#64748b;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">닫기</button>
    <button onclick="_nlSave()" style="flex:1;padding:8px;border-radius:8px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.3);color:#a78bfa;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">저장</button>
  </div>
  <div id="_nl_toast" style="display:none;font-size:11px;color:#22c55e;text-align:center">저장됨</div>
</div>
<script>
async function _nlSave(){
  const memo=document.getElementById('_nl_memo_text').value.trim();
  await fetch('/api/artifacts/memo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:'${rel}',memo})});
  const t=document.getElementById('_nl_toast');t.style.display='block';setTimeout(()=>t.style.display='none',1500);
}
</script>`;

  // 수동 버튼 전부 제거 (중복 방지) — "← 놀이터" 링크 모든 변형
  html = html.replace(/<a[^>]*href=["'][^"']*artifacts[^"']*["'][^>]*>[^<]*놀이터[^<]*<\/a>/gi, '');

  // 백링크 주입 — .links.json에서 관련 문서 읽어서 하단에 표시
  const linksPath = path.join(__dirname, '..', 'public', 'artifacts', '.links.json');
  let linksHtml = '';
  try {
    const allLinks: Record<string, string[]> = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
    const myFile = rel.split('/').pop() || rel; // 파일명만 추출
    // 파일명 기반 매칭 — 폴더 옮겨도 안 깨짐
    const related = new Set<string>();
    // 모든 키/값에서 파일명으로 매칭
    for (const [src, targets] of Object.entries(allLinks)) {
      const srcFile = src.split('/').pop() || src;
      if (srcFile === myFile) targets.forEach(t => related.add(t));
      if (targets.some(t => (t.split('/').pop() || t) === myFile) && srcFile !== myFile) related.add(src);
    }
    // 실제 파일 경로 찾기 — .links.json 경로가 옛날이어도 실제 파일 위치로 resolve
    const artifactsDir = path.join(__dirname, '..', 'public', 'artifacts');
    function findActualPath(linkPath: string): string | null {
      // 원래 경로에 있으면 그대로
      if (fs.existsSync(path.join(artifactsDir, linkPath))) return linkPath;
      // 없으면 파일명으로 전체 검색
      const fileName = linkPath.split('/').pop();
      if (!fileName) return null;
      const dirs = fs.readdirSync(artifactsDir, {withFileTypes:true}).filter(d=>d.isDirectory());
      for (const d of dirs) {
        const candidate = path.join(d.name, fileName);
        if (fs.existsSync(path.join(artifactsDir, candidate))) return candidate;
      }
      return null;
    }
    // 같은 폴더 안 파일끼리 자동 연결
    const myFolder = rel.includes('/') ? rel.split('/')[0] : '';
    if (myFolder) {
      const folderPath = path.join(artifactsDir, myFolder);
      try {
        fs.readdirSync(folderPath).filter(f => f.endsWith('.html') && f !== (rel.split('/').pop() || '')).forEach(f => related.add(myFolder + '/' + f));
      } catch {}
    }
    if (related.size > 0) {
      const linkChips = Array.from(related).map(l => {
        const actual = findActualPath(l);
        if (!actual) return '';
        const name = actual.replace(/\.html$/, '').split('/').pop() || actual;
        return `<a href="/artifacts/${encodeURI(actual)}" style="padding:5px 12px;border-radius:8px;font-size:12px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.15);color:#a78bfa;text-decoration:none;transition:all 0.2s;white-space:nowrap" onmouseover="this.style.background='rgba(139,92,246,0.2)';this.style.borderColor='rgba(139,92,246,0.4)'" onmouseout="this.style.background='rgba(139,92,246,0.08)';this.style.borderColor='rgba(139,92,246,0.15)'">${name}</a>`;
      }).filter(Boolean).join('');
      linksHtml = `<div id="_nl_backlinks" style="position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(12,12,20,0.95);backdrop-filter:blur(12px);border-top:1px solid rgba(139,92,246,0.15);padding:10px 16px;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;gap:8px;overflow-x:auto">
        <span style="font-size:11px;color:#5a6480;font-weight:600;white-space:nowrap">📎 관련 문서</span>${linkChips}
      </div>`;
    }
  } catch { /* .links.json 없으면 무시 */ }

  html = html.includes('</body>') ? html.replace('</body>', inject + linksHtml + '</body>') : html + inject + linksHtml;
  res.type('html').send(html);
});
app.use(express.static(path.join(__dirname, '..', 'public')));

// public/ebooks 디렉토리 자동 생성
const ebooksDir = path.join(__dirname, '..', 'public', 'ebooks');
if (!fs.existsSync(ebooksDir)) {
  fs.mkdirSync(ebooksDir, { recursive: true });
  console.log('[server] public/ebooks 디렉토리 생성');
}

// 블로그 생성 API: IP당 시간당 10회 제한
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: '요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.',
  },
});
app.use('/generate-blog', generateLimiter);

app.get('/health', async (_req, res) => {
  let python = false;
  let ytTranscript = false;
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const exec = promisify(execFile);
    const { stdout } = await exec('python3', ['-c', 'from youtube_transcript_api import YouTubeTranscriptApi; print("ok")'], { timeout: 5000 });
    python = true;
    ytTranscript = stdout.trim() === 'ok';
  } catch { /* */ }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), python, ytTranscript });
});

// 서버 로그 조회 (원격 디버깅용)
app.get('/logs', (req, res) => {
  const level = req.query.level as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, MAX_LOGS);
  let logs = level ? serverLogs.filter(l => l.level === level) : serverLogs;
  logs = logs.slice(-limit);
  res.json({ count: logs.length, total: serverLogs.length, logs });
});

// 디버그용 자막 테스트 (배포 안정화 후 제거)
app.get('/test-transcript/:videoId', async (req, res) => {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const exec = promisify(execFile);
  try {
    const script = `
import json, sys, traceback
from youtube_transcript_api import YouTubeTranscriptApi
ytt = YouTubeTranscriptApi()
try:
    result = ytt.fetch('${req.params.videoId}', languages=['ko','en'])
    text = ' '.join([s.text for s in result.snippets])
    print(json.dumps({"ok": True, "length": len(text), "preview": text[:200]}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)[:500], "type": type(e).__name__}))
`;
    const { stdout, stderr } = await exec('python3', ['-c', script], { timeout: 15000 });
    res.json(JSON.parse(stdout.trim()));
  } catch (err: unknown) {
    res.json({ ok: false, error: (err as Error).message?.slice(0, 300) });
  }
});

// 채널 스크립트 추출: IP당 시간당 30회 (영상 목록), 스크립트 추출은 100회
const channelVideosLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.' },
});
const channelTranscriptLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '스크립트 추출 한도를 초과했습니다. 1시간 후 다시 시도해주세요.' },
});
app.use('/api/channel/videos', channelVideosLimiter);
app.use('/api/channel/transcript', channelTranscriptLimiter);

// 전자책 생성: IP당 시간당 60회 (1권 생성에 ~10회 호출)
const ebookLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '전자책 생성 한도를 초과했습니다. 1시간 후 다시 시도해주세요.' },
});
app.use('/api/ebook', ebookLimiter);

// artifacts 대시보드 (썸네일 프리뷰 + 카테고리 필터)
app.get('/artifacts', (_req, res) => {
  const baseDir = path.join(__dirname, '..', 'public', 'artifacts');

  interface ArtifactFile { name: string; title: string; desc: string; mtime: Date; ctime: Date; size: number; category: string; href: string; }

  const categories: Record<string, { label: string; desc: string; color: string; icon: string }> = {
    '무무익선':    { label: '무무익선',    desc: '뇌울림·물음표스피커·AI녹음기',  color: '#f59e0b', icon: '🏰' },
    BlogBot:     { label: 'BlogBot',    desc: '블로그 자동생성 + 개발도구',    color: '#8b5cf6', icon: '🎰' },
    '사주아이':    { label: '사주아이',    desc: 'AI 사주·궁합·운세 서비스',     color: '#ec4899', icon: '🔮' },
    MetaPress:   { label: 'MetaPress',  desc: '콘텐츠 생산 코어 엔진',        color: '#06b6d4', icon: '🏭' },
    '놀이터':      { label: '놀이터',     desc: '놀이터 자체 설계·정리',        color: '#22c55e', icon: '🎮' },
    '전자책':      { label: '전자책',     desc: '완성된 전자책',               color: '#a78bfa', icon: '📚' },
    '바이브코딩':   { label: '바이브코딩',  desc: '독립 미니 프로젝트 모음',      color: '#3b82f6', icon: '⚡' },
    '한울건축':     { label: '한울건축',   desc: '웹사이트 시안 v1~v6',         color: '#22c55e', icon: '🏗️' },
    '한유반':      { label: '한유반',     desc: '중국인 관광객 × 현지인 매칭',   color: '#FF6B9D', icon: '🤝' },
    DoAgent:     { label: 'DoAgent',   desc: 'AI 에이전트',                color: '#10b981', icon: '🤖' },
    '기타':       { label: '기타',      desc: '프로젝트 무관 문서',           color: '#94a3b8', icon: '📋' },
    '아카이브':    { label: '아카이브',   desc: '과거 버전·실험적',             color: '#64748b', icon: '📦' },
    _root:       { label: '미분류',     desc: '미분류',                     color: '#64748b', icon: '📄' },
  };

  const extractDesc = (html: string): string => {
    const metaMatch = html.match(/<meta\s+name="description"\s+content="([^"]*?)"/i);
    if (metaMatch) return metaMatch[1].slice(0, 80);
    const h2Match = html.match(/<h2[^>]*>(.*?)<\/h2>/i);
    if (h2Match) return h2Match[1].replace(/<[^>]+>/g, '').slice(0, 80);
    const pMatch = html.match(/<p[^>]*>(.*?)<\/p>/i);
    if (pMatch) return pMatch[1].replace(/<[^>]+>/g, '').slice(0, 80);
    return '';
  };

  const scanDir = (dir: string, category: string): ArtifactFile[] => {
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.html'))
        .map(f => {
          const filePath = path.join(dir, f);
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, 'utf-8').slice(0, 5000);
          const titleMatch = content.match(/<title>(.*?)<\/title>/i);
          const prefix = category === '_root' ? '' : category + '/';
          return {
            name: f,
            title: titleMatch ? titleMatch[1] : f.replace('.html', ''),
            desc: extractDesc(content),
            mtime: stat.mtime,
            ctime: stat.birthtime,
            size: stat.size,
            category,
            href: `/artifacts/${prefix}${f}`,
          };
        })
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch { return []; }
  };

  const allFiles: Record<string, ArtifactFile[]> = {};
  const rootFiles = scanDir(baseDir, '_root');
  if (rootFiles.length) allFiles['_root'] = rootFiles;

  try {
    fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .forEach(d => {
        const files = scanDir(path.join(baseDir, d.name), d.name);
        if (files.length) allFiles[d.name] = files;
      });
  } catch { /* */ }

  const allFlat = Object.values(allFiles).flat();
  const totalCount = allFlat.length;
  const totalSize = allFlat.reduce((s, f) => s + f.size, 0);
  const catCount = Object.keys(allFiles).length;

  const formatDate = (d: Date) => {
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금 전';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const formatSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1048576).toFixed(1)}MB`;

  const memosPath = path.join(baseDir, '.memos.json');
  let memos: Record<string, string> = {};
  try { memos = JSON.parse(fs.readFileSync(memosPath, 'utf-8')); } catch { /* */ }

  const formatDateFull = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const cardsJson = JSON.stringify(allFlat.map(f => ({
    title: f.title, desc: f.desc, name: f.name, href: f.href,
    category: f.category, size: formatSize(f.size), date: formatDate(f.mtime),
    color: (categories[f.category] || categories._root).color,
    catLabel: (categories[f.category] || categories._root).label,
    mtime: f.mtime.toISOString(), ctime: f.ctime.toISOString(),
    mtimeLabel: formatDateFull(f.mtime), ctimeLabel: formatDateFull(f.ctime),
    memo: memos[(f.category === '_root' ? '' : f.category + '/') + f.name] || '',
  })));

  const allCatsJson = JSON.stringify(Object.entries(categories).filter(([k]) => k !== '_root').map(([k, v]) => ({ key: k, label: v.label, icon: v.icon, color: v.color })));

  const filterTabs = Object.entries(allFiles).map(([cat, files]) => {
    const info = categories[cat] || { label: cat, color: '#8b5cf6', icon: '📁' };
    return `<button class="tab" data-cat="${cat}" onclick="filterCat('${cat}')" style="--c:${info.color}">${info.icon} ${info.label} <span class="tab-count">${files.length}</span></button>`;
  }).join('');

  res.send(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>놀이터 홈</title>
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Pretendard Variable',-apple-system,system-ui,sans-serif;background:#0a0a0f;color:#f1f5f9;min-height:100vh;padding:48px 24px 100px}
.container{max-width:1100px;margin:0 auto}
.back{display:inline-block;margin-bottom:24px;font-size:13px;color:#64748b;text-decoration:none;transition:color 0.2s}
.back:hover{color:#f1f5f9}
.hero{margin-bottom:36px}
.hero h1{font-size:36px;font-weight:900;margin-bottom:4px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero .sub{font-size:14px;color:#64748b}
.stats{display:flex;gap:1px;background:rgba(255,255,255,0.04);border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);margin-bottom:28px}
.stat{flex:1;background:#111119;padding:18px;text-align:center}
.stat .num{font-size:26px;font-weight:900;background:linear-gradient(135deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.stat .label{font-size:10px;color:#64748b;margin-top:3px;letter-spacing:0.5px}
.tabs{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
.tab{background:#111119;border:1px solid rgba(255,255,255,0.06);border-radius:100px;padding:8px 16px;font-size:12px;font-weight:600;color:#94a3b8;cursor:pointer;transition:all 0.2s;display:flex;align-items:center;gap:6px;font-family:inherit}
.tab:hover{border-color:rgba(255,255,255,0.15);color:#f1f5f9}
.tab.active{background:color-mix(in srgb,var(--c) 15%,#111119);border-color:var(--c);color:var(--c)}
.tab-all{--c:#f1f5f9}
.tab-count{font-size:10px;opacity:0.5}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.card{display:block;border-radius:16px;background:#111119;border:1px solid rgba(255,255,255,0.04);text-decoration:none;color:#f1f5f9;transition:all 0.3s;overflow:hidden}
.card:hover{border-color:rgba(139,92,246,0.3);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.4)}
.card-thumb{width:100%;height:180px;background:#0d0d14;position:relative;overflow:hidden}
.card-thumb iframe{width:200%;height:200%;transform:scale(0.5);transform-origin:0 0;pointer-events:none;border:none}
.card-thumb .overlay{position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(10,10,15,0.9));pointer-events:none}
.card-body{padding:16px 18px 18px}
.card-badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;margin-bottom:8px;letter-spacing:0.5px}
.card-title{font-size:15px;font-weight:700;margin-bottom:4px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card-desc{font-size:12px;color:#64748b;margin-bottom:10px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:18px}
.card-meta{display:flex;justify-content:space-between;font-size:11px;color:#4a4a5a}
.empty{text-align:center;padding:80px 20px;color:#64748b}
.empty-icon{font-size:48px;margin-bottom:16px}
.empty-text{font-size:14px;line-height:1.6}
.folder-info{background:#111119;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px 24px;margin-bottom:28px;font-size:12px;color:#64748b;display:flex;align-items:center;gap:12px}
.folder-info code{background:rgba(139,92,246,0.1);color:#a78bfa;padding:2px 8px;border-radius:6px;font-size:11px}
.card-actions{position:absolute;top:8px;right:8px;z-index:5;opacity:0;transition:opacity 0.2s}
.card:hover .card-actions{opacity:1}
.btn-move{width:32px;height:32px;border-radius:8px;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);color:#f1f5f9;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.2s}
.btn-move:hover{background:rgba(139,92,246,0.6);border-color:var(--purple)}
.move-modal{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center}
.move-modal.show{display:flex}
.move-box{background:#111119;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;width:360px;max-width:90vw}
.move-box h3{font-size:16px;font-weight:700;margin-bottom:4px}
.move-box .move-file{font-size:12px;color:#64748b;margin-bottom:20px;word-break:break-all}
.move-list{display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto}
.move-item{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);cursor:pointer;transition:all 0.15s;font-size:13px;font-weight:600;color:#94a3b8}
.move-item:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:#f1f5f9}
.move-item.current{border-color:rgba(139,92,246,0.3);background:rgba(139,92,246,0.08);color:var(--purple)}
.move-item .mi-icon{font-size:16px}
.move-item .mi-label{flex:1}
.move-item .mi-check{font-size:11px;color:var(--purple)}
.move-cancel{margin-top:16px;width:100%;padding:10px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:#64748b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s}
.move-cancel:hover{background:rgba(255,255,255,0.08);color:#f1f5f9}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:10px 24px;border-radius:100px;font-size:13px;font-weight:600;z-index:200;opacity:0;transition:opacity 0.3s;pointer-events:none}
.toast.show{opacity:1}
.controls{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.view-btns{display:flex;gap:2px;background:#111119;border:1px solid rgba(255,255,255,0.06);border-radius:10px;overflow:hidden}
.view-btn{background:none;border:none;color:#64748b;padding:8px 12px;font-size:12px;cursor:pointer;font-family:inherit;transition:all 0.2s}
.view-btn.active{background:rgba(139,92,246,0.15);color:#a78bfa}
.view-btn:hover{color:#f1f5f9}
.sort-select{background:#111119;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:8px 12px;font-size:12px;color:#94a3b8;font-family:inherit;cursor:pointer;outline:none}
.sort-select option{background:#111119}
.list-view{display:flex;flex-direction:column;gap:2px}
.list-item{display:flex;align-items:center;gap:16px;padding:12px 16px;background:#111119;border:1px solid rgba(255,255,255,0.04);border-radius:10px;text-decoration:none;color:#f1f5f9;transition:all 0.2s;cursor:pointer}
.list-item:hover{border-color:rgba(139,92,246,0.3);background:#13131f}
.list-badge{font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;white-space:nowrap}
.list-title{flex:1;font-size:14px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.list-memo{font-size:11px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.list-dates{font-size:11px;color:#4a4a5a;white-space:nowrap}
.list-size{font-size:11px;color:#4a4a5a;white-space:nowrap;min-width:50px;text-align:right}
.list-actions{display:flex;gap:4px}
.board-view{display:flex;gap:16px;overflow-x:auto;padding-bottom:16px}
.board-col{min-width:280px;flex:1;background:#111119;border:1px solid rgba(255,255,255,0.04);border-radius:14px;padding:16px}
.board-col-title{font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px}
.board-col-count{font-size:11px;color:#64748b;font-weight:400}
.board-card{padding:12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all 0.2s}
.board-card:hover{border-color:rgba(139,92,246,0.3);background:rgba(255,255,255,0.04)}
.board-card-title{font-size:13px;font-weight:600;margin-bottom:4px}
.board-card-meta{font-size:11px;color:#4a4a5a}
.board-card-memo{font-size:11px;color:#64748b;margin-top:4px;font-style:italic}
.tl-view{position:relative;padding-left:32px}
.tl-view::before{content:'';position:absolute;left:11px;top:0;bottom:0;width:2px;background:rgba(139,92,246,0.2);border-radius:1px}
.tl-group{margin-bottom:24px}
.tl-date{font-size:12px;font-weight:700;color:#a78bfa;margin-bottom:8px;position:relative}
.tl-date::before{content:'';position:absolute;left:-25px;top:4px;width:10px;height:10px;border-radius:50%;background:#8b5cf6;border:2px solid #0a0a0f}
.tl-item{margin-left:0;margin-bottom:6px;padding:10px 14px;background:#111119;border:1px solid rgba(255,255,255,0.04);border-radius:10px;cursor:pointer;transition:all 0.2s}
.tl-item:hover{border-color:rgba(139,92,246,0.3)}
.tl-item-title{font-size:13px;font-weight:600}
.tl-item-meta{font-size:11px;color:#4a4a5a;margin-top:2px}
.tl-item-memo{font-size:11px;color:#64748b;margin-top:3px;font-style:italic}
.memo-modal{display:none;position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center}
.memo-modal.show{display:flex}
.memo-box{background:#111119;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;width:420px;max-width:90vw}
.memo-box h3{font-size:16px;font-weight:700;margin-bottom:4px}
.memo-box .memo-file{font-size:12px;color:#64748b;margin-bottom:16px}
.memo-box textarea{width:100%;height:120px;background:#0a0a0f;border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;font-size:13px;color:#f1f5f9;font-family:inherit;resize:vertical;outline:none}
.memo-box textarea:focus{border-color:rgba(139,92,246,0.4)}
.memo-btns{display:flex;gap:8px;margin-top:12px}
.memo-save{flex:1;padding:10px;border-radius:10px;background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.3);color:#a78bfa;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}
.memo-save:hover{background:rgba(139,92,246,0.3)}
.btn-memo{width:32px;height:32px;border-radius:8px;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);color:#f1f5f9;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.2s}
.btn-memo:hover{background:rgba(139,92,246,0.6)}
.btn-memo.has-memo{border-color:rgba(139,92,246,0.4);color:#a78bfa}
.btn-delete{width:32px;height:32px;border-radius:8px;background:rgba(0,0,0,0.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);color:#f1f5f9;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all 0.2s}
.btn-delete:hover{background:rgba(239,68,68,0.6);border-color:#ef4444}
.card-memo-preview{font-size:11px;color:#a78bfa;font-style:italic;margin-top:4px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
@media(max-width:700px){.grid{grid-template-columns:1fr}.stats{flex-wrap:wrap}.stat{min-width:45%}.board-view{flex-direction:column}.board-col{min-width:auto}}
</style></head><body>
<div class="container">
<a href="/" class="back">← BlogBot</a>
<div class="hero">
  <h1>놀이터 홈</h1>
  <p class="sub">만들고 던져놓으면, 알아서 정리되는 곳</p>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
  <a href="/artifacts/놀이터/프로젝트-도시-건설현장-v3.html" style="display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,rgba(139,92,246,0.06),rgba(6,182,212,0.04));border:1px solid rgba(139,92,246,0.18);text-decoration:none;color:#f1f5f9;transition:all 0.3s;font-family:inherit;overflow:hidden;position:relative" onmouseover="this.style.borderColor='rgba(139,92,246,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(139,92,246,0.18)';this.style.transform='none'">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:22px">🏙️</span>
      <div>
        <div style="font-size:13px;font-weight:800">프로젝트 도시</div>
        <div style="font-size:10px;color:#8892b0">3D 건물로 한눈에</div>
      </div>
    </div>
    <div style="position:relative;height:90px;border-radius:8px;overflow:hidden;background:linear-gradient(135deg,#0a0a15,#12121f)">
      <div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 60%,rgba(139,92,246,0.1),transparent 50%),radial-gradient(circle at 70% 40%,rgba(6,182,212,0.08),transparent 50%)"></div>
      <div style="position:absolute;left:12%;top:25%;text-align:center"><div style="font-size:16px">🔮</div><div style="font-size:7px;color:#8892b0">사주아이</div></div>
      <div style="position:absolute;left:30%;top:18%;text-align:center"><div style="font-size:14px">🎰</div><div style="font-size:7px;color:#8892b0">BlogBot</div></div>
      <div style="position:absolute;left:48%;top:22%;text-align:center"><div style="font-size:18px">🏰</div><div style="font-size:7px;color:#8892b0">뇌울림</div></div>
      <div style="position:absolute;left:65%;top:30%;text-align:center"><div style="font-size:14px">🎤</div><div style="font-size:7px;color:#8892b0">셀럽AI</div></div>
      <div style="position:absolute;left:82%;top:20%;text-align:center"><div style="font-size:14px">🧠</div><div style="font-size:7px;color:#8892b0">Brain</div></div>
      <div style="position:absolute;left:28%;top:55%;text-align:center"><div style="font-size:12px">🏭</div><div style="font-size:7px;color:#5a6480">Meta</div></div>
      <div style="position:absolute;left:75%;top:55%;text-align:center"><div style="font-size:11px">📊</div><div style="font-size:7px;color:#5a6480">Baejji</div></div>
    </div>
  </a>
  <a href="/artifacts/놀이터/내-모든-프로젝트-칸반-보드.html" style="display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,rgba(245,158,11,0.06),rgba(34,197,94,0.04));border:1px solid rgba(245,158,11,0.18);text-decoration:none;color:#f1f5f9;transition:all 0.3s;font-family:inherit;overflow:hidden;position:relative" onmouseover="this.style.borderColor='rgba(245,158,11,0.5)';this.style.transform='translateY(-2px)'" onmouseout="this.style.borderColor='rgba(245,158,11,0.18)';this.style.transform='none'">
    <div style="display:flex;align-items:center;gap:8px">
      <span style="font-size:22px">📋</span>
      <div>
        <div style="font-size:13px;font-weight:800">내 모든 프로젝트</div>
        <div style="font-size:10px;color:#8892b0">칸반 보드로 한눈에</div>
      </div>
    </div>
    <div style="position:relative;height:90px;border-radius:8px;overflow:hidden;background:#0a0a12;display:flex;gap:4px;padding:6px">
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div style="font-size:7px;color:#8b5cf6;font-weight:700;padding:0 2px">💡 기획</div>
        <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#a78bfa">🎤 셀럽AI</div>
        <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#a78bfa">🧠 Brain</div>
        <div style="background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#a78bfa">📊 Baejji</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div style="font-size:7px;color:#f59e0b;font-weight:700;padding:0 2px">🔨 진행</div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#fbbf24">🔊 물음표</div>
        <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#fbbf24">🏰 L PRO</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div style="font-size:7px;color:#3b82f6;font-weight:700;padding:0 2px">✅ 완료</div>
        <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#93c5fd">🔮 사주아이</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <div style="font-size:7px;color:#22c55e;font-weight:700;padding:0 2px">🟢 운영</div>
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#86efac">🎰 BlogBot</div>
        <div style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.12);border-radius:4px;padding:3px 4px;font-size:6px;color:#86efac">🏰 뇌울림</div>
      </div>
    </div>
  </a>
</div>
<div class="stats">
  <div class="stat"><div class="num">${totalCount}</div><div class="label">파일</div></div>
  <div class="stat"><div class="num">${catCount}</div><div class="label">카테고리</div></div>
  <div class="stat"><div class="num">${formatSize(totalSize)}</div><div class="label">전체 용량</div></div>
  <div class="stat"><div class="num">${allFlat.length > 0 ? formatDate(allFlat[0].mtime) : '-'}</div><div class="label">최근 업데이트</div></div>
</div>
<div class="folder-info">
  📂 저장 위치: <code>public/artifacts/</code> → <code>dev/</code> 개발용 · <code>showcase/</code> 공개용 · <code>archive/</code> 아카이브
</div>
<div style="margin-bottom:16px">
  <input type="text" id="searchInput" placeholder="검색..." oninput="render()" style="width:100%;background:#111119;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 16px;font-size:14px;color:#f1f5f9;font-family:inherit;outline:none">
</div>
<div class="controls">
  <div class="view-btns">
    <button class="view-btn active" data-view="card" onclick="setView('card')">카드</button>
    <button class="view-btn" data-view="list" onclick="setView('list')">리스트</button>
    <button class="view-btn" data-view="board" onclick="setView('board')">보드</button>
    <button class="view-btn" data-view="timeline" onclick="setView('timeline')">타임라인</button>
  </div>
  <select class="sort-select" id="sortSelect" onchange="render()">
    <option value="mtime-desc">수정일 (최신순)</option>
    <option value="mtime-asc">수정일 (오래된순)</option>
    <option value="ctime-desc">생성일 (최신순)</option>
    <option value="ctime-asc">생성일 (오래된순)</option>
    <option value="name-asc">이름 (ㄱ-ㅎ)</option>
    <option value="name-desc">이름 (ㅎ-ㄱ)</option>
  </select>
</div>
<div class="tabs">
  <button class="tab tab-all active" style="--c:#f1f5f9" onclick="filterCat('all')">전체 <span class="tab-count">${totalCount}</span></button>
  ${filterTabs}
</div>
<div id="grid" class="grid"></div>
</div>
<div class="move-modal" id="moveModal" onclick="if(event.target===this)closeMove()">
  <div class="move-box">
    <h3>폴더 이동</h3>
    <div class="move-file" id="moveFile"></div>
    <div class="move-list" id="moveList"></div>
    <button class="move-cancel" onclick="closeMove()">취소</button>
  </div>
</div>
<div class="memo-modal" id="memoModal" onclick="if(event.target===this)closeMemo()">
  <div class="memo-box">
    <h3>메모</h3>
    <div class="memo-file" id="memoFile"></div>
    <textarea id="memoText" placeholder="이 아티팩트에 대한 메모..."></textarea>
    <div class="memo-btns">
      <button class="move-cancel" onclick="closeMemo()">취소</button>
      <button class="memo-save" onclick="saveMemo()">저장</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const cards=${cardsJson};
const allCats=${allCatsJson};window._allCats=allCats;
let currentCat='all';
let currentView='card';
let moveTarget=null;
let memoTarget=null;

function filterCat(cat){
  currentCat=cat;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(cat==='all'?'.tab-all':'.tab[data-cat="'+cat+'"]').classList.add('active');
  render();
}

function setView(v){
  currentView=v;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector('.view-btn[data-view="'+v+'"]').classList.add('active');
  render();
}

function getFiltered(){
  const q=(document.getElementById('searchInput').value||'').toLowerCase();
  let f=currentCat==='all'?[...cards]:cards.filter(c=>c.category===currentCat);
  if(q)f=f.filter(c=>c.title.toLowerCase().includes(q)||c.name.toLowerCase().includes(q)||(c.desc||'').toLowerCase().includes(q)||c.catLabel.toLowerCase().includes(q)||(c.memo||'').toLowerCase().includes(q));
  const sort=document.getElementById('sortSelect').value;
  const [key,dir]=sort.split('-');
  f.sort((a,b)=>{
    let va,vb;
    if(key==='name'){va=a.title.toLowerCase();vb=b.title.toLowerCase();return dir==='asc'?va.localeCompare(vb):vb.localeCompare(va);}
    va=new Date(a[key]).getTime();vb=new Date(b[key]).getTime();
    return dir==='desc'?vb-va:va-vb;
  });
  return f;
}

function memoKey(c){return (c.category==='_root'?'':c.category+'/')+c.name;}

function render(){
  const filtered=getFiltered();
  const grid=document.getElementById('grid');
  if(!filtered.length){grid.className='grid';grid.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">검색 결과가 없습니다</div></div>';return;}

  if(currentView==='card'){
    grid.className='grid';
    grid.innerHTML=filtered.map(c=>\`
      <div class="card" style="position:relative">
        <div class="card-actions">
          <button class="btn-memo \${c.memo?'has-memo':''}" onclick="event.preventDefault();event.stopPropagation();openMemoFor('\${memoKey(c).replace(/'/g,"\\\\'")}')" title="메모">📝</button>
          <button class="btn-move" onclick="event.preventDefault();event.stopPropagation();openMoveFor('\${memoKey(c).replace(/'/g,"\\\\'")}')" title="폴더 이동">📁</button>
          <button class="btn-delete" onclick="event.preventDefault();event.stopPropagation();deleteArtifact('\${c.catKey}','\${c.name.replace(/'/g,"\\\\'")}')" title="삭제 (archive로)">🗑️</button>
        </div>
        <a href="\${c.href}" style="text-decoration:none;color:inherit">
          <div class="card-thumb">
            <iframe src="\${c.href}" loading="lazy" sandbox="allow-same-origin" tabindex="-1"></iframe>
            <div class="overlay"></div>
          </div>
          <div class="card-body">
            <span class="card-badge" style="background:color-mix(in srgb,\${c.color} 15%,#111119);color:\${c.color}">\${c.catLabel}</span>
            <div class="card-title">\${c.title}</div>
            <div class="card-desc">\${c.desc}</div>
            \${c.memo?'<div class="card-memo-preview">📝 '+c.memo+'</div>':''}
            <div class="card-meta"><span>생성 \${c.ctimeLabel}</span><span>\${c.size} · 수정 \${c.mtimeLabel}</span></div>
          </div>
        </a>
      </div>\`).join('');
  }
  else if(currentView==='list'){
    grid.className='list-view';
    grid.innerHTML=filtered.map(c=>\`
      <div class="list-item" onclick="location.href='\${c.href}'">
        <span class="list-badge" style="background:color-mix(in srgb,\${c.color} 15%,#111119);color:\${c.color}">\${c.catLabel}</span>
        <span class="list-title">\${c.title}</span>
        \${c.memo?'<span class="list-memo">📝 '+c.memo+'</span>':''}
        <span class="list-dates">생성 \${c.ctimeLabel} · 수정 \${c.mtimeLabel}</span>
        <span class="list-size">\${c.size}</span>
        <div class="list-actions">
          <button class="btn-memo \${c.memo?'has-memo':''}" onclick="event.stopPropagation();openMemoFor('\${memoKey(c).replace(/'/g,"\\\\'")}')" title="메모" style="width:28px;height:28px;font-size:12px">📝</button>
        </div>
      </div>\`).join('');
  }
  else if(currentView==='board'){
    grid.className='board-view';
    const groups={};
    filtered.forEach(c=>{if(!groups[c.category])groups[c.category]=[];groups[c.category].push(c);});
    grid.innerHTML=Object.entries(groups).map(([cat,items])=>{
      const info=allCats.find(x=>x.key===cat)||{icon:'📁',label:cat,color:'#64748b'};
      return \`<div class="board-col">
        <div class="board-col-title"><span>\${info.icon} \${info.label}</span><span class="board-col-count">\${items.length}</span></div>
        \${items.map(c=>\`<div class="board-card" onclick="location.href='\${c.href}'">
          <div class="board-card-title">\${c.title}</div>
          <div class="board-card-meta">생성 \${c.ctimeLabel} · 수정 \${c.mtimeLabel} · \${c.size}</div>
          \${c.memo?'<div class="board-card-memo">📝 '+c.memo+'</div>':''}
        </div>\`).join('')}
      </div>\`;
    }).join('');
  }
  else if(currentView==='timeline'){
    grid.className='tl-view';
    const groups={};
    filtered.forEach(c=>{const d=c.ctimeLabel;if(!groups[d])groups[d]=[];groups[d].push(c);});
    const sortedDates=Object.keys(groups).sort((a,b)=>b.localeCompare(a));
    grid.innerHTML=sortedDates.map(date=>\`
      <div class="tl-group">
        <div class="tl-date">\${date}</div>
        \${groups[date].map(c=>\`<div class="tl-item" onclick="location.href='\${c.href}'">
          <div class="tl-item-title"><span style="color:\${c.color}">\${c.catLabel}</span> · \${c.title}</div>
          <div class="tl-item-meta">\${c.name} · \${c.size} · 수정 \${c.mtimeLabel}</div>
          \${c.memo?'<div class="tl-item-memo">📝 '+c.memo+'</div>':''}
        </div>\`).join('')}
      </div>\`).join('');
  }
}

function openMoveFor(key){
  const c=cards.find(x=>memoKey(x)===key);
  if(!c)return;
  moveTarget=c;
  document.getElementById('moveFile').textContent=c.title+' ('+c.name+')';
  document.getElementById('moveList').innerHTML=allCats.map(cat=>
    '<div class="move-item'+(cat.key===c.category?' current':'')+'" onclick="doMove(\\''+cat.key+'\\')">'
    +'<span class="mi-icon">'+cat.icon+'</span>'
    +'<span class="mi-label">'+cat.label+'</span>'
    +(cat.key===c.category?'<span class="mi-check">현재</span>':'')
    +'</div>'
  ).join('');
  document.getElementById('moveModal').classList.add('show');
}

function closeMove(){document.getElementById('moveModal').classList.remove('show');moveTarget=null;}

async function doMove(toCat){
  if(!moveTarget||toCat===moveTarget.category)return closeMove();
  try{
    const res=await fetch('/api/artifacts/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:moveTarget.name,from:moveTarget.category,to:toCat})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error);
    showToast(moveTarget.title+' → '+allCats.find(c=>c.key===toCat).label);
    closeMove();setTimeout(()=>location.reload(),600);
  }catch(e){showToast('이동 실패: '+e.message);}
}

async function deleteArtifact(from,file){
  if(!confirm('🗑️ "'+file+'" 삭제할까?\\n(archive 폴더로 이동됨, 완전 삭제 아님)'))return;
  try{
    const res=await fetch('/api/artifacts/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file,from})});
    if(!res.ok){const d=await res.json();throw new Error(d.error);}
    showToast(file+' → archive/');
    setTimeout(()=>location.reload(),600);
  }catch(e){showToast('삭제 실패: '+e.message);}
}

function openMemoFor(key){
  const c=cards.find(x=>memoKey(x)===key);
  if(!c)return;
  memoTarget=c;
  document.getElementById('memoFile').textContent=c.title+' ('+c.name+')';
  document.getElementById('memoText').value=c.memo||'';
  document.getElementById('memoModal').classList.add('show');
  document.getElementById('memoText').focus();
}

function openMemo(idx){
  const c=cards[idx];
  if(!c)return;
  openMemoFor(memoKey(c));
}

function closeMemo(){document.getElementById('memoModal').classList.remove('show');memoTarget=null;}

async function saveMemo(){
  if(!memoTarget)return;
  const key=memoKey(memoTarget);
  const memo=document.getElementById('memoText').value.trim();
  try{
    const res=await fetch('/api/artifacts/memo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,memo})});
    if(!res.ok)throw new Error('저장 실패');
    memoTarget.memo=memo;
    showToast('메모 저장됨');
    closeMemo();render();
  }catch(e){showToast('메모 저장 실패');}
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}

render();
</script>
${(() => { try { return fs.readFileSync(path.join(__dirname, '..', 'public', 'welcome-popup.html'), 'utf-8').replace('data-artifacts="0"', 'data-artifacts="' + totalCount + '"').replace('data-projects="0"', 'data-projects="' + catCount + '"').replace("data-cats=\"[]\"", "data-cats='" + allCatsJson + "'"); } catch(e) { return '<!-- welcome popup load error -->'; } })()}
</body></html>`);
});

// 아티팩트 메모 API
app.post('/api/artifacts/memo', (req, res) => {
  const { key, memo } = req.body as { key: string; memo: string };
  if (!key) return res.status(400).json({ error: 'key 필수' });
  const memosPath = path.join(__dirname, '..', 'public', 'artifacts', '.memos.json');
  let memos: Record<string, string> = {};
  try { memos = JSON.parse(fs.readFileSync(memosPath, 'utf-8')); } catch { /* */ }
  if (memo) memos[key] = memo; else delete memos[key];
  fs.writeFileSync(memosPath, JSON.stringify(memos, null, 2));
  res.json({ success: true });
});

// 아티팩트 폴더 이동 API
app.post('/api/artifacts/move', (req, res) => {
  const { file, from, to } = req.body as { file: string; from: string; to: string };
  if (!file || !to) return res.status(400).json({ error: 'file, to 필수' });
  const baseDir = path.join(__dirname, '..', 'public', 'artifacts');
  const fromDir = from && from !== '_root' ? path.join(baseDir, from) : baseDir;
  const toDir = to !== '_root' ? path.join(baseDir, to) : baseDir;
  const srcPath = path.join(fromDir, file);
  if (!fs.existsSync(srcPath)) return res.status(404).json({ error: '파일 없음' });
  if (!fs.existsSync(toDir)) fs.mkdirSync(toDir, { recursive: true });
  const destPath = path.join(toDir, file);
  if (fs.existsSync(destPath)) return res.status(409).json({ error: '대상 폴더에 같은 이름 존재' });
  fs.renameSync(srcPath, destPath);
  res.json({ success: true, newHref: `/artifacts/${to !== '_root' ? to + '/' : ''}${file}` });
});

// 아티팩트 삭제 API (archive/로 이동)
app.post('/api/artifacts/delete', (req, res) => {
  const { file, from } = req.body as { file: string; from: string };
  if (!file) return res.status(400).json({ error: 'file 필수' });
  const baseDir = path.join(__dirname, '..', 'public', 'artifacts');
  const fromDir = from && from !== '_root' ? path.join(baseDir, from) : baseDir;
  const archiveDir = path.join(baseDir, 'archive');
  const srcPath = path.join(fromDir, file);
  if (!fs.existsSync(srcPath)) return res.status(404).json({ error: '파일 없음' });
  if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
  const destPath = path.join(archiveDir, file);
  // 같은 이름이 archive에 있으면 타임스탬프 붙임
  const finalDest = fs.existsSync(destPath) ? destPath.replace('.html', `-${Date.now()}.html`) : destPath;
  fs.renameSync(srcPath, finalDest);
  res.json({ success: true });
});

app.use('/', generateRouter);
app.use('/api', historyRouter);
app.use('/api', channelRouter);
app.use('/api', ebookRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
