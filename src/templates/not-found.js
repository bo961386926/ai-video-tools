/** 404 页模板 */
import { esc } from './common.js';

export function renderNotFound({ site }) {
  return `<div class="container">
  <section class="notfound">
    <p class="notfound-code">404</p>
    <h1>页面不存在</h1>
    <p>您访问的页面可能已被移动或删除。可以返回首页，按分类继续浏览 ${esc(site.name || '')} 收录的 AI 视频工具。</p>
    <p><a class="btn" href="index.html">返回首页</a></p>
  </section>
</div>`;
}
