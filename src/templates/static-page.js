/** 静态页（关于 / 提交工具）模板：正文片段自带 h1 */
export function renderStaticPage({ fragment }) {
  return `<div class="container"><div class="static-page">${fragment}</div></div>`;
}
