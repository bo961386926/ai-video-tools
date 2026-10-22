#!/usr/bin/env node
/**
 * AI 视频工具导航 — 零依赖静态站点构建脚本
 * 用法：node src/build.js
 * 职责：读取并校验 data/tools.json → 渲染全部页面 → 生成 sitemap/robots → 复制静态资源 → 内部死链检测
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

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
    for (const k of ['repo', 'submitForm']) {
      if (site[k] && !/^https?:\/\//.test(site[k])) errors.push(`site.${k} 必须以 http(s):// 开头：${site[k]}`);
    }
    if (!site.submitForm) warnings.push('site.submitForm 缺失，「提交工具」页将没有在线表单入口');
    // 页脚备案号：工信部要求展示，同时也是搜索引擎的信任信号
    if (!site.icp) warnings.push('site.icp 缺失，页脚不会渲染备案号（已备案的话建议补上）');
    else if (typeof site.icp !== 'string') errors.push('site.icp 需为字符串（如「浙ICP备12345678号-1」）');
  }

  if (!Array.isArray(categories) || categories.length === 0) errors.push('categories 不能为空');
  const catSlugs = new Set();
  (Array.isArray(categories) ? categories : []).forEach((c, i) => {
    const p = `categories[${i}]`;
    if (!c.slug || !/^[a-z0-9-]+$/.test(c.slug)) errors.push(`${p}.slug 缺失或格式非法（仅允许小写字母/数字/连字符）`);
    else if (catSlugs.has(c.slug)) errors.push(`${p}.slug 重复：${c.slug}`);
    catSlugs.add(c.slug);
    if (!c.name) errors.push(`${p}.name 缺失`);
    if (c.color && !/^#[0-9a-fA-F]{6}$/.test(c.color)) errors.push(`${p}.color 需为 #RRGGBB 十六进制色值：${c.color}`);
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
    // 判断层字段：这三个是差异化内容（长尾词 + 可被 AI 引用的结论句）的载体，格式必须收紧
    if (t.freeQuota !== undefined) {
      if (typeof t.freeQuota !== 'string' || !t.freeQuota.trim()) errors.push(`${p}(${t.slug}).freeQuota 需为非空字符串`);
      else if ([...t.freeQuota].length > 60) warnings.push(`${p}(${t.slug}).freeQuota 过长（${[...t.freeQuota].length} 字，建议 ≤60）`);
    }
    if (t.cons !== undefined) {
      if (typeof t.cons !== 'string' || !t.cons.trim()) errors.push(`${p}(${t.slug}).cons 需为非空字符串`);
      else if ([...t.cons].length > 80) warnings.push(`${p}(${t.slug}).cons 过长（${[...t.cons].length} 字，建议 ≤80）`);
    }
    if (t.verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(t.verifiedAt)) {
      errors.push(`${p}(${t.slug}).verifiedAt 日期格式应为 YYYY-MM-DD：${t.verifiedAt}`);
    }
    if (t.rating !== undefined && t.rating !== null && (typeof t.rating !== 'number' || t.rating < 0 || t.rating > 5)) {
      errors.push(`${p}(${t.slug}).rating 需为 0-5 之间的数字：${t.rating}`);
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

  /** 分享卡路径（站点根相对）——由 tools/gen-og-cards.mjs 生成，构建时校验存在性 */
  const ogFor = (rel) => `/assets/og/${rel}.png`;

  // 首页
  pages.push({
    file: 'index.html',
    depth: 0,
    og: ogFor('home'),
    html: renderLayout({
      site,
      title: `${site.name} - AI 视频创作工具导航｜文生视频 · AI剪辑 · 数字人`,
      description: site.description,
      path: '/index.html',
      depth: 0,
      navKey: 'home',
      ogImage: ogFor('home'),
      body: renderHome({ site, categories, tools: sortedTools, byCat }),
    }),
  });

  // 分类页
  for (const cat of categories) {
    const list = (byCat.get(cat.slug) || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    pages.push({
      file: `category/${cat.slug}.html`,
      depth: 1,
      og: ogFor(`category/${cat.slug}`),
      html: renderLayout({
        site,
        title: `${cat.name}工具（${list.length} 款）- ${site.name}`,
        description: cat.description,
        path: `/category/${cat.slug}.html`,
        depth: 1,
        ogImage: ogFor(`category/${cat.slug}`),
        body: renderCategory({ site, categories, category: cat, list, byCat }),
      }),
    });
  }

  // 工具详情页
  /** 详情页 meta description：tagline + 免费额度 + 国内可用性，比单段简介更容易在搜索结果里被点开 */
  const toolMetaDesc = (t) =>
    [
      t.tagline,
      t.freeQuota ? `免费额度：${t.freeQuota}` : '',
      t.access === 'direct' ? '国内可直接访问' : t.access === 'proxy' ? '需特殊网络环境' : '',
    ]
      .filter(Boolean)
      .join('。')
      .slice(0, 120);
  for (const t of tools) {
    const cat = categories.find((c) => c.slug === t.category);
    const related = (byCat.get(t.category) || []).filter((x) => x.slug !== t.slug).slice(0, 6);
    pages.push({
      file: `tool/${t.slug}.html`,
      depth: 1,
      og: ogFor(`tool/${t.slug}`),
      html: renderLayout({
        site,
        title: `${t.name} - ${t.tagline} - ${site.name}`,
        description: toolMetaDesc(t),
        path: `/tool/${t.slug}.html`,
        depth: 1,
        ogImage: ogFor(`tool/${t.slug}`),
        body: renderTool({ site, tool: t, category: cat, related }),
      }),
    });
  }

  // 关于 / 提交工具 / 404
  const staticPages = [
    { file: 'about.html', title: `关于本站 - ${site.name}`, desc: '本站定位、收录标准、纠错与联系方式。' },
    { file: 'submit.html', title: `提交工具 - ${site.name}`, desc: '收录标准与工具提交流程说明。' },
  ];
  // 固定页片段支持占位符注入，避免把外部链接硬编码进 HTML：
  //   {{submitForm}} 在线收集表填写地址 / {{repo}} 代码仓库 / {{issueNew}} 新建 Issue 地址
  const pageVars = {
    submitForm: site.submitForm || '',
    repo: site.repo || '',
    issueNew: site.repo ? `${site.repo.replace(/\/$/, '')}/issues/new?template=tool-submission.md` : '',
  };
  for (const sp of staticPages) {
    let fragment = readFileSync(join(SRC_DIR, 'pages', sp.file), 'utf8');
    for (const [k, v] of Object.entries(pageVars)) {
      fragment = fragment.replaceAll(`{{${k}}}`, esc(v));
    }
    pages.push({
      file: sp.file,
      depth: 0,
      og: ogFor(sp.file.replace(/\.html$/, '')),
      html: renderLayout({
        site,
        title: sp.title,
        description: sp.desc,
        path: `/${sp.file}`,
        depth: 0,
        ogImage: ogFor(sp.file.replace(/\.html$/, '')),
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

  /* ---------- 输出 dist ----------
   * 注意：不再整目录 rmSync（会触发批量删除保护，且收录工作台子进程无法交互确认），
   * 改为覆盖写入全部页面 + 逐个清理孤儿页面（如工具删除后残留的 tool/{slug}.html）。 */
  mkdirSync(DIST, { recursive: true });
  for (const p of pages) {
    const outPath = join(DIST, p.file);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, p.html, 'utf8');
  }

  // 逐个删除本次不再生成的页面（数量通常很小，避免批量删除）
  const expectedPages = new Set(pages.map((p) => p.file));
  const staleHtml = walk(DIST).filter((f) => f.endsWith('.html')).filter((f) => !expectedPages.has(relative(DIST, f)));
  for (const f of staleHtml) unlinkSync(f);

  /* ---------- 复制静态资源 ----------
   * 用 read+write 代替 copyFileSync：部分运行环境对「copyFileSync 覆盖已存在文件」
   * 有交互确认策略，子进程（收录工作台）无法响应；writeFileSync 覆盖则畅通。 */
  const assetsDir = join(SRC_DIR, 'assets');
  if (existsSync(assetsDir)) {
    for (const f of walk(assetsDir)) {
      const rel = relative(assetsDir, f);
      const dest = join(DIST, 'assets', rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(f));
    }
    // 清理 dist/assets 中源目录已不存在的残留（如工具删除后遗留的 {slug}.png），
    // 保证 dist 始终是 src/assets 的忠实镜像，避免旧图标被一起发布上线。
    const distAssetsDir = join(DIST, 'assets');
    if (existsSync(distAssetsDir)) {
      for (const f of walk(distAssetsDir)) {
        const rel = relative(distAssetsDir, f);
        if (!existsSync(join(assetsDir, rel))) unlinkSync(f);
      }
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

  /* ---------- IndexNow key 验证文件 ----------
   * Bing / Yandex / Seznam 等要求站根存在 /<key>.txt，内容与该文件名一致，才接受即时推送。
   * key 存放在 .workbuddy-ai/（已 gitignore），首次构建自动生成并保持不变；
   * CI（无该目录）自动跳过，不影响构建。 */
  const keyDir = join(ROOT, '.workbuddy-ai');
  const keyFile = join(keyDir, 'indexnow.key');
  let indexnowKey = process.env.INDEXNOW_KEY || '';
  if (!indexnowKey && existsSync(keyFile)) indexnowKey = readFileSync(keyFile, 'utf8').trim();
  if (!indexnowKey && existsSync(keyDir)) {
    indexnowKey = randomBytes(16).toString('hex');
    writeFileSync(keyFile, `${indexnowKey}\n`, 'utf8');
    console.log(`  IndexNow key 已生成：${keyFile}`);
  }
  if (indexnowKey && !/^[a-f0-9]{16,128}$/i.test(indexnowKey)) {
    console.warn('⚠ INDEXNOW_KEY 格式非法（需 16-128 位十六进制），已跳过 key 文件输出');
    indexnowKey = '';
  }
  if (indexnowKey) writeFileSync(join(DIST, `${indexnowKey}.txt`), indexnowKey, 'utf8');

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

  /* ---------- 分享卡（og:image）存在性检测 ----------
   * 卡片由 tools/gen-og-cards.mjs 用本机 Chrome 预生成并入库；
   * 这里只做存在性校验：页面引用了不存在的卡片 = 分享出去是一张破图，属于发布级缺陷。 */
  const ogFiles = [...new Set(pages.map((p) => p.og).filter(Boolean))];
  const missingOg = ogFiles.filter((rel) => !existsSync(join(SRC_DIR, rel)));
  if (missingOg.length) {
    console.error(`✗ 分享卡缺失（${missingOg.length}/${ogFiles.length} 张）：`);
    missingOg.slice(0, 10).forEach((rel) => console.error(`  - ${rel}`));
    if (missingOg.length > 10) console.error(`  - …另有 ${missingOg.length - 10} 张未列出`);
    console.error('  修复：运行 node tools/gen-og-cards.mjs 重新生成分享卡后重试');
    process.exit(1);
  }

  /* ---------- 摘要 ---------- */
  console.log('✓ 构建完成');
  console.log(`  页面总数：${pages.length}（首页 1 + 分类 ${categories.length} + 工具 ${tools.length} + 固定页 3）`);
  console.log(`  分享卡：${ogFiles.length} 张 og:image 全部就位`);
  console.log(`  判断层字段：${tools.filter((t) => t.freeQuota && t.cons).length}/${tools.length} 个工具已有「免费额度 + 注意事项」`);
  console.log(`  IndexNow：${indexnowKey ? `key 文件已输出 /${indexnowKey.slice(0, 8)}….txt` : '未启用'}`);
  console.log(`  分类：${categories.map((c) => c.name).join(' / ')}`);
  console.log(`  输出目录：${DIST}`);
}

build();
