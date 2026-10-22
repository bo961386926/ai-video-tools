/** 工具详情页模板 */
import { esc, toolLogo, pricingBadge, PRICING_LABEL, ACCESS_LABEL, externalLinkAttrs, toolCard } from './common.js';

/** JSON-LD 内联：转义 `<`，避免数据里出现 </script> 时截断脚本块 */
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

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

  /* ---------- 常见问题（可见内容与 FAQPage 结构化数据同源，避免被判不一致） ---------- */
  const pricingAnswer = () => {
    const base =
      {
        free: '完全免费',
        freemium: '提供免费额度，超出后需订阅付费版',
        paid: '没有长期免费版，需要付费使用',
        trial: '提供限时试用，试用结束后需付费',
      }[tool.pricing] || '定价模式以官网为准';
    return tool.freeQuota ? `${base}。免费额度：${tool.freeQuota}。` : `${base}，具体额度以官网为准。`;
  };
  const accessAnswer = () =>
    ({
      direct: '可以。国内网络可直接打开官网，不需要额外的网络工具。',
      proxy: '不能直接访问。官网在国内通常打不开或极慢，需要特殊网络环境。',
    })[tool.access] || '';
  const altNames = related.slice(0, 3).map((t) => t.name);
  const altAnswer = altNames.length
    ? `同类工具还有 ${altNames.join('、')}，可在页面下方「相关工具」直接对比。`
    : '同类工具正在收录中。';

  const faqs = [
    { q: `${tool.name} 免费吗？`, a: pricingAnswer() },
    ...(accessAnswer() ? [{ q: `${tool.name} 国内可以直接访问吗？`, a: accessAnswer() }] : []),
    ...(altNames.length ? [{ q: `${tool.name} 有哪些同类工具？`, a: altAnswer }] : []),
  ];
  const faqJsonLD = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const faqSec = `<section class="tool-faq" aria-labelledby="faq-title">
    <h2 id="faq-title">常见问题</h2>
    ${faqs
      .map(
        (f) => `<details>
      <summary>${esc(f.q)}</summary>
      <p>${esc(f.a)}</p>
    </details>`
      )
      .join('\n    ')}
  </section>`;

  const relatedSec = related.length
    ? `<section class="section" aria-labelledby="related-title">
        <div class="section-head"><h2 id="related-title">相关工具</h2></div>
        <div class="tool-grid">${related.map((t) => toolCard(t, 1)).join('')}</div>
      </section>`
    : '';

  return `<script type="application/ld+json">${ld(jsonLD)}</script>
<script type="application/ld+json">${ld(breadcrumbJsonLD)}</script>
<script type="application/ld+json">${ld(faqJsonLD)}</script>
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
        ${tool.freeQuota ? `<tr><th scope="row">免费额度</th><td>${esc(tool.freeQuota)}</td></tr>` : ''}
        ${tool.access ? `<tr><th scope="row">国内访问</th><td>${esc(ACCESS_LABEL[tool.access] || tool.access)}</td></tr>` : ''}
        ${tool.cons ? `<tr><th scope="row">注意事项</th><td>${esc(tool.cons)}</td></tr>` : ''}
        <tr><th scope="row">官方网站</th><td><a href="${esc(tool.website)}"${externalLinkAttrs}>${esc(tool.website)}</a></td></tr>
        ${tool.addedAt ? `<tr><th scope="row">收录时间</th><td>${esc(tool.addedAt)}</td></tr>` : ''}
        ${tool.verifiedAt ? `<tr><th scope="row">信息核验</th><td>${esc(tool.verifiedAt)}（额度与价格以官网为准）</td></tr>` : ''}
      </tbody>
    </table>
  </article>

  ${faqSec}

  ${relatedSec}
</div>`;
}
