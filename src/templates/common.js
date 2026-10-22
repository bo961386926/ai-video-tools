/** 模板公共函数与小组件：转义、徽标、工具行/卡片等 */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const PRICING_LABEL = { free: '免费', freemium: '免费+付费', paid: '付费', trial: '限时试用' };
export const ACCESS_LABEL = { direct: '国内可直接访问', proxy: '需特殊网络环境', unknown: '访问情况待核验' };

/** 「可免费使用」= 完全免费或含免费额度（用于统计与「只看免费」筛选） */
export const isFreeUsable = (t) => t.pricing === 'free' || t.pricing === 'freemium';

/** 分类配色：优先取数据里的 color，缺省按序回落到内置色板 */
const CAT_FALLBACK = ['#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899'];
export const catColor = (cat, index = 0) =>
  (cat && /^#[0-9a-fA-F]{6}$/.test(cat.color || '') ? cat.color : CAT_FALLBACK[index % CAT_FALLBACK.length]);

/** 柔和色板：按 slug 哈希取色，让首字母头像不重样 */
const AVATAR_COLORS = ['#EEF2FF', '#FEF3C7', '#ECFDF5', '#FDF2F8', '#EFF6FF', '#F0FDF4', '#FFF7ED', '#F5F3FF', '#F0F9FF'];
const avatarColor = (seed) => {
  let h = 0;
  for (const ch of String(seed || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export const initialAvatar = (name, slug) =>
  `<span class="tool-avatar" style="background:${avatarColor(slug || name)}" aria-hidden="true">${esc([...(name || '?')][0] || '?')}</span>`;

export const toolLogo = (tool, depth = 1) => {
  const prefix = '../'.repeat(depth);
  if (tool.logo) {
    const src = /^https?:\/\//.test(tool.logo) ? tool.logo : `${prefix}${tool.logo.replace(/^\/+/, '')}`;
    return `<img class="tool-logo" src="${esc(src)}" alt="${esc(tool.name)} logo" width="44" height="44" loading="lazy" decoding="async">`;
  }
  return initialAvatar(tool.name, tool.slug);
};

export const pricingBadge = (pricing) => {
  const label = PRICING_LABEL[pricing] || pricing;
  return `<span class="badge badge-${esc(pricing)}">${esc(label)}</span>`;
};

/** 评分：仅在数据提供了 rating 时渲染（不臆造评分） */
export const ratingInline = (tool) =>
  typeof tool.rating === 'number' && tool.rating > 0
    ? `<span class="rating-inline" title="评分 ${tool.rating}/5">★${tool.rating.toFixed(1)}</span>`
    : '';

/**
 * 横向工具行（列表页主形态，参考 AI工具宝箱的 tools-index-row）
 * 结构：图标 + 名称(+评分) + 两行简介 | 价格胶囊 + 👍点赞
 * 点赞按钮在 <a> 之外，避免交互元素嵌套；整行可点由 .tool-row-link::after 拉伸实现。
 */
export const toolRow = (tool, depth = 1) => {
  const prefix = '../'.repeat(depth);
  const searchText = [tool.name, tool.tagline, ...(tool.tags || [])].join(' ');
  const likes = typeof tool.likes === 'number' ? tool.likes : 0;
  return `<article class="tool-row" data-search="${esc(searchText)}" data-pricing="${esc(tool.pricing)}" data-access="${esc(tool.access || 'unknown')}">
  <a class="tool-row-link" href="${prefix}tool/${tool.slug}.html">
    <span class="tool-row-icon">${toolLogo(tool, depth)}</span>
    <span class="tool-row-main">
      <span class="tool-row-name">${esc(tool.name)}${ratingInline(tool)}</span>
      <span class="tool-row-desc">${esc(tool.tagline)}</span>
    </span>
  </a>
  <span class="tool-row-meta">
    ${pricingBadge(tool.pricing)}
    <button type="button" class="like-btn" data-slug="${esc(tool.slug)}" data-likes="${likes}" aria-pressed="false" aria-label="给 ${esc(tool.name)} 点赞">👍<b>${likes}</b></button>
  </span>
</article>`;
};

/** 一组工具行 */
export const toolRowList = (list, depth = 1) =>
  `<ul class="tool-rows">${list.map((t) => `<li>${toolRow(t, depth)}</li>`).join('')}</ul>`;

/** 统计条 */
export const statsBar = (items) =>
  `<div class="stats-row">${items.map(([v, l]) => `<div class="stat-card"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>`;

/** 分类快捷 chips（色点 + 名称 + 数量），href 由调用方决定（锚点或分类页） */
export const catChips = (categories, countOf, hrefOf) =>
  `<nav class="cat-chips" aria-label="分类快捷导航">${categories
    .map((c, i) => `<a class="cat-chip" href="${esc(hrefOf(c))}"><span class="cat-chip-dot" style="background:${catColor(c, i)}"></span>${esc(c.name)}<b>${countOf(c)}</b></a>`)
    .join('')}</nav>`;

/** 筛选栏：三个可组合的开关（全部 / 免费可用 / 国内直连），对应「价格 × 网络」两个维度 */
export const filterBar = (scope = '') =>
  `<div class="tools-filter" data-filter-scope="${esc(scope)}" role="group" aria-label="工具筛选">
  <button type="button" class="tools-filter-btn active" data-filter="all" aria-pressed="true">全部工具</button>
  <button type="button" class="tools-filter-btn" data-filter="free" aria-pressed="false">免费可用</button>
  <button type="button" class="tools-filter-btn" data-filter="direct" aria-pressed="false">国内直连</button>
</div>`;

/** 工具卡片（详情页「相关工具」沿用）——<article> 语义标签，data-search 供站内搜索过滤 */
export const toolCard = (tool, depth = 1) => {
  const prefix = '../'.repeat(depth);
  const searchText = [tool.name, tool.tagline, ...(tool.tags || [])].join(' ');
  return `<article class="tool-card" data-search="${esc(searchText)}" data-pricing="${esc(tool.pricing)}" data-access="${esc(tool.access || 'unknown')}">
  <a class="tool-card-link" href="${prefix}tool/${tool.slug}.html">
    <div class="tool-card-head">
      ${toolLogo(tool, depth)}
      <div class="tool-card-title">
        <h3>${esc(tool.name)}</h3>
        ${pricingBadge(tool.pricing)}
      </div>
    </div>
    <p class="tool-card-tagline">${esc(tool.tagline)}</p>
    <p class="tool-card-tags">${(tool.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</p>
  </a>
</article>`;
};

/** 外链统一出口：新窗口 + noopener */
export const externalLinkAttrs = ' target="_blank" rel="noopener"';
