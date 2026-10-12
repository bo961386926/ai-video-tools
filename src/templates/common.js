/** 模板公共函数与小组件：转义、徽标、工具卡片等 */
export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const PRICING_LABEL = { free: '免费', freemium: '免费+付费', paid: '付费', trial: '限时试用' };
export const ACCESS_LABEL = { direct: '国内可直接访问', proxy: '需特殊网络环境', unknown: '访问情况待核验' };

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
    return `<img class="tool-logo" src="${esc(src)}" alt="${esc(tool.name)} logo" width="48" height="48" loading="lazy" decoding="async">`;
  }
  return initialAvatar(tool.name, tool.slug);
};

export const pricingBadge = (pricing) => {
  const label = PRICING_LABEL[pricing] || pricing;
  return `<span class="badge badge-${esc(pricing)}">${esc(label)}</span>`;
};

/** 工具卡片（首页/分类页共用）——<article> 语义标签，data-search 供站内搜索过滤 */
export const toolCard = (tool, depth = 1) => {
  const prefix = '../'.repeat(depth);
  const searchText = [tool.name, tool.tagline, ...(tool.tags || [])].join(' ');
  return `<article class="tool-card" data-search="${esc(searchText)}">
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
