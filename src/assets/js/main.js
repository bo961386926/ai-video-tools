/* 全站交互：移动端菜单 + 价格筛选 + 👍点赞 + 站内搜索（无框架，零依赖） */
(function () {
  'use strict';

  /* ---------------- 移动端导航折叠 ---------------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });
  }

  /* ---------------- 可筛选条目 ---------------- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.tool-row, .tool-card'));

  /* ---------------- 👍 点赞（localStorage 本地持久化） ---------------- */
  var LIKE_KEY = 'aivt-likes';
  function readLikes() {
    try { return JSON.parse(localStorage.getItem(LIKE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeLikes(o) {
    try { localStorage.setItem(LIKE_KEY, JSON.stringify(o)); } catch (e) { /* 隐私模式下忽略 */ }
  }
  var liked = readLikes();
  Array.prototype.forEach.call(document.querySelectorAll('.like-btn'), function (btn) {
    var slug = btn.getAttribute('data-slug');
    var base = parseInt(btn.getAttribute('data-likes') || '0', 10) || 0;
    var num = btn.querySelector('b');
    function paint() {
      var on = !!liked[slug];
      if (num) num.textContent = String(base + (on ? 1 : 0));
      btn.classList.toggle('liked', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    paint();
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (liked[slug]) delete liked[slug];
      else liked[slug] = 1;
      writeLikes(liked);
      paint();
    });
  });

  /* ---------------- 筛选（价格 × 国内可访问性，可组合） ---------------- */
  var filterBtns = Array.prototype.slice.call(document.querySelectorAll('.tools-filter-btn'));
  var freeOnly = false;
  var directOnly = false;

  function paintFilters() {
    filterBtns.forEach(function (b) {
      var kind = b.getAttribute('data-filter');
      var on = kind === 'all' ? !freeOnly && !directOnly : kind === 'free' ? freeOnly : directOnly;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var kind = btn.getAttribute('data-filter');
      if (kind === 'all') { freeOnly = false; directOnly = false; }
      else if (kind === 'free') freeOnly = !freeOnly;
      else if (kind === 'direct') directOnly = !directOnly;
      paintFilters();
      apply();
    });
  });

  /* ---------------- 站内搜索 ---------------- */
  var input = document.getElementById('tool-search');
  var count = document.getElementById('search-count');
  if (input) input.addEventListener('input', apply);

  function freeUsable(pricing) {
    return pricing === 'free' || pricing === 'freemium';
  }

  function apply() {
    var q = input ? input.value.trim().toLowerCase() : '';
    var visible = 0;

    items.forEach(function (el) {
      var hay = (el.getAttribute('data-search') || '').toLowerCase();
      var pricing = el.getAttribute('data-pricing') || '';
      var access = el.getAttribute('data-access') || 'unknown';
      var show = (!q || hay.indexOf(q) !== -1)
        && (!freeOnly || freeUsable(pricing))
        && (!directOnly || access === 'direct');
      var host = el.closest('li') || el;
      host.style.display = show ? '' : 'none';
      el.setAttribute('data-hidden', show ? '0' : '1');
      if (show) visible++;
    });

    /* 隐藏没有可见条目的区块 */
    Array.prototype.forEach.call(document.querySelectorAll('section.section'), function (sec) {
      var inner = sec.querySelectorAll('.tool-row, .tool-card');
      if (!inner.length) return;
      var any = Array.prototype.some.call(inner, function (c) {
        return c.getAttribute('data-hidden') !== '1';
      });
      sec.style.display = any ? '' : 'none';
    });

    /* 空状态提示 */
    var hint = document.querySelector('[data-empty-hint]');
    if (hint) hint.hidden = visible > 0;

    if (count) count.textContent = q || freeOnly || directOnly ? '找到 ' + visible + ' 款工具' : '';
  }
})();
