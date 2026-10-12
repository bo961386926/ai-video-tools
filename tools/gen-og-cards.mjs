#!/usr/bin/env node
/**
 * gen-og-cards.mjs —— 生成站点社交分享卡（og:image），共 90 张 1200×630 PNG
 * ============================================================================
 *
 * 用法（纯 Node，零依赖，需 Node 18+；本机验证环境 Node v22.23.2 / macOS）：
 *
 *   node tools/gen-og-cards.mjs                     # 全量生成 90 张（工具 81 + 分类 6 + 站点 3）
 *   node tools/gen-og-cards.mjs --only=pika         # 只生成一张（工具/分类/站点 slug 均可，便于调试）
 *   node tools/gen-og-cards.mjs --only=home         # 站点卡：home / about / submit
 *   node tools/gen-og-cards.mjs --concurrency=4     # 并发数（1-4，默认 3；不建议超过 4）
 *   node tools/gen-og-cards.mjs --report            # 用 --dump-dom 回读每张卡的自动排版结果
 *                                                   #（标题字号/行数/是否被省略号截断），并打印表格
 *   node tools/gen-og-cards.mjs --verify            # 自检：数量、覆盖率、尺寸、单张与总体积
 *   node tools/gen-og-cards.mjs --keep-profiles     # 保留 Chrome profile 临时目录（默认生成后清理）
 *
 * 产物（构建脚本按这些路径引用，勿改）：
 *   src/assets/og/tool/<slug>.png        81 张
 *   src/assets/og/category/<slug>.png     6 张
 *   src/assets/og/home.png  about.png  submit.png   3 张
 *
 * 实现要点：
 *   1. Node 侧只负责「数据 → HTML」，排版字号由每张 HTML 内联的一小段脚本在浏览器里
 *      用真实字体量测后决定（1 行放得下就大字号，否则缩到最多 2 行），因此不需要估算字宽，
 *      也不会出现文字溢出安全区。
 *   2. 截图用本机 Chrome 无头模式：必须 --headless=old（新版 --headless 在本机会挂起），
 *      每张卡一个独立 --user-data-dir，避免并发争用。
 *   3. 严禁任何外部网络请求：全内联 CSS、系统字体栈（PingFang SC / Hiragino Sans GB）、
 *      图标统一用「首字母方块」，不引用远程图片、Google Fonts 或 CDN。
 *
 * 环境变量：
 *   CHROME_PATH   覆盖 Chrome 可执行文件路径（默认 /Applications/Google Chrome.app/...）。
 *   OG_HTML_DIR   覆盖中间 HTML 输出目录（默认 /tmp/og-html）。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'tools.json');
const OUT_ROOT = path.join(ROOT, 'src', 'assets', 'og');
const HTML_DIR = process.env.OG_HTML_DIR || '/tmp/og-html';
const PROFILE_ROOT = path.join(os.tmpdir(), 'chrome-og-profiles');
const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// 画布与安全区（所有文字必须在距边缘 ≥72px 内）
const W = 1200;
const H = 630;
const SAFE = 72;
const CONTENT_W = 828; // 左栏文字宽度（72 → 900），右侧留给装饰面板

// 品牌色（与 src/assets/css/style.css 保持一致）
const BRAND = {
  primary: '#00a64f',
  primaryStrong: '#00853a',
  grad: 'linear-gradient(135deg, #00853a 0%, #059669 100%)',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  bg: '#f1f5f9',
  white: '#ffffff',
  primarySoft: '#e8f8ef',
};

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};
const ONLY = typeof arg('only') === 'string' ? arg('only') : undefined;
const CONCURRENCY = Math.min(4, Math.max(1, Number(arg('concurrency')) || 3));
const MODE_REPORT = Boolean(arg('report'));
const MODE_VERIFY = Boolean(arg('verify'));
const KEEP_PROFILES = Boolean(arg('keep-profiles'));

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hex2rgb = (hex) => {
  let h = String(hex || '').trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgb2hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** 把 color 往 target 方向混合 amount（0-1） */
const mix = (color, target, amount) => {
  const a = hex2rgb(color);
  const b = hex2rgb(target);
  if (!a || !b) return color;
  return rgb2hex(a.map((v, i) => v * (1 - amount) + b[i] * amount));
};
const pastel = (color, amount = 0.88) => mix(color, '#ffffff', amount);
const deepen = (color, amount = 0.22) => mix(color, '#0f172a', amount);

const firstChar = (s) => Array.from(String(s).trim())[0] || '?';

const pad = (n, len = 2) => String(n).padStart(len, '0');
const fmtTime = (d = new Date()) =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// ---------------------------------------------------------------------------
// 卡片数据
// ---------------------------------------------------------------------------
function buildCards(data) {
  const cats = new Map((data.categories || []).map((c) => [c.slug, c]));
  const countByCat = new Map();
  for (const t of data.tools) countByCat.set(t.category, (countByCat.get(t.category) || 0) + 1);

  const cards = [];
  const colorOf = (slug) => (cats.get(slug)?.color && hex2rgb(cats.get(slug).color) ? cats.get(slug).color : BRAND.primary);

  // 1) 工具卡
  for (const t of data.tools) {
    const c = cats.get(t.category);
    cards.push({
      kind: 'tool',
      slug: t.slug,
      out: path.join(OUT_ROOT, 'tool', `${t.slug}.png`),
      html: path.join(HTML_DIR, `tool-${t.slug}.html`),
      title: t.name,
      tagline: t.tagline || '',
      pill: c ? c.name : t.category,
      color: colorOf(t.category),
      icon: firstChar(t.name),
    });
  }

  // 2) 分类卡
  for (const c of data.categories) {
    cards.push({
      kind: 'category',
      slug: c.slug,
      out: path.join(OUT_ROOT, 'category', `${c.slug}.png`),
      html: path.join(HTML_DIR, `category-${c.slug}.html`),
      title: c.name,
      tagline: c.description || '',
      pill: `${countByCat.get(c.slug) || 0} 款工具`,
      color: colorOf(c.slug),
      icon: firstChar(c.name),
    });
  }

  // 3) 站点卡
  const site = data.site || {};
  const n = data.tools.length;
  cards.push({
    kind: 'site',
    slug: 'home',
    out: path.join(OUT_ROOT, 'home.png'),
    html: path.join(HTML_DIR, 'site-home.html'),
    title: 'AI 视频创作工具导航',
    tagline: `精选 ${n} 款真实好用的 AI 视频创作工具，人工核验并标注定价与国内访问情况`,
    pill: site.name || 'AI视频工具导航',
    color: BRAND.primary,
    icon: 'AI',
  });
  cards.push({
    kind: 'site',
    slug: 'about',
    out: path.join(OUT_ROOT, 'about.png'),
    html: path.join(HTML_DIR, 'site-about.html'),
    title: '关于本站',
    tagline: '了解这个站点做什么、数据从哪来，以及收录与人工核验的标准',
    pill: '站点信息',
    color: BRAND.primary,
    icon: '关',
  });
  cards.push({
    kind: 'site',
    slug: 'submit',
    out: path.join(OUT_ROOT, 'submit.png'),
    html: path.join(HTML_DIR, 'site-submit.html'),
    title: '提交工具',
    tagline: '推荐一款好用的 AI 视频工具，通过表单提交，人工审核后即可收录',
    pill: '欢迎投稿',
    color: BRAND.primary,
    icon: '提',
  });

  return cards;
}

// ---------------------------------------------------------------------------
// HTML 模板
// ---------------------------------------------------------------------------
function renderHtml(card) {
  const pillFg = deepen(card.color, 0.24);
  const pillBg = pastel(card.color, 0.9);
  const pillBd = mix(card.color, '#ffffff', 0.7);
  const iconFg = deepen(card.color, 0.3);
  const iconBg = pastel(card.color, 0.86);

  // 注意：下面的内联脚本位于模板字符串中，脚本内一律不用反引号与 ${}，只用字符串拼接。
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(card.title)} · og card</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:${BRAND.white}}
  body{
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
    color:${BRAND.text};
    -webkit-font-smoothing:antialiased;
  }
  .card{position:relative;width:${W}px;height:${H}px;background:${BRAND.white};overflow:hidden}

  /* 右侧品牌渐变面板（装饰） */
  .panel{
    position:absolute;right:0;top:0;width:264px;height:${H}px;
    background:${BRAND.grad};
    box-shadow:-28px 0 60px rgba(0,166,79,.12);
  }
  .panel::after{
    content:"";position:absolute;inset:0;
    background:radial-gradient(circle at 28% 16%, rgba(255,255,255,.20) 0%, rgba(255,255,255,0) 62%);
  }
  .ring{
    position:absolute;left:50%;top:50%;width:196px;height:196px;margin:-98px 0 0 -98px;
    border:2px solid rgba(255,255,255,.30);border-radius:50%;
  }
  .ring2{
    position:absolute;left:50%;top:50%;width:150px;height:150px;margin:-75px 0 0 -75px;
    border:2px dashed rgba(255,255,255,.22);border-radius:50%;
  }
  .tri{
    position:absolute;left:50%;top:50%;width:0;height:0;
    margin:-46px 0 0 -36px;
    border-top:46px solid transparent;border-bottom:46px solid transparent;
    border-left:76px solid rgba(255,255,255,.97);
  }

  /* 头部：首字母方块 + 分类胶囊 */
  .head{position:absolute;left:${SAFE}px;top:96px;height:72px;display:flex;align-items:center;gap:20px}
  .icon{
    width:72px;height:72px;border-radius:20px;background:${iconBg};
    display:flex;align-items:center;justify-content:center;
    font-size:40px;font-weight:800;color:${iconFg};letter-spacing:.5px;
    border:1px solid ${mix(card.color, '#ffffff', 0.62)};
  }
  .pill{
    display:flex;align-items:center;gap:10px;height:44px;padding:0 22px;border-radius:999px;
    background:${pillBg};border:1px solid ${pillBd};
    font-size:25px;font-weight:700;color:${pillFg};white-space:nowrap;
  }
  .pill i{width:9px;height:9px;border-radius:50%;background:${card.color};display:block}

  /* 标题与副标题（top 由内联脚本量测后设定） */
  .title{
    position:absolute;left:${SAFE}px;top:0;width:${CONTENT_W}px;
    font-size:96px;font-weight:800;line-height:1.12;letter-spacing:-.5px;color:${BRAND.text};
    overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;
  }
  .tagline{
    position:absolute;left:${SAFE}px;top:0;width:${CONTENT_W}px;
    font-size:36px;font-weight:400;line-height:1.45;color:${BRAND.textSecondary};
    overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;
  }

  /* 品牌区（左下） */
  .divider{position:absolute;left:${SAFE}px;top:512px;width:788px;height:1px;background:${BRAND.border}}
  .brand{position:absolute;left:${SAFE}px;bottom:${SAFE}px;height:34px;display:flex;align-items:center;gap:14px}
  .mark{
    width:32px;height:32px;border-radius:9px;background:${BRAND.grad};
    display:flex;align-items:center;justify-content:center;
  }
  .mark i{
    display:block;width:0;height:0;margin-left:3px;
    border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:11px solid #fff;
  }
  .bname{font-size:27px;font-weight:700;color:${BRAND.text}}
  .bsep{font-size:24px;color:${BRAND.border}}
  .bdom{font-size:25px;color:${BRAND.textSecondary};letter-spacing:.2px}
</style>
</head>
<body data-kind="${esc(card.kind)}" data-slug="${esc(card.slug)}">
  <div class="card">
    <div class="panel"><div class="ring"></div><div class="ring2"></div><div class="tri"></div></div>
    <div class="head">
      <div class="icon">${esc(card.icon)}</div>
      <div class="pill"><i></i>${esc(card.pill)}</div>
    </div>
    <div class="title">${esc(card.title)}</div>
    <div class="tagline">${esc(card.tagline)}</div>
    <div class="divider"></div>
    <div class="brand">
      <span class="mark"><i></i></span>
      <span class="bname">AI视频工具导航</span>
      <span class="bsep">·</span>
      <span class="bdom">aitools.coderx.me</span>
    </div>
  </div>
<script>
(function(){
  var W=${CONTENT_W}, GAP=14, TOP=176, BOTTOM=496;
  var T1=[96,90,84,78,72,66], T2=[84,78,72,66], S1=[36,34,32,30];
  var TLH=1.12, SLH=1.45;
  var tEl=document.querySelector('.title'), sEl=document.querySelector('.tagline');
  function nlines(el,size,lh){ return Math.max(1, Math.round(el.scrollHeight/(size*lh))); }
  var i, best1=0, best2=0, best2lines=0;

  // 标题：优先一行大字号，放不下则最多两行（同步缩字号）
  tEl.style.whiteSpace='nowrap';
  for(i=0;i<T1.length;i++){ tEl.style.fontSize=T1[i]+'px'; if(tEl.scrollWidth<=W){ best1=T1[i]; break; } }
  tEl.style.whiteSpace='normal';
  for(i=0;i<T2.length;i++){ tEl.style.fontSize=T2[i]+'px'; var n2=nlines(tEl,T2[i],TLH); if(n2<=2){ best2=T2[i]; best2lines=n2; break; } }
  var tSize, tLines;
  if(best1 && (!best2 || best1>=78)){ tSize=best1; tLines=1; }
  else if(best2){ tSize=best2; tLines=best2lines; }
  else { tSize=T1[T1.length-1]; tLines=2; }
  tEl.style.fontSize=tSize+'px';
  var tFull=nlines(tEl,tSize,TLH);
  tEl.style.webkitLineClamp=String(tLines);
  tEl.style.maxHeight=(tSize*TLH*tLines)+'px';
  var tTrunc=tFull>tLines?1:0;

  // 副标题：36 → 30 之间自适配，最多两行
  var sSize=S1[S1.length-1], sLines=2;
  for(i=0;i<S1.length;i++){ sEl.style.fontSize=S1[i]+'px'; var m=nlines(sEl,S1[i],SLH); if(m<=2){ sSize=S1[i]; sLines=m; break; } }
  sEl.style.fontSize=sSize+'px';
  var sFull=nlines(sEl,sSize,SLH);
  sEl.style.webkitLineClamp=String(sLines);
  sEl.style.maxHeight=(sSize*SLH*sLines)+'px';
  var sTrunc=sFull>sLines?1:0;

  // 标题 + 副标题整体在内容区垂直居中
  var hT=tEl.offsetHeight, hS=sEl.offsetHeight, groupH=hT+GAP+hS;
  var top=TOP+Math.max(0, Math.round((BOTTOM-TOP-groupH)/2));
  tEl.style.top=top+'px';
  sEl.style.top=(top+hT+GAP)+'px';

  document.body.setAttribute('data-title-size',tSize);
  document.body.setAttribute('data-title-lines',tLines);
  document.body.setAttribute('data-title-trunc',tTrunc);
  document.body.setAttribute('data-tag-size',sSize);
  document.body.setAttribute('data-tag-lines',sLines);
  document.body.setAttribute('data-tag-trunc',sTrunc);
})();
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Chrome 调用
// ---------------------------------------------------------------------------
/* 注意：headless Chrome（--headless=old）在写完 --screenshot 文件后**不会自行退出**，
 * --dump-dom 输出完毕后同样会挂着；直接等 'close' 事件会把生成流程永久卡死。
 * 因此这里统一用「轮询产物 → 稳定即杀」的策略：detached 起进程，完成后 kill 整个进程组。 */
function killTree(p) {
  try {
    process.kill(-p.pid, 'SIGKILL'); // detached ⇒ p.pid 即进程组 id，连 Chrome Helper 一起收
  } catch {
    try {
      p.kill('SIGKILL');
    } catch {}
  }
}

function runChrome(args, { idleMs = 900, timeoutMs = 90000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(CHROME, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let done = false;
    let lastLen = 0;
    let idle = 0;
    const finish = (code) => {
      if (done) return;
      done = true;
      clearInterval(tick);
      clearTimeout(hard);
      killTree(p);
      resolve({ code, out, err });
    };
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', () => finish(-1));
    const tick = setInterval(() => {
      if (out.length === lastLen) idle += 300;
      else idle = 0;
      lastLen = out.length;
      if (out.length > 0 && idle >= idleMs) finish(0);
    }, 300);
    const hard = setTimeout(() => finish(124), timeoutMs);
  });
}

const chromeBaseArgs = (profileDir) => [
  '--headless=old',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-crash-reporter',
  '--user-data-dir=' + profileDir,
  '--window-size=' + W + ',' + H,
];

/** 截图：Chrome 写出 png 后不会退出，所以「文件大小连续两次相同」即视为写完，随即杀进程。 */
function shootChrome(args, out, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const p = spawn(CHROME, args, { detached: true, stdio: 'ignore' });
    let done = false;
    let last = -1;
    let stable = 0;
    const read = () => {
      try {
        return fs.statSync(out).size;
      } catch {
        return 0;
      }
    };
    const finish = (code) => {
      if (done) return;
      done = true;
      clearInterval(tick);
      clearTimeout(hard);
      killTree(p);
      const size = read();
      resolve({ code, ok: size > 1024, size });
    };
    const tick = setInterval(() => {
      const size = read();
      if (size > 1024 && size === last) {
        if (++stable >= 2) finish(0);
      } else {
        stable = 0;
      }
      last = size;
    }, 200);
    const hard = setTimeout(() => finish(124), timeoutMs);
    p.on('error', () => finish(-1));
  });
}

async function shot(card, profileDir, attempt = 1) {
  if (fs.existsSync(card.out)) fs.rmSync(card.out);
  const res = await shootChrome(
    [...chromeBaseArgs(profileDir), '--screenshot=' + card.out, 'file://' + card.html],
    card.out,
  );
  if (res.ok) return { ok: true, attempt };
  if (attempt < 2) return shot(card, profileDir, attempt + 1);
  return { ok: false, attempt, code: res.code, err: `截图未生成（exit ${res.code}）` };
}

async function dumpDom(card, profileDir) {
  const res = await runChrome([...chromeBaseArgs(profileDir), '--dump-dom', 'file://' + card.html]);
  return res.out || '';
}

// ---------------------------------------------------------------------------
// 子命令：report / verify
// ---------------------------------------------------------------------------
function parseBodyAttrs(dom) {
  const m = dom.match(/<body([^>]*)>/i);
  if (!m) return null;
  const attrs = {};
  for (const kv of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[kv[1]] = kv[2];
  return attrs;
}

function pngSize(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(24);
    fs.readSync(fd, buf, 0, 24, 0);
    if (buf.readUInt32BE(0) !== 0x89504e47) return null;
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

async function cmdReport(cards) {
  console.log('[report] 回读每张卡的自动排版结果（标题字号/行数/截断）…');
  const rows = [];
  const queue = cards.slice();
  const workers = Array.from({ length: CONCURRENCY }, async (_, wi) => {
    const profileDir = path.join(PROFILE_ROOT, `report-${process.pid}-${wi}`);
    fs.mkdirSync(profileDir, { recursive: true });
    while (queue.length) {
      const card = queue.shift();
      if (!fs.existsSync(card.html)) {
        rows.push({ slug: card.kind + '/' + card.slug, err: 'HTML 缺失（先跑一次生成）' });
        continue;
      }
      const dom = await dumpDom(card, profileDir);
      const a = parseBodyAttrs(dom);
      rows.push(
        a
          ? {
              slug: card.kind + '/' + card.slug,
              tSize: +a['data-title-size'],
              tLines: +a['data-title-lines'],
              tTrunc: +a['data-title-trunc'],
              sSize: +a['data-tag-size'],
              sLines: +a['data-tag-lines'],
              sTrunc: +a['data-tag-trunc'],
            }
          : { slug: card.kind + '/' + card.slug, err: '未读到排版属性' },
      );
    }
  });
  await Promise.all(workers);

  const bySlug = (a, b) => a.slug.localeCompare(b.slug);
  const order = { tool: 0, category: 1, site: 2 };
  rows.sort((a, b) => (order[a.slug.split('/')[0]] - order[b.slug.split('/')[0]]) || bySlug(a, b));

  console.log('kind/slug'.padEnd(34) + 'title(px×行)  副标题(px×行)  截断');
  for (const r of rows) {
    if (r.err) {
      console.log(r.slug.padEnd(34) + r.err);
      continue;
    }
    console.log(
      r.slug.padEnd(34) +
        `${String(r.tSize).padStart(3)}×${r.tLines}`.padEnd(15) +
        `${String(r.sSize).padStart(3)}×${r.sLines}`.padEnd(15) +
        (r.tTrunc || r.sTrunc ? `标题${r.tTrunc} 副标题${r.sTrunc}` : '-'),
    );
  }
  const shrunk = rows.filter((r) => !r.err && (r.tSize < 96 || r.tTrunc));
  console.log('\n[report] 标题未用满 96px 或发生截断的卡片：' + shrunk.length + ' 张');
  for (const r of shrunk) console.log(`  - ${r.slug}: ${r.tSize}px / ${r.tLines} 行 / 截断=${r.tTrunc}`);
  const trunc = rows.filter((r) => !r.err && (r.tTrunc || r.sTrunc));
  console.log('[report] 发生省略号截断的卡片：' + (trunc.length ? trunc.map((r) => r.slug).join(', ') : '无'));
  return rows;
}

function cmdVerify(cards) {
  const missing = [];
  const wrongSize = [];
  const tooBig = [];
  let total = 0;
  let biggest = { file: '', size: 0 };
  for (const c of cards) {
    if (!fs.existsSync(c.out)) {
      missing.push(path.relative(ROOT, c.out));
      continue;
    }
    const st = fs.statSync(c.out);
    total += st.size;
    if (st.size > biggest.size) biggest = { file: path.relative(ROOT, c.out), size: st.size };
    if (st.size > 250 * 1024) tooBig.push(`${path.relative(ROOT, c.out)} (${(st.size / 1024).toFixed(1)}KB)`);
    const dim = pngSize(c.out);
    if (!dim || dim.width !== W || dim.height !== H)
      wrongSize.push(`${path.relative(ROOT, c.out)} → ${dim ? dim.width + '×' + dim.height : '非 PNG'}`);
  }
  console.log('[verify] 期望卡片数：' + cards.length);
  console.log('[verify] 实际存在：' + (cards.length - missing.length));
  console.log('[verify] 缺失清单：' + (missing.length ? '\n  ' + missing.join('\n  ') : '（空）'));
  console.log('[verify] 尺寸不符清单：' + (wrongSize.length ? '\n  ' + wrongSize.join('\n  ') : '（空）'));
  console.log('[verify] 超过 250KB 清单：' + (tooBig.length ? '\n  ' + tooBig.join('\n  ') : '（空）'));
  console.log(`[verify] 总体积：${(total / 1024 / 1024).toFixed(2)} MB（${total} bytes）`);
  console.log(
    `[verify] 单张最大：${biggest.file} ${(biggest.size / 1024).toFixed(1)}KB` +
      `；单张平均：${(total / Math.max(1, cards.length) / 1024).toFixed(1)}KB`,
  );
  return { missing, wrongSize, tooBig, total, biggest };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error(`[fatal] 找不到 Chrome：${CHROME}\n        可用 CHROME_PATH 环境变量指定。`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  let cards = buildCards(data);

  if (!fs.existsSync(HTML_DIR)) fs.mkdirSync(HTML_DIR, { recursive: true });
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });

  if (MODE_REPORT) {
    await cmdReport(cards);
    return;
  }
  if (MODE_VERIFY) {
    const r = cmdVerify(cards);
    process.exitCode = r.missing.length || r.wrongSize.length || r.tooBig.length ? 1 : 0;
    return;
  }

  if (ONLY) {
    const hit = cards.filter((c) => c.slug === ONLY);
    if (!hit.length) {
      console.error(
        `[fatal] --only=${ONLY} 未匹配到任何卡片。可选 slug：\n  tool:     ${data.tools.map((t) => t.slug).join(', ')}\n  category: ${data.categories.map((c) => c.slug).join(', ')}\n  site:     home, about, submit`,
      );
      process.exit(1);
    }
    cards = hit;
  }

  console.log(`[gen] 卡片 ${cards.length} 张 → ${path.relative(ROOT, OUT_ROOT)}/`);
  console.log(`[gen] HTML 中间产物 → ${HTML_DIR}/  ；并发 ${CONCURRENCY}；Chrome ${CHROME}`);
  const t0 = Date.now();

  // 1) 写 HTML
  const htmlT0 = Date.now();
  for (const c of cards) {
    fs.mkdirSync(path.dirname(c.out), { recursive: true });
    fs.writeFileSync(c.html, renderHtml(c), 'utf8');
  }
  console.log(`[gen] HTML 写出完成（${cards.length} 个，${Date.now() - htmlT0}ms）`);

  // 2) 并发截图，每张卡独立 profile
  let done = 0;
  const failures = [];
  const queue = cards.map((c, i) => ({ card: c, i }));
  const sizes = [];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async (_, wi) => {
    while (queue.length) {
      const job = queue.shift();
      // 每张卡一个独立 profile 目录；用完即清，避免 /tmp 堆积
      const profileDir = path.join(PROFILE_ROOT, `${process.pid}-${job.i}`);
      fs.mkdirSync(profileDir, { recursive: true });
      const t = Date.now();
      const r = await shot(job.card, profileDir);
      done++;
      if (r.ok) {
        const size = fs.statSync(job.card.out).size;
        sizes.push(size);
        console.log(
          `[${String(done).padStart(2)}/${cards.length}] ${fmtTime()} ✓ ${job.card.kind}/${job.card.slug} ` +
            `${(size / 1024).toFixed(1)}KB ${Date.now() - t}ms${r.attempt > 1 ? '（重试后成功）' : ''}`,
        );
      } else {
        failures.push(job.card);
        console.error(
          `[${String(done).padStart(2)}/${cards.length}] ${fmtTime()} ✗ ${job.card.kind}/${job.card.slug} code=${r.code} ${r.err || ''}`,
        );
      }
      if (!KEEP_PROFILES) {
        try {
          fs.rmSync(profileDir, { recursive: true, force: true });
        } catch {}
      }
    }
  });
  await Promise.all(workers);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(
    `\n[gen] 完成：成功 ${sizes.length} / ${cards.length}，失败 ${failures.length}，用时 ${secs}s` +
      `，总体积 ${(total / 1024 / 1024).toFixed(2)}MB，单张最大 ${(Math.max(0, ...sizes) / 1024).toFixed(1)}KB`,
  );
  if (failures.length) {
    console.error('[gen] 失败清单：' + failures.map((c) => `${c.kind}/${c.slug}`).join(', '));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
