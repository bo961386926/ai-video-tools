/** 首页模板 —— 参考 AI工具宝箱列表页：统计条 + 分类 chips + 价格筛选 + 横向工具行 */
import { esc, toolRowList, statsBar, catChips, filterBar, isFreeUsable, catColor } from './common.js';

export function renderHome({ site, categories, tools, byCat }) {
  const featured = tools.filter((t) => t.featured).slice(0, 6);
  const recent = tools.slice(0, 8);
  const total = tools.length;
  const freeCount = tools.filter(isFreeUsable).length;
  const directCount = tools.filter((t) => t.access === 'direct').length;
  const lastUpdate = tools.map((t) => t.updatedAt).filter(Boolean).sort().at(-1) || '每日';

  const countOf = (c) => (byCat.get(c.slug) || []).length;

  const catCards = categories
    .map((c, i) => {
      const n = countOf(c);
      return `<a class="cat-card" href="category/${c.slug}.html" style="--cat-color:${catColor(c, i)}">
        <span class="cat-icon" aria-hidden="true">${esc(c.icon || '📁')}</span>
        <span class="cat-name">${esc(c.name)}</span>
        <span class="cat-count">${n} 款工具</span>
      </a>`;
    })
    .join('');

  const featuredSec = featured.length
    ? `<section class="section" aria-labelledby="featured-title">
        <div class="section-head">
          <h2 id="featured-title"><span class="section-dot"></span>编辑推荐<span class="cat-badge">HOT</span></h2>
          <a class="section-more" href="#cat-${esc(categories[0] ? categories[0].slug : '')}">浏览全部 ${total} 款 →</a>
        </div>
        ${toolRowList(featured, 0)}
      </section>`
    : '';

  const catSections = categories
    .map((c, i) => {
      const list = (byCat.get(c.slug) || []).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      if (!list.length) return '';
      return `<section class="section" aria-labelledby="cat-${c.slug}">
        <div class="section-head">
          <h2 id="cat-${c.slug}"><span class="section-dot" style="background:${catColor(c, i)}"></span>${esc(c.name)}</h2>
          <a class="section-more" href="category/${c.slug}.html">查看全部 ${list.length} 款 →</a>
        </div>
        <p class="section-desc">${esc(c.description)}</p>
        ${toolRowList(list, 0)}
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
    ${statsBar([
      [total, '款收录工具'],
      [freeCount, '款可免费使用'],
      [directCount, '款国内可直连'],
      [categories.length, '大分类'],
      [lastUpdate, '最近更新'],
    ])}
  </div>
</section>

<div class="container">
  <section class="section" aria-labelledby="cats-title">
    <div class="section-head"><h2 id="cats-title"><span class="section-dot"></span>按分类浏览</h2></div>
    <div class="cat-grid">${catCards}</div>
    ${catChips(categories, countOf, (c) => `category/${c.slug}.html`)}
  </section>

  ${filterBar('home')}

  ${featuredSec}
  ${catSections}

  <section class="section" aria-labelledby="recent-title">
    <div class="section-head"><h2 id="recent-title"><span class="section-dot"></span>最近更新</h2></div>
    <ul class="recent-list">${recentList}</ul>
  </section>

  <section class="cta-banner">
    <div>
      <h2>发现了好用但没收录的 AI 视频工具？</h2>
      <p>告诉我们，核实后会尽快收录。免费收录，不收取任何费用。</p>
    </div>
    <div class="cta-actions">
      <a class="btn" href="submit.html">提交工具</a>
      ${site.submitForm ? `<a class="btn btn-ghost" href="${esc(site.submitForm)}" target="_blank" rel="noopener">直接填表单</a>` : ''}
    </div>
  </section>
</div>`;
}
