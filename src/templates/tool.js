/** 工具详情页模板 */
import { esc, toolLogo, pricingBadge, PRICING_LABEL, ACCESS_LABEL, externalLinkAttrs, toolCard } from './common.js';

export function renderTool({ site, tool, category, related }) {
  const domain = (site.domain || '').replace(/\/$/, '');
  const descParas = (tool.description || '')
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim())}</p>`)
    .join('');

  const jsonLD = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: tool.name,
    url: tool.website,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    description: tool.description || tool.tagline,
    offers:
      tool.pricing === 'free' || tool.pricing === 'freemium' || tool.pricing === 'trial'
        ? { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
        : undefined,
  };
  const breadcrumbJsonLD = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: `${domain}/index.html` },
      ...(category
        ? [{ '@type': 'ListItem', position: 2, name: category.name, item: `${domain}/category/${category.slug}.html` }]
        : []),
      { '@type': 'ListItem', position: category ? 3 : 2, name: tool.name, item: `${domain}/tool/${tool.slug}.html` },
    ],
  };

  const relatedSec = related.length
    ? `<section class="section" aria-labelledby="related-title">
        <div class="section-head"><h2 id="related-title">相关工具</h2></div>
        <div class="tool-grid">${related.map((t) => toolCard(t, 1)).join('')}</div>
      </section>`
    : '';

  return `<script type="application/ld+json">${JSON.stringify(jsonLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLD)}</script>
<div class="container">
  <nav class="breadcrumb" aria-label="面包屑">
    <a href="../index.html">首页</a><span aria-hidden="true">/</span>
    ${category ? `<a href="../category/${category.slug}.html">${esc(category.name)}</a><span aria-hidden="true">/</span>` : ''}
    <span>${esc(tool.name)}</span>
  </nav>

  <article class="tool-detail">
    <header class="tool-detail-head">
      ${toolLogo(tool, 1)}
      <div>
        <h1>${esc(tool.name)}</h1>
        <p class="tool-detail-tagline">${esc(tool.tagline)}</p>
        <p class="tool-detail-badges">
          ${pricingBadge(tool.pricing)}
          ${tool.access ? `<span class="badge badge-access">${esc(ACCESS_LABEL[tool.access] || tool.access)}</span>` : ''}
          ${tool.updatedAt ? `<span class="tool-detail-updated">更新于 ${esc(tool.updatedAt)}</span>` : ''}
        </p>
      </div>
    </header>

    <p><a class="btn btn-visit" href="${esc(tool.website)}"${externalLinkAttrs}>访问官网 ↗</a></p>

    <div class="tool-detail-body">
      ${descParas || `<p>${esc(tool.tagline)}。</p>`}
    </div>

    ${(tool.tags || []).length ? `<p class="tool-detail-tags">标签：${tool.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</p>` : ''}

    <table class="tool-facts">
      <caption class="sr-only">${esc(tool.name)} 关键信息</caption>
      <tbody>
        <tr><th scope="row">所属分类</th><td>${category ? `<a href="../category/${category.slug}.html">${esc(category.name)}</a>` : '—'}</td></tr>
        <tr><th scope="row">定价模式</th><td>${esc(PRICING_LABEL[tool.pricing] || tool.pricing)}</td></tr>
        ${tool.access ? `<tr><th scope="row">国内访问</th><td>${esc(ACCESS_LABEL[tool.access] || tool.access)}</td></tr>` : ''}
        <tr><th scope="row">官方网站</th><td><a href="${esc(tool.website)}"${externalLinkAttrs}>${esc(tool.website)}</a></td></tr>
        ${tool.addedAt ? `<tr><th scope="row">收录时间</th><td>${esc(tool.addedAt)}</td></tr>` : ''}
      </tbody>
    </table>
  </article>

  ${relatedSec}
</div>`;
}
