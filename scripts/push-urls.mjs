#!/usr/bin/env node
/**
 * 收录推送：把 dist/sitemap.xml 里的 URL 主动推给百度 + IndexNow（Bing / Yandex / Seznam）
 * ------------------------------------------------------------------
 * 为什么需要它：主动推送比等爬虫自己发现快几天到几周。本站实测 Baiduspider 十天只抓了
 * 首页 1/90 页，被动等待基本不可行；IndexNow 则是 Bing 侧（含 ChatGPT/Copilot 检索）的
 * 即时发现通道。
 *
 * 凭据（都不入库）：
 *   .workbuddy-ai/baidu.token      百度搜索资源平台 → 普通收录 → API 提交里的 token
 *   .workbuddy-ai/indexnow.key     IndexNow key，构建时已自动生成并输出 /<key>.txt
 *   也可用环境变量 BAIDU_TOKEN / INDEXNOW_KEY 覆盖
 *
 * 用法：
 *   node scripts/push-urls.mjs --dry-run      # 只打印将要推送的内容，不联网
 *   node scripts/push-urls.mjs                # 增量推送（只推新增或 lastmod 变化的 URL）
 *   node scripts/push-urls.mjs --all          # 忽略本地状态，全量重推
 *   node scripts/push-urls.mjs --limit=20     # 百度单次配额较小时限流
 * ------------------------------------------------------------------
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OPS = join(ROOT, '.workbuddy-ai');
const STATE = join(OPS, 'push-state.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback = '') => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DRY = flag('dry-run');
const ALL = flag('all');
const LIMIT = Number(opt('limit', '100')) || 100;

const die = (msg, hint) => {
  console.error(`✗ ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
};
const readOr = (file, fallback = '') => {
  try {
    return readFileSync(file, 'utf8').trim();
  } catch {
    return fallback;
  }
};

/* ---------------- 1. 从 sitemap 取 URL ---------------- */

const sitemapPath = join(ROOT, 'dist', 'sitemap.xml');
if (!existsSync(sitemapPath)) die('dist/sitemap.xml 不存在', '先运行 node src/build.js');

const sitemap = readFileSync(sitemapPath, 'utf8');
const entries = [...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g)].map((m) => ({
  url: m[1].replace(/&amp;/g, '&').trim(),
  lastmod: (m[2] || '').trim(),
}));
if (!entries.length) die('sitemap.xml 里没解析出 URL');

const origin = new URL(entries[0].url).origin;
const host = new URL(entries[0].url).host;

/* ---------------- 2. 增量过滤 ---------------- */

let state = {};
try {
  state = JSON.parse(readFileSync(STATE, 'utf8'));
} catch {
  /* 首次运行没有状态文件 */
}
const pushed = state.urls || {};
const todo = ALL ? entries : entries.filter((e) => pushed[e.url] !== e.lastmod);
const skipped = entries.length - todo.length;

console.log(`站点：${origin}`);
console.log(`sitemap：${entries.length} 条 URL，本次待推 ${todo.length} 条${skipped ? `（${skipped} 条未变化已跳过）` : ''}`);
if (!todo.length) {
  console.log('\n✓ 没有需要推送的新 URL。想强制全量重推：加 --all');
  process.exit(0);
}

/* ---------------- 3. 百度主动推送 ---------------- */

const baiduToken = process.env.BAIDU_TOKEN || readOr(join(OPS, 'baidu.token'));
const baiduList = todo.slice(0, LIMIT).map((e) => e.url);

async function pushBaidu() {
  if (!baiduToken) {
    console.log(`\n【百度】跳过：缺少 token`);
    console.log('  获取：搜索资源平台 → 普通收录 → API 提交 → 复制 token 存到 .workbuddy-ai/baidu.token');
    return;
  }
  if (DRY) {
    console.log(`\n【百度】将推送 ${baiduList.length} 条（dry-run 未联网），示例：${baiduList[0]}`);
    return;
  }
  const endpoint = `http://data.zz.baidu.com/urls?site=${encodeURIComponent(origin)}&token=${encodeURIComponent(baiduToken)}`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: baiduList.join('\n'),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let j = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* 非 JSON 响应，下面统一打印原文 */
    }
    if (j.success !== undefined) {
      console.log(`\n【百度】成功 ${j.success} 条，今日剩余配额 ${j.remain ?? '未知'}`);
      if (j.not_same_site) console.log(`  站点校验失败 ${j.not_same_site} 条（token 与站点是否匹配？）`);
      if (j.not_valid) console.log(`  不合规 ${j.not_valid} 条`);
      todo.slice(0, LIMIT).forEach((e) => (pushed[e.url] = e.lastmod));
    } else {
      console.log(`\n【百度】返回 HTTP ${res.status}：${text.slice(0, 300)}`);
      console.log('  常见原因：配额用尽（over quota）/ token 错误 / 站点未验证');
    }
  } catch (e) {
    console.log(`\n【百度】请求失败：${String(e.message || e)}`);
  }
}

/* ---------------- 4. IndexNow（Bing / Yandex / Seznam） ---------------- */

const indexnowKey = process.env.INDEXNOW_KEY || readOr(join(OPS, 'indexnow.key'));
const keyFile = indexnowKey ? join(ROOT, 'dist', `${indexnowKey}.txt`) : '';

async function pushIndexNow() {
  if (!indexnowKey) {
    console.log('\n【IndexNow】跳过：缺少 key（构建时会自动生成 .workbuddy-ai/indexnow.key）');
    return;
  }
  if (!existsSync(keyFile)) {
    console.log(`\n【IndexNow】跳过：dist/${indexnowKey}.txt 不存在`);
    console.log('  重新构建后部署，确保该 key 文件已上线（IndexNow 要求站根可访问）。');
    return;
  }
  const payload = {
    host,
    key: indexnowKey,
    keyLocation: `${origin}/${indexnowKey}.txt`,
    urlList: entries.map((e) => e.url),
  };
  if (DRY) {
    console.log(`\n【IndexNow】将推送 ${payload.urlList.length} 条，keyLocation=${payload.keyLocation}（dry-run 未联网）`);
    return;
  }
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 200 || res.status === 202) {
      console.log(`\n【IndexNow】已接受 ${payload.urlList.length} 条（HTTP ${res.status}）`);
      todo.forEach((e) => (pushed[e.url] = e.lastmod));
    } else {
      const body = await res.text();
      console.log(`\n【IndexNow】HTTP ${res.status}：${body.slice(0, 200)}`);
      console.log('  403 = key 文件未部署或内容不匹配；422 = URL 与 host 不匹配');
    }
  } catch (e) {
    console.log(`\n【IndexNow】请求失败：${String(e.message || e)}`);
  }
}

await pushBaidu();
await pushIndexNow();

/* ---------------- 5. 记录状态 ---------------- */

if (!DRY) {
  mkdirSync(OPS, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ pushedAt: new Date().toISOString(), urls: pushed }, null, 2) + '\n', 'utf8');
  console.log(`\n状态已记录：${STATE}`);
} else {
  console.log('\n（dry-run，未写入状态文件）');
}
console.log('Google 没有推送接口：在 Search Console 里提交 sitemap.xml，它会自己按 lastmod 重抓。');
