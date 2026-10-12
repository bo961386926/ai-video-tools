/** 分类页模板 */
import { esc, toolCard } from './common.js';

export function renderCategory({ site, categories, category, list }) {
  const others = categories.filter((c) => c.slug !== category.slug);
  const items = list.map((t) => `<li>${toolCard(t, 1)}</li>`).join('');

  const itemListJsonLD = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${category.name}工具`,
    numberOfItems: list.length,
    itemListElement: list.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${site.domain.replace(/\/$/, '')}/tool/${t.slug}.html`,
    })),
  };
  const breadcrumbJsonLD = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: `${site.domain.replace(/\/$/, '')}/index.html` },
      { '@type': 'ListItem', position: 2, name: category.name, item: `${site.domain.replace(/\/$/, '')}/category/${category.slug}.html` },
    ],
  };

  return `<script type="application/ld+json">${JSON.stringify(itemListJsonLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLD)}</script>
<div class="container">
  <nav class="breadcrumb" aria-label="面包屑">
    <a href="../index.html">首页</a><span aria-hidden="true">/</span><span>${esc(category.name)}</span>
  </nav>
  <header class="page-header">
    <h1>${esc(category.icon || '')} ${esc(category.name)}</h1>
    <p>${esc(category.description)}</p>
    <p class="page-meta">共收录 ${list.length} 款工具</p>
  </header>
  <ul class="tool-grid tool-grid-list">${items}</ul>
  <nav class="cat-siblings" aria-label="其他分类">
    <h2>其他分类</h2>
    <p>${others.map((c) => `<a class="chip" href="${c.slug}.html">${esc(c.icon || '')} ${esc(c.name)}</a>`).join('')}</p>
  </nav>
</div>`;
}
