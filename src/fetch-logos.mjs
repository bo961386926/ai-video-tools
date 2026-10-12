#!/usr/bin/env node
/**
 * 图标抓取脚本（构建期一次性运行）
 * 顺序：官网 HTML 解析 <link rel="icon"> → /favicon.ico → Google s2 服务
 * 产物：src/assets/logos/{slug}.{png|ico|svg}，并回写 data/tools.json 的 logo 字段
 * 幂等：已有本地图标或已有 logo 字段的工具会跳过
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGOS_DIR = join(ROOT, 'src/assets/logos');
const TOOLS_FILE = join(ROOT, 'data/tools.json');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

mkdirSync(LOGOS_DIR, { recursive: true });

async function get(url, accept) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: accept || '*/*' },
    });
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

/** 从首页 HTML 里挑最佳图标链接：apple-touch-icon > png/svg icon > shortcut icon */
function findIconInHtml(html, baseUrl) {
  const links = [...html.matchAll(/<link[^>]+>/gi)].map((m) => m[0]);
  const candidates = [];
  for (const tag of links) {
    const rel = (tag.match(/rel=["']([^"']*)["']/i) || [])[1] || '';
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href || !/icon/i.test(rel)) continue;
    candidates.push({ rel: rel.toLowerCase(), href });
  }
  const rank = (rel) =>
    rel.includes('apple-touch-icon') ? 0 : /\.(png|svg)/i.test(rel) ? 1 : rel.includes('shortcut') ? 2 : 3;
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

async function fetchLogo(tool) {
  let origin;
  try {
    origin = new URL(tool.website).origin;
  } catch {
    return null;
  }
  // 1) 解析官网 HTML
  try {
    const res = await get(origin + '/', 'text/html');
    if (res.ok) {
      const iconUrl = findIconInHtml(await res.text(), origin);
      if (iconUrl) {
        const r2 = await get(iconUrl);
        if (r2.ok) {
          const buf = Buffer.from(await r2.arrayBuffer());
          if (looksLikeImage(buf)) return { buf, ext: extFromType(r2.headers.get('content-type'), iconUrl) };
        }
      }
    }
  } catch { /* 落到下一级 */ }
  // 2) /favicon.ico
  try {
    const r = await get(origin + '/favicon.ico');
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (looksLikeImage(buf)) return { buf, ext: '.ico' };
    }
  } catch { /* 落到下一级 */ }
  // 3) Google s2 服务兜底
  try {
    const hostname = new URL(tool.website).hostname;
    const r = await get(`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`);
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (looksLikeImage(buf)) return { buf, ext: '.png' };
    }
  } catch { /* 放弃，用首字母头像 */ }
  return null;
}

const data = JSON.parse(readFileSync(TOOLS_FILE, 'utf8'));
const targets = data.tools.filter((t) => !t.logo || !String(t.logo).startsWith('assets/logos/'));
console.log(`需要抓取图标的工具：${targets.length} 个`);

let ok = 0;
let fail = 0;
const queue = [...targets];
async function worker() {
  while (queue.length) {
    const tool = queue.shift();
    const result = await fetchLogo(tool);
    if (result) {
      const file = `${tool.slug}${result.ext}`;
      writeFileSync(join(LOGOS_DIR, file), result.buf);
      tool.logo = `assets/logos/${file}`;
      ok++;
      process.stdout.write(`✓ ${tool.slug} (${result.ext}, ${(result.buf.length / 1024).toFixed(1)}KB)\n`);
    } else {
      fail++;
      process.stdout.write(`✗ ${tool.slug} 无可用图标，保留首字母头像\n`);
    }
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

writeFileSync(TOOLS_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log(`\n完成：成功 ${ok} 个，失败 ${fail} 个，已回写 data/tools.json`);
