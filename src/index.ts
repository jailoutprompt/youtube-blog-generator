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

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  interface ArtifactFile { name: string; title: string; desc: string; mtime: Date; size: number; category: string; href: string; }

  const categories: Record<string, { label: string; desc: string; color: string; icon: string }> = {
    showcase:  { label: '쇼케이스',    desc: '외부 공개 / 마케팅용',      color: '#22c55e', icon: '🌐' },
    dev:       { label: 'BlogBot',    desc: '개발 · 기획 · 내부용',      color: '#8b5cf6', icon: '🔧' },
    'saju-ai': { label: '사주아이',    desc: '사주 서비스 클론 프로젝트',  color: '#ec4899', icon: '🔮' },
    metapress: { label: 'MetaPress',  desc: '뉴스레터 플랫폼',           color: '#06b6d4', icon: '📰' },
    dating:    { label: '한일연애',    desc: '소개팅 매칭 서비스',         color: '#f43f5e', icon: '💕' },
    doagent:   { label: 'DoAgent',    desc: 'AI 에이전트 서비스',         color: '#10b981', icon: '🤖' },
    vibe:      { label: '바이브코딩',  desc: '사이드 프로젝트 모음',       color: '#3b82f6', icon: '⚡' },
    business:  { label: '비즈니스',    desc: '뇌울림 · 무무익선 분석',     color: '#f59e0b', icon: '💼' },
    archive:   { label: '기타',       desc: '미분류 과거 작업',           color: '#64748b', icon: '📦' },
    _root:     { label: '미분류',      desc: '미분류',                    color: '#64748b', icon: '📄' },
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
            title: titleMatch ? titleMatch[1].replace(/\s*[—\-|].*/,'') : f.replace('.html', ''),
            desc: extractDesc(content),
            mtime: stat.mtime,
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

  const cardsJson = JSON.stringify(allFlat.map(f => ({
    title: f.title, desc: f.desc, name: f.name, href: f.href,
    category: f.category, size: formatSize(f.size), date: formatDate(f.mtime),
    color: (categories[f.category] || categories._root).color,
    catLabel: (categories[f.category] || categories._root).label,
  })));

  const allCatsJson = JSON.stringify(Object.entries(categories).filter(([k]) => k !== '_root').map(([k, v]) => ({ key: k, label: v.label, icon: v.icon, color: v.color })));

  const filterTabs = Object.entries(allFiles).map(([cat, files]) => {
    const info = categories[cat] || { label: cat, color: '#8b5cf6', icon: '📁' };
    return `<button class="tab" data-cat="${cat}" onclick="filterCat('${cat}')" style="--c:${info.color}">${info.icon} ${info.label} <span class="tab-count">${files.length}</span></button>`;
  }).join('');

  res.send(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Artifacts</title>
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
@media(max-width:700px){.grid{grid-template-columns:1fr}.stats{flex-wrap:wrap}.stat{min-width:45%}}
</style></head><body>
<div class="container">
<a href="/" class="back">← BlogBot</a>
<div class="hero">
  <h1>Artifacts</h1>
  <p class="sub">AI가 만든 모든 시각 자료, 한 곳에서</p>
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
<div class="tabs">
  <button class="tab tab-all active" style="--c:#f1f5f9" onclick="filterCat('all')">전체 <span class="tab-count">${totalCount}</span></button>
  ${filterTabs}
</div>
<div class="grid" id="grid"></div>
</div>
<div class="move-modal" id="moveModal" onclick="if(event.target===this)closeMove()">
  <div class="move-box">
    <h3>폴더 이동</h3>
    <div class="move-file" id="moveFile"></div>
    <div class="move-list" id="moveList"></div>
    <button class="move-cancel" onclick="closeMove()">취소</button>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
const cards=${cardsJson};
const allCats=${allCatsJson};
let currentCat='all';
let moveTarget=null;

function filterCat(cat){
  currentCat=cat;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(cat==='all'?'.tab-all':'.tab[data-cat="'+cat+'"]').classList.add('active');
  render();
}

function render(){
  const filtered=currentCat==='all'?cards:cards.filter(c=>c.category===currentCat);
  const grid=document.getElementById('grid');
  if(!filtered.length){grid.innerHTML='<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">이 카테고리에 파일이 없습니다</div></div>';return;}
  grid.innerHTML=filtered.map((c,i)=>\`
    <div class="card" style="position:relative">
      <div class="card-actions">
        <button class="btn-move" onclick="event.preventDefault();event.stopPropagation();openMove(\${i})" title="폴더 이동">📁</button>
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
          <div class="card-meta"><span>\${c.name}</span><span>\${c.size} · \${c.date}</span></div>
        </div>
      </a>
    </div>\`).join('');
}

function openMove(idx){
  const filtered=currentCat==='all'?cards:cards.filter(c=>c.category===currentCat);
  moveTarget=filtered[idx];
  document.getElementById('moveFile').textContent=moveTarget.title+' ('+moveTarget.name+')';
  document.getElementById('moveList').innerHTML=allCats.map(cat=>
    '<div class="move-item'+(cat.key===moveTarget.category?' current':'')+'" onclick="doMove(\\''+cat.key+'\\')">'
    +'<span class="mi-icon">'+cat.icon+'</span>'
    +'<span class="mi-label">'+cat.label+'</span>'
    +(cat.key===moveTarget.category?'<span class="mi-check">현재</span>':'')
    +'</div>'
  ).join('');
  document.getElementById('moveModal').classList.add('show');
}

function closeMove(){
  document.getElementById('moveModal').classList.remove('show');
  moveTarget=null;
}

async function doMove(toCat){
  if(!moveTarget||toCat===moveTarget.category)return closeMove();
  try{
    const res=await fetch('/api/artifacts/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:moveTarget.name,from:moveTarget.category,to:toCat})});
    const data=await res.json();
    if(!res.ok)throw new Error(data.error);
    showToast(moveTarget.title+' → '+allCats.find(c=>c.key===toCat).label);
    closeMove();
    setTimeout(()=>location.reload(),600);
  }catch(e){showToast('이동 실패: '+e.message);}
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2000);
}

render();
</script>
</body></html>`);
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

app.use('/', generateRouter);
app.use('/api', historyRouter);
app.use('/api', channelRouter);
app.use('/api', ebookRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
