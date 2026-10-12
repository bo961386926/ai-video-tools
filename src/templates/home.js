/** 首页模板 */
import { esc, toolCard } from './common.js';

export function renderHome({ site, categories, tools, byCat }) {
  const featured = tools.filter((t) => t.featured).slice(0, 6);
  const recent = tools.slice(0, 8);
  const total = tools.length;

  const catCards = categories
    .map((c) => {
      const n = (byCat.get(c.slug) || []).length;
      return `<a class="cat-card" href="category/${c.slug}.html">
        <span class="cat-icon" aria-hidden="true">${esc(c.icon || '📁')}</span>
        <span class="cat-name">${esc(c.name)}</span>
        <span class="cat-count">${n} 款工具</span>
      </a>`;
    })
    .join('');

  const featuredSec = featured.length
    ? `<section class="section" aria-labelledby="featured-title">
        <div class="section-head">
          <h2 id="featured-title">编辑推荐</h2>
        </div>
        <div class="tool-grid">${featured.map((t) => toolCard(t, 0)).join('')}</div>
      </section>`
    : '';

  const catSections = categories
    .map((c) => {
      const list = (byCat.get(c.slug) || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      if (!list.length) return '';
      return `<section class="section" aria-labelledby="cat-${c.slug}">
        <div class="section-head">
          <h2 id="cat-${c.slug}">${esc(c.icon || '')} ${esc(c.name)}</h2>
          <a class="section-more" href="category/${c.slug}.html">查看全部 ${list.length} 款 →</a>
        </div>
        <p class="section-desc">${esc(c.description)}</p>
        <div class="tool-grid">${list.map((t) => toolCard(t, 0)).join('')}</div>
      </section>`;
    })
    .join('');

  const recentList = recent
    .map(
      (t) => `<li class="recent-item">
        <a href="tool/${t.slug}.html">${esc(t.name)}</a>
        <span class="recent-tagline">${esc(t.tagline)}</span>
      </li>`
    )
    .join('');

  return `
<section class="hero">
  <div class="container">
    <h1>${esc(site.name || 'AI 视频工具导航')}</h1>
    <p class="hero-desc">${esc(site.description || '')}</p>
    <div class="hero-search">
      <input type="search" id="tool-search" placeholder="搜索工具名称、功能或场景…" aria-label="站内搜索工具">
      <span class="hero-search-count" id="search-count" aria-live="polite"></span>
    </div>
    <p class="hero-stats">已收录 <strong>${total}</strong> 款工具 · 覆盖 <strong>${categories.length}</strong> 个分类 · 每款工具均经人工核验</p>
  </div>
</section>

<div class="container">
  <section class="section" aria-labelledby="cats-title">
    <div class="section-head"><h2 id="cats-title">按分类浏览</h2></div>
    <div class="cat-grid">${catCards}</div>
  </section>

  ${featuredSec}
  ${catSections}

  <section class="section" aria-labelledby="recent-title">
    <div class="section-head"><h2 id="recent-title">最近更新</h2></div>
    <ul class="recent-list">${recentList}</ul>
  </section>

  <section class="cta-banner">
    <div>
      <h2>发现了好用但没收录的 AI 视频工具？</h2>
      <p>告诉我们，核实后会尽快收录。免费收录，不收取任何费用。</p>
    </div>
    <a class="btn" href="submit.html">提交工具</a>
  </section>
</div>`;
}
