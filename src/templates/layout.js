/** 公共页面骨架：head / 头部导航 / 页脚 */
import { esc } from './common.js';

export function renderLayout({ site, title, description, path, depth, navKey, body }) {
  const prefix = depth === 0 ? '' : '../'.repeat(depth);
  const domain = (site.domain || '').replace(/\/$/, '');
  const canonical = domain ? `${domain}${path}` : path;
  const ogImage = domain ? `${domain}/assets/og-default.png` : `${prefix}assets/og-default.png`;

  const navItems = [
    { key: 'home', href: `${prefix}index.html`, label: '首页' },
    { key: 'about', href: `${prefix}about.html`, label: '关于' },
    { key: 'submit', href: `${prefix}submit.html`, label: '提交工具' },
  ];
  const nav = navItems
    .map((n) => `<a href="${n.href}"${navKey === n.key ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`)
    .join('');

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || '')}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || '')}">
<meta property="og:image" content="${esc(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="${prefix}assets/favicon.svg">
<link rel="stylesheet" href="${prefix}assets/css/style.css">
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${prefix}index.html">
      <span class="brand-mark" aria-hidden="true">▶</span>
      <span class="brand-name">${esc(site.name || 'AI 视频工具导航')}</span>
    </a>
    <button class="nav-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="打开菜单">
      <span></span><span></span><span></span>
    </button>
    <nav id="site-nav" class="site-nav" aria-label="主导航">${nav}</nav>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <span class="brand-mark" aria-hidden="true">▶</span>
      <span>${esc(site.name || 'AI 视频工具导航')}</span>
    </div>
    <nav class="footer-links" aria-label="页脚导航">
      <a href="${prefix}index.html">首页</a>
      <a href="${prefix}about.html">关于</a>
      <a href="${prefix}submit.html">提交工具</a>
      ${site.submitForm ? `<a href="${esc(site.submitForm)}" target="_blank" rel="noopener">在线提交表单</a>` : ''}
    </nav>
    <p class="footer-note">工具信息经人工整理，定价与功能以各官网为准；本站与所列工具无商业关联。© ${year}</p>
  </div>
</footer>
<script src="${prefix}assets/js/main.js" defer></script>
</body>
</html>`;
}
