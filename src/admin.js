#!/usr/bin/env node
/**
 * AI 视频工具导航 — 本地收录工作台（后端）
 * 用法：node src/admin.js  →  浏览器打开 http://127.0.0.1:8787
 *
 * 安全约束：仅绑定 127.0.0.1，禁止暴露到公网。
 * 功能：表单新增/编辑/删除工具 → 与 build.js 一致的校验 → upsert data/tools.json
 *       → 自动重建 dist → 可选 git add/commit/push；支持图标上传与自动抓取。
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SRC_DIR, '..');
const TOOLS_FILE = join(ROOT, 'data/tools.json');
const LOGOS_DIR = join(SRC_DIR, 'assets/logos');
const BUILD_SCRIPT = join(SRC_DIR, 'build.js');
const ADMIN_PAGE = join(SRC_DIR, 'admin.html');

const PORT = Number(process.env.ADMIN_PORT || 8787);
const TOKEN = process.env.ADMIN_TOKEN || randomBytes(16).toString('hex');
const MAX_BODY = 8 * 1024 * 1024; // 请求体上限 8MB（图标 base64）
const PRICING_ENUM = ['free', 'freemium', 'paid', 'trial'];

/* ---------------- 基础工具 ---------------- */

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 可选数值字段：空串/空值 → null；非有限数字 → null */
const numOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const run = (cmd, args) =>
  new Promise((res) => {
    execFile(cmd, args, { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      res({ ok: !err, code: err?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });

function readData() {
  return JSON.parse(readFileSync(TOOLS_FILE, 'utf8'));
}

function writeData(data) {
  writeFileSync(TOOLS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

const sendJson = (res, code, obj) => {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolveP, rejectP) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        rejectP(new Error('请求体过大（上限 8MB）'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolveP(Buffer.concat(chunks)));
    req.on('error', rejectP);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new Error('请求体不是合法的 JSON');
  }
}

/* ---------------- 校验（与 src/build.js 保持一致） ---------------- */

function validateTool(t, data, originalSlug) {
  const errors = [];
  const warnings = [];
  if (!t.slug || !/^[a-z0-9-]+$/.test(t.slug)) errors.push('slug 缺失或格式非法（仅小写字母/数字/连字符）');
  else if (data.tools.some((x) => x.slug === t.slug && x.slug !== originalSlug)) errors.push(`slug 已被占用：${t.slug}`);
  if (!t.name) errors.push('工具名称缺失');
  if (!data.categories.some((c) => c.slug === t.category)) errors.push(`分类不存在：${t.category || '(空)'}`);
  if (!t.tagline) errors.push('一句话简介缺失');
  else if ([...t.tagline].length > 40) warnings.push(`tagline 过长（${[...t.tagline].length} 字，建议 ≤40）`);
  if (!t.website || !/^https?:\/\/\S+$/.test(t.website)) errors.push('官网地址需为合法的 http(s) 链接');
  if (!PRICING_ENUM.includes(t.pricing)) errors.push(`pricing 非法（需 ${PRICING_ENUM.join('/')}）：${t.pricing}`);
  for (const d of ['addedAt', 'updatedAt']) {
    if (t[d] && !/^\d{4}-\d{2}-\d{2}$/.test(t[d])) errors.push(`${d} 日期格式应为 YYYY-MM-DD：${t[d]}`);
  }
  if (t.access && !['direct', 'proxy', 'unknown'].includes(t.access)) errors.push(`access 非法：${t.access}`);
  if (t.rating !== undefined && (typeof t.rating !== 'number' || t.rating < 0 || t.rating > 5)) errors.push(`评分需为 0-5 之间的数字：${t.rating}`);
  if (t.likes !== undefined && (!Number.isInteger(t.likes) || t.likes < 0)) errors.push(`点赞数需为非负整数：${t.likes}`);
  if (!t.description) warnings.push('description 为空，详情页将只展示 tagline');
  if (t.logo && /^https?:\/\//.test(t.logo) === false && !existsSync(join(SRC_DIR, t.logo))) {
    warnings.push('logo 指向的本地文件不存在，将回退为首字母头像');
  }
  return { errors, warnings };
}

/* ---------------- 图标抓取（复用 fetch-logos.mjs 的三级策略） ---------------- */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function httpGet(url, accept) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: accept || '*/*' } });
  } finally {
    clearTimeout(timer);
  }
}

function extFromType(ct, url) {
  ct = (ct || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('svg')) return '.svg';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  if (ct.includes('ico') || ct.includes('icon')) return '.ico';
  const m = String(url).match(/\.(png|svg|jpg|jpeg|webp|ico)(?:\?|$)/i);
  return m ? '.' + m[1].toLowerCase() : '.png';
}

function looksLikeImage(buf) {
  if (buf.length < 64) return false;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && buf[3] === 0x00) return true; // ICO
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return true; // WebP
  const head = buf.slice(0, 200).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<?xml') || head.includes('<svg')) return true; // SVG
  return false;
}

function findIconInHtml(html, baseUrl) {
  const links = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0]);
  const candidates = [];
  for (const tag of links) {
    const rel = (tag.match(/rel=["']([^"']*)["']/i) || [])[1] || '';
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href || !/icon/i.test(rel)) continue;
    candidates.push({ rel: rel.toLowerCase(), href });
  }
  const rank = (rel) => (rel.includes('apple-touch-icon') ? 0 : /\.(png|svg)/i.test(rel) ? 1 : rel.includes('shortcut') ? 2 : 3);
  candidates.sort((a, b) => rank(a.rel) - rank(b.rel));
  for (const c of candidates) {
    try {
      return new URL(c.href, baseUrl).toString();
    } catch {
      /* 忽略非法 URL */
    }
  }
  return null;
}

async function fetchLogoBuf(website) {
  let origin;
  try {
    origin = new URL(website).origin;
  } catch {
    return null;
  }
  // 1) 官网 HTML 解析 <link rel="icon">
  try {
    const res = await httpGet(origin + '/', 'text/html');
    if (res.ok) {
      const iconUrl = findIconInHtml(await res.text(), origin);
      if (iconUrl) {
        const r2 = await httpGet(iconUrl);
        if (r2.ok) {
          const buf = Buffer.from(await r2.arrayBuffer());
          if (looksLikeImage(buf)) return { buf, ext: extFromType(r2.headers.get('content-type'), iconUrl) };
        }
      }
    }
  } catch {
    /* 落到下一级 */
  }
  // 2) /favicon.ico
  try {
    const r = await httpGet(origin + '/favicon.ico');
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (looksLikeImage(buf)) return { buf, ext: '.ico' };
    }
  } catch {
    /* 落到下一级 */
  }
  // 3) Google s2 兜底
  try {
    const hostname = new URL(website).hostname;
    const r = await httpGet(`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (looksLikeImage(buf)) return { buf, ext: '.png' };
    }
  } catch {
    /* 放弃，用首字母头像 */
  }
  return null;
}

/* ---------------- 站点构建 / git 推送 ---------------- */

async function buildSite() {
  const r = await run(process.execPath, [BUILD_SCRIPT]);
  return { ok: r.ok, output: (r.stdout + r.stderr).trim() };
}

async function gitPush(message) {
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) return { ok: false, output: '当前目录不是 git 仓库，无法推送' };
  const remotes = await run('git', ['remote']);
  const remote = (remotes.stdout.trim().split('\n')[0] || '').trim();
  if (!remote) return { ok: false, output: '未配置 git remote，请先执行 git remote add origin <仓库地址>' };

  await run('git', ['add', '-A']);
  const c = await run('git', ['commit', '-m', message || `chore: 收录工作台更新 ${today()}`]);
  const combined = (c.stdout + c.stderr).trim();
  if (!c.ok && /nothing to commit|no changes added/i.test(combined)) {
    return { ok: true, output: '没有需要提交的变更（工作区干净）' };
  }
  if (!c.ok) return { ok: false, output: `git commit 失败：\n${combined}` };

  const p = await run('git', ['push']);
  if (p.ok) return { ok: true, output: `已提交并推送到 ${remote}：\n${combined}` };
  const p2 = await run('git', ['push', '-u', remote, 'HEAD']);
  const out2 = (p2.stdout + p2.stderr).trim();
  return { ok: p2.ok, output: p2.ok ? `已提交并推送（建立跟踪）：\n${combined}` : `git push 失败：\n${out2}` };
}

/* ---------------- 孤儿图标清理 ---------------- */

function removeOrphanLogo(logoPath, dataAfter) {
  if (!logoPath || !logoPath.startsWith('assets/logos/')) return;
  if (dataAfter.tools.some((t) => t.logo === logoPath)) return; // 仍被引用
  const abs = join(SRC_DIR, logoPath);
  if (existsSync(abs)) {
    try {
      unlinkSync(abs);
    } catch {
      /* 忽略删除失败，不影响主流程 */
    }
  }
}

/** 兜底清理：删除 logos 目录下属于该 slug 的所有残留文件（上传/抓取后未保存、删除工具时字段为空等场景） */
function removeSlugLogos(slug, dataAfter) {
  if (!slug || !existsSync(LOGOS_DIR)) return;
  let names = [];
  try {
    names = readdirSync(LOGOS_DIR);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(slug + '.')) continue;
    const rel = `assets/logos/${name}`;
    if (dataAfter.tools.some((t) => t.logo === rel)) continue; // 仍被引用
    try {
      unlinkSync(join(LOGOS_DIR, name));
    } catch {
      /* 忽略 */
    }
  }
}

/* ---------------- 路由处理 ---------------- */

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

function serveAsset(res, urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const abs = resolve(join(SRC_DIR, rel));
  if (!abs.startsWith(SRC_DIR) || !existsSync(abs)) {
    sendJson(res, 404, { ok: false, error: '资源不存在' });
    return;
  }
  try {
    let buf = readFileSync(abs);
    const ext = extname(abs).toLowerCase();
    // 文本类静态资源注入访问令牌（页面 JS 通过外部文件引入，需同样替换占位符）
    if (['.js', '.css', '.html'].includes(ext)) {
      buf = Buffer.from(buf.toString('utf8').replaceAll('__ADMIN_TOKEN__', TOKEN));
    }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  } catch (e) {
    sendJson(res, 500, { ok: false, error: `读取资源失败：${e.message}` });
  }
}

function serveAdminPage(res) {
  let html;
  try {
    html = readFileSync(ADMIN_PAGE, 'utf8');
  } catch {
    html = '<h1>admin.html 缺失</h1>';
  }
  html = html.replaceAll('__ADMIN_TOKEN__', TOKEN);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(html);
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/data') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: '仅支持 GET' });
      return;
    }
    try {
      const data = readData();
      sendJson(res, 200, { ok: true, site: data.site, categories: data.categories, tools: data.tools });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: `读取 data/tools.json 失败：${e.message}` });
    }
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: '仅支持 POST' });
    return;
  }
  const body = await readJson(req);
  const data = readData();

  if (pathname === '/api/save') {
    const incoming = body.tool || {};
    const slug = String(incoming.slug || '').trim();
    // originalSlug：编辑时由前端带上「被编辑条目的 slug」；新增时为空。
    // 不能仅凭 slug 是否已存在来判断新增/编辑——否则「新增」时填了一个已占用的 slug
    // 会被当成「更新」，静默覆盖掉原工具（数据安全事故）。
    const originalSlug = body.originalSlug ? String(body.originalSlug).trim() : null;
    if (!originalSlug && data.tools.some((t) => t.slug === slug)) {
      sendJson(res, 409, { ok: false, errors: [`slug 已被占用：${slug}（请换一个英文标识）`] });
      return;
    }
    const existing = originalSlug ? data.tools.find((t) => t.slug === originalSlug) : null;
    if (originalSlug && !existing) {
      sendJson(res, 404, { ok: false, errors: [`要编辑的工具不存在：${originalSlug}`] });
      return;
    }
    const tool = existing ? { ...existing } : {};
    Object.assign(tool, {
      slug,
      name: String(incoming.name || '').trim(),
      category: String(incoming.category || '').trim(),
      tagline: String(incoming.tagline || '').trim(),
      description: String(incoming.description || '').trim(),
      website: String(incoming.website || '').trim(),
      pricing: String(incoming.pricing || '').trim(),
      access: String(incoming.access || 'unknown').trim(),
      tags: Array.isArray(incoming.tags) ? incoming.tags.map((s) => String(s).trim()).filter(Boolean) : [],
      featured: Boolean(incoming.featured),
    });
    if (incoming.logo) tool.logo = String(incoming.logo).trim();
    else delete tool.logo;
    // 可选字段：留空即从数据中移除，保持 tools.json 干净
    const rating = numOrNull(incoming.rating);
    if (rating === null) delete tool.rating;
    else tool.rating = Math.round(rating * 10) / 10;
    const likes = numOrNull(incoming.likes);
    if (likes === null || likes <= 0) delete tool.likes;
    else tool.likes = Math.round(likes);
    if (!existing) tool.addedAt = today();
    tool.updatedAt = today();

    const { errors, warnings } = validateTool(tool, data, existing ? originalSlug : null);
    if (errors.length) {
      sendJson(res, 400, { ok: false, errors, warnings });
      return;
    }
    if (existing) {
      const idx = data.tools.findIndex((t) => t.slug === originalSlug);
      data.tools[idx] = tool;
    } else {
      data.tools.push(tool);
    }
    removeOrphanLogo(existing?.logo, data);
    removeSlugLogos(slug, data);
    writeData(data);

    const build = await buildSite();
    let push = null;
    if (body.push) {
      push = await gitPush(body.message || `chore: 收录工作台${existing ? '更新' : '新增'} ${tool.name}（${today()}）`);
    }
    sendJson(res, 200, { ok: true, action: existing ? 'updated' : 'created', tool, warnings, build, push });
    return;
  }

  if (pathname === '/api/delete') {
    const slug = String(body.slug || '').trim();
    const idx = data.tools.findIndex((t) => t.slug === slug);
    if (idx === -1) {
      sendJson(res, 404, { ok: false, error: `工具不存在：${slug}` });
      return;
    }
    const [removed] = data.tools.splice(idx, 1);
    removeOrphanLogo(removed.logo, data);
    removeSlugLogos(slug, data);
    writeData(data);
    const build = await buildSite();
    sendJson(res, 200, { ok: true, removed, build });
    return;
  }

  if (pathname === '/api/build') {
    const build = await buildSite();
    sendJson(res, 200, { ok: build.ok, build });
    return;
  }

  if (pathname === '/api/push') {
    const push = await gitPush(body.message);
    sendJson(res, 200, { ok: push.ok, push });
    return;
  }

  if (pathname === '/api/logo') {
    const slug = String(body.slug || '').trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      sendJson(res, 400, { ok: false, error: 'slug 格式非法' });
      return;
    }
    const dataUrl = String(body.data || '');
    const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
    if (!m) {
      sendJson(res, 400, { ok: false, error: '图标数据格式不正确（需图片 data URL）' });
      return;
    }
    const extMap = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/x-icon': '.ico',
      'image/vnd.microsoft.icon': '.ico',
    };
    const ext = extMap[m[1].toLowerCase()];
    if (!ext) {
      sendJson(res, 400, { ok: false, error: `不支持的图片类型：${m[1]}（支持 png/jpg/webp/svg/ico）` });
      return;
    }
    let buf;
    try {
      buf = Buffer.from(m[2], 'base64');
    } catch {
      sendJson(res, 400, { ok: false, error: 'base64 解码失败' });
      return;
    }
    if (buf.length > 2 * 1024 * 1024) {
      sendJson(res, 400, { ok: false, error: '图标文件过大（上限 2MB，建议 <200KB）' });
      return;
    }
    if (!looksLikeImage(buf)) {
      sendJson(res, 400, { ok: false, error: '文件内容不是有效图片' });
      return;
    }
    mkdirSync(LOGOS_DIR, { recursive: true });
    const logo = `assets/logos/${slug}${ext}`;
    writeFileSync(join(SRC_DIR, logo), buf);
    sendJson(res, 200, { ok: true, logo, size: buf.length });
    return;
  }

  if (pathname === '/api/fetch-logo') {
    const slug = String(body.slug || '').trim();
    const website = String(body.website || '').trim();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      sendJson(res, 400, { ok: false, error: 'slug 格式非法' });
      return;
    }
    if (!/^https?:\/\/\S+$/.test(website)) {
      sendJson(res, 400, { ok: false, error: '官网地址格式不正确' });
      return;
    }
    const result = await fetchLogoBuf(website);
    if (!result) {
      sendJson(res, 200, { ok: false, error: '未能抓取到图标，将保留首字母头像（可手动上传）' });
      return;
    }
    mkdirSync(LOGOS_DIR, { recursive: true });
    const logo = `assets/logos/${slug}${result.ext}`;
    writeFileSync(join(SRC_DIR, logo), result.buf);
    sendJson(res, 200, { ok: true, logo, size: result.buf.length });
    return;
  }

  sendJson(res, 404, { ok: false, error: '接口不存在' });
}

/* ---------------- 服务入口 ---------------- */

const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = u.pathname;

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      serveAdminPage(res);
      return;
    }
    if (req.method === 'GET' && pathname.startsWith('/assets/')) {
      serveAsset(res, pathname);
      return;
    }
    if (pathname.startsWith('/api/')) {
      const token = String(req.headers['x-admin-token'] || '');
      if (token !== TOKEN) {
        sendJson(res, 401, { ok: false, error: '令牌无效，请刷新页面后重试' });
        return;
      }
      await handleApi(req, res, pathname);
      return;
    }
    sendJson(res, 404, { ok: false, error: '路径不存在' });
  } catch (e) {
    sendJson(res, e.message.includes('JSON') ? 400 : 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('✓ 收录工作台已启动');
  console.log(`  地址：http://127.0.0.1:${PORT}  （仅限本机访问，切勿暴露到公网）`);
  console.log(`  令牌：${TOKEN}  （已自动内嵌页面，无需手动填写）`);
  console.log('  停止：Ctrl+C');
});
