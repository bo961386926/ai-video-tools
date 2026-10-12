/* 全站交互：移动端菜单 + 首页站内搜索（无框架，零依赖） */
(function () {
  'use strict';

  /* 移动端导航折叠 */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    });
  }

  /* 首页站内搜索：按 data-search 文本过滤卡片，隐藏空分类区 */
  var input = document.getElementById('tool-search');
  if (!input) return;
  var count = document.getElementById('search-count');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.tool-card'));

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (card) {
      var hay = (card.getAttribute('data-search') || '').toLowerCase();
      var show = !q || hay.indexOf(q) !== -1;
      card.style.display = show ? '' : 'none';
      var li = card.closest('li');
      if (li) li.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    /* 隐藏没有可见卡片的分类区块 */
    document.querySelectorAll('section.section[aria-labelledby], section.section').forEach(function (sec) {
      var secCards = sec.querySelectorAll('.tool-card');
      if (!secCards.length) return;
      var anyVisible = Array.prototype.some.call(secCards, function (c) {
        return c.style.display !== 'none';
      });
      sec.style.display = anyVisible ? '' : 'none';
    });

    if (count) {
      count.textContent = q ? '找到 ' + visible + ' 款工具' : '';
    }
  });
})();
