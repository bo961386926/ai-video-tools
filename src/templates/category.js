/** 分类页模板 —— 与首页同款横向工具行 + 价格筛选 */
import { esc, toolRowList, filterBar, isFreeUsable, catChips, catColor } from './common.js';

export function renderCategory({ site, categories, category, list, byCat }) {
  const idx = categories.findIndex((c) => c.slug === category.slug);
  const color = catColor(category, idx < 0 ? 0 : idx);
  const freeCount = list.filter(isFreeUsable).length;
  const directCount = list.filter((t) => t.access === 'direct').length;

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

  const others = categories.filter((c) => c.slug !== category.slug);
  const countOf = (c) => (byCat.get(c.slug) || []).length;

  return `<script type="application/ld+json">${JSON.stringify(itemListJsonLD)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbJsonLD)}</script>
<div class="container">
  <nav class="breadcrumb" aria-label="面包屑">
    <a href="../index.html">首页</a><span aria-hidden="true">/</span><span>${esc(category.name)}</span>
  </nav>
  <header class="page-header">
    <h1><span class="section-dot" style="background:${color}"></span>${esc(category.name)}</h1>
    <p>${esc(category.description)}</p>
    <p class="page-meta">共收录 ${list.length} 款工具 · 其中 ${freeCount} 款可免费使用 · ${directCount} 款国内可直接访问</p>
  </header>

  ${filterBar('category')}

  ${toolRowList(list, 1)}

  <p class="empty-hint" data-empty-hint hidden>当前筛选条件下没有匹配的工具。</p>

  <nav class="cat-siblings" aria-label="其他分类">
    <h2>其他分类</h2>
    <div class="cat-chips">${others
      .map((c) => {
        const i = categories.findIndex((x) => x.slug === c.slug);
        return `<a class="cat-chip" href="${c.slug}.html"><span class="cat-chip-dot" style="background:${catColor(c, i < 0 ? 0 : i)}"></span>${esc(c.name)}<b>${countOf(c)}</b></a>`;
      })
      .join('')}</div>
  </nav>
</div>`;
}
