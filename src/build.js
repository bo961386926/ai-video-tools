#!/usr/bin/env node
/**
 * AI 视频工具导航 — 零依赖静态站点构建脚本
 * 用法：node src/build.js
 * 职责：读取并校验 data/tools.json → 渲染全部页面 → 生成 sitemap/robots → 复制静态资源 → 内部死链检测
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SRC_DIR, '..');
const DIST = join(ROOT, 'dist');

/* ---------------- 工具函数 ---------------- */

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/* ---------------- 数据加载与校验 ---------------- */

function validate(data) {
  const errors = [];
  const warnings = [];
  if (!data || typeof data !== 'object') {
    return { errors: ['data/tools.json 根节点必须是 JSON 对象'], warnings };
  }
  const { site, categories = [], tools = [] } = data;

  if (!site || typeof site !== 'object') errors.push('site 缺失');
  else {
    if (!site.name) errors.push('site.name 缺失');
    if (!site.domain) errors.push('site.domain 缺失（canonical / sitemap / og:image 均需要）');
    else if (!/^https?:\/\//.test(site.domain)) errors.push('site.domain 必须以 http(s):// 开头');
    else if (/example\.(com|org|cn)/.test(site.domain)) warnings.push('site.domain 仍是示例值，部署前请替换为真实域名');
    if (!site.description) warnings.push('site.description 缺失，首页 meta description 将为空');
  }

  if (!Array.isArray(categories) || categories.length === 0) errors.push('categories 不能为空');
  const catSlugs = new Set();
  (Array.isArray(categories) ? categories : []).forEach((c, i) => {
    const p = `categories[${i}]`;
    if (!c.slug || !/^[a-z0-9-]+$/.test(c.slug)) errors.push(`${p}.slug 缺失或格式非法（仅允许小写字母/数字/连字符）`);
    else if (catSlugs.has(c.slug)) errors.push(`${p}.slug 重复：${c.slug}`);
    catSlugs.add(c.slug);
    if (!c.name) errors.push(`${p}.name 缺失`);
    if (c.description && [...c.description].length > 120) warnings.push(`${p}.description 过长，建议 ≤120 字`);
  });

  const pricingEnum = new Set(['free', 'freemium', 'paid', 'trial']);
  const toolSlugs = new Set();
  (Array.isArray(tools) ? tools : []).forEach((t, i) => {
    const p = `tools[${i}]`;
    if (!t.slug || !/^[a-z0-9-]+$/.test(t.slug)) errors.push(`${p}.slug 缺失或格式非法`);
    else if (toolSlugs.has(t.slug)) errors.push(`${p}.slug 重复：${t.slug}`);
    toolSlugs.add(t.slug);
    if (!t.name) errors.push(`${p}.name 缺失`);
    if (!t.category || !catSlugs.has(t.category)) errors.push(`${p}.category 不存在于 categories：${t.category}`);
    if (!t.tagline) errors.push(`${p}.tagline 缺失`);
    else if ([...t.tagline].length > 40) warnings.push(`${p}(${t.slug}).tagline 过长（${[...t.tagline].length} 字，建议 ≤40）`);
    if (!t.website || !/^https?:\/\/\S+$/.test(t.website)) errors.push(`${p}.website 缺失或不是合法的 http(s) 链接`);
    if (!pricingEnum.has(t.pricing)) errors.push(`${p}.pricing 非法（需 free/freemium/paid/trial）：${t.pricing}`);
    for (const d of ['addedAt', 'updatedAt']) {
      if (t[d] && !/^\d{4}-\d{2}-\d{2}$/.test(t[d])) errors.push(`${p}.${d} 日期格式应为 YYYY-MM-DD：${t[d]}`);
    }
    if (t.logo && /^https?:\/\//.test(t.logo) === false) {
      const localPath = join(ROOT, 'src', t.logo.replace(/^\/+/, ''));
      if (!existsSync(localPath)) warnings.push(`${p}(${t.slug}).logo 本地文件不存在，将回退为首字母头像`);
    }
    if (t.access && !['direct', 'proxy', 'unknown'].includes(t.access)) {
      errors.push(`${p}.access 非法（需 direct/proxy/unknown）：${t.access}`);
    }
  });

  return { errors, warnings };
}

function loadData() {
  const raw = readFileSync(join(ROOT, 'data/tools.json'), 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ data/tools.json 不是合法的 JSON：${e.message}`);
    process.exit(1);
  }
  const { errors, warnings } = validate(data);
  warnings.forEach((w) => console.warn(`⚠ ${w}`));
  if (errors.length) {
    console.error(`✗ 数据校验失败（${errors.length} 个错误）：`);
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  data.categories.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return data;
}

/* ---------------- 模板 ---------------- */

import { esc } from './templates/common.js';
import { renderLayout } from './templates/layout.js';
import { renderHome } from './templates/home.js';
import { renderCategory } from './templates/category.js';
import { renderTool } from './templates/tool.js';
import { renderStaticPage } from './templates/static-page.js';
import { renderNotFound } from './templates/not-found.js';

/* ---------------- 页面组装 ---------------- */

function build() {
  const data = loadData();
  const { site, categories, tools } = data;
  const byCat = new Map(categories.map((c) => [c.slug, []]));
  tools.forEach((t) => byCat.get(t.category)?.push(t));
  const sortedTools = [...tools].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  /** @type {{file:string, depth:number, html:string}[]} */
  const pages = [];

  // 首页
  pages.push({
    file: 'index.html',
    depth: 0,
    html: renderLayout({
      site,
      title: `${site.name} - AI 视频创作工具导航｜文生视频 · AI剪辑 · 数字人`,
      description: site.description,
      path: '/index.html',
      depth: 0,
      navKey: 'home',
      body: renderHome({ site, categories, tools: sortedTools, byCat }),
    }),
  });

  // 分类页
  for (const cat of categories) {
    const list = (byCat.get(cat.slug) || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    pages.push({
      file: `category/${cat.slug}.html`,
      depth: 1,
      html: renderLayout({
        site,
        title: `${cat.name}工具（${list.length} 款）- ${site.name}`,
        description: cat.description,
        path: `/category/${cat.slug}.html`,
        depth: 1,
        body: renderCategory({ site, categories, category: cat, list }),
      }),
    });
  }

  // 工具详情页
  for (const t of tools) {
    const cat = categories.find((c) => c.slug === t.category);
    const related = (byCat.get(t.category) || []).filter((x) => x.slug !== t.slug).slice(0, 6);
    pages.push({
      file: `tool/${t.slug}.html`,
      depth: 1,
      html: renderLayout({
        site,
        title: `${t.name} - ${t.tagline} - ${site.name}`,
        description: t.description ? t.description.slice(0, 120) : t.tagline,
        path: `/tool/${t.slug}.html`,
        depth: 1,
        body: renderTool({ site, tool: t, category: cat, related }),
      }),
    });
  }

  // 关于 / 提交工具 / 404
  const staticPages = [
    { file: 'about.html', title: `关于本站 - ${site.name}`, desc: '本站定位、收录标准、纠错与联系方式。' },
    { file: 'submit.html', title: `提交工具 - ${site.name}`, desc: '收录标准与工具提交流程说明。' },
  ];
  for (const sp of staticPages) {
    const fragment = readFileSync(join(SRC_DIR, 'pages', sp.file), 'utf8');
    pages.push({
      file: sp.file,
      depth: 0,
      html: renderLayout({
        site,
        title: sp.title,
        description: sp.desc,
        path: `/${sp.file}`,
        depth: 0,
        body: renderStaticPage({ fragment }),
      }),
    });
  }
  pages.push({
    file: '404.html',
    depth: 0,
    html: renderLayout({
      site,
      title: `页面不存在 - ${site.name}`,
      description: '您访问的页面不存在。',
      path: '/404.html',
      depth: 0,
      body: renderNotFound({ site }),
    }),
  });

  /* ---------- 输出 dist ---------- */
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  for (const p of pages) {
    const outPath = join(DIST, p.file);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, p.html, 'utf8');
  }

  /* ---------- 复制静态资源 ---------- */
  const assetsDir = join(SRC_DIR, 'assets');
  if (existsSync(assetsDir)) {
    for (const f of walk(assetsDir)) {
      const rel = relative(assetsDir, f);
      const dest = join(DIST, 'assets', rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(f, dest);
    }
  }

  /* ---------- sitemap.xml ---------- */
  const lastmodOf = (file) => {
    const m = file.match(/^tool\/(.+)\.html$/);
    if (m) {
      const t = tools.find((x) => x.slug === m[1]);
      return t?.updatedAt || null;
    }
    const cm = file.match(/^category\/(.+)\.html$/);
    if (cm) {
      const times = (byCat.get(cm[1]) || []).map((t) => t.updatedAt).filter(Boolean);
      return times.length ? times.sort().at(-1) : null;
    }
    if (file === 'index.html') {
      const times = tools.map((t) => t.updatedAt).filter(Boolean);
      return times.length ? times.sort().at(-1) : null;
    }
    return null;
  };
  const smUrls = pages
    .filter((p) => p.file !== '404.html')
    .map((p) => {
      const lm = lastmodOf(p.file);
      return `  <url>\n    <loc>${esc(site.domain.replace(/\/$/, ''))}/${p.file}</loc>${lm ? `\n    <lastmod>${lm}</lastmod>` : ''}\n  </url>`;
    })
    .join('\n');
  writeFileSync(
    join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${smUrls}\n</urlset>\n`,
    'utf8'
  );

  /* ---------- robots.txt ---------- */
  writeFileSync(
    join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${site.domain.replace(/\/$/, '')}/sitemap.xml\n`,
    'utf8'
  );

  /* ---------- 内部死链检测 ---------- */
  const pageFiles = new Set(pages.map((p) => p.file));
  const deadLinks = [];
  for (const f of walk(DIST)) {
    if (!f.endsWith('.html')) continue;
    const relFromDist = relative(DIST, f);
    const html = readFileSync(f, 'utf8');
    const re = /(?:href|src)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const url = m[1];
      if (!url || /^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(url)) continue;
      const clean = url.split('#')[0].split('?')[0];
      if (!clean) continue;
      const resolved = resolve(dirname(f), clean);
      const relTarget = relative(DIST, resolved);
      if (relTarget.startsWith('..')) continue; // 指向 dist 之外，跳过
      if (pageFiles.has(relTarget) || existsSync(resolved)) continue;
      deadLinks.push(`${relFromDist} -> ${url}`);
    }
  }
  if (deadLinks.length) {
    console.error(`✗ 内部死链检测失败（${deadLinks.length} 处）：`);
    [...new Set(deadLinks)].forEach((d) => console.error(`  - ${d}`));
    process.exit(1);
  }

  /* ---------- 摘要 ---------- */
  console.log('✓ 构建完成');
  console.log(`  页面总数：${pages.length}（首页 1 + 分类 ${categories.length} + 工具 ${tools.length} + 固定页 3）`);
  console.log(`  分类：${categories.map((c) => c.name).join(' / ')}`);
  console.log(`  输出目录：${DIST}`);
}

build();
