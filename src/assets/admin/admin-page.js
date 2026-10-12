/* 收录工作台前端逻辑（无依赖，原生 DOM） */
(function () {
  'use strict';

  var TOKEN = '__ADMIN_TOKEN__';
  var $ = function (id) { return document.getElementById(id); };

  var state = { site: {}, categories: [], tools: [], editing: null, slugTouched: false };

  var AVATAR_COLORS = ['#EEF2FF', '#FEF3C7', '#ECFDF5', '#FDF2F8', '#EFF6FF', '#F0FDF4', '#FFF7ED', '#F5F3FF', '#F0F9FF'];
  var PRICING_LABEL = { free: '免费', freemium: '免费增值', paid: '付费', trial: '试用' };
  var ACCESS_LABEL = { direct: '直连', proxy: '需代理', unknown: '未知' };

  /* ---------------- 基础 ---------------- */

  function log(msg, level) {
    var box = $('log');
    var line = document.createElement('div');
    line.className = 'l-' + (level || 'info');
    var t = new Date();
    var hh = String(t.getHours()).padStart(2, '0');
    var mm = String(t.getMinutes()).padStart(2, '0');
    var ss = String(t.getSeconds()).padStart(2, '0');
    line.textContent = '[' + hh + ':' + mm + ':' + ss + '] ' + msg;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }

  function formMsg(text, kind) {
    var el = $('formMsg');
    el.textContent = text;
    el.className = 'form-msg show ' + (kind || 'err');
  }

  function clearFormMsg() {
    $('formMsg').className = 'form-msg';
  }

  function api(path, body) {
    var opt = { headers: { 'x-admin-token': TOKEN } };
    if (body !== undefined) {
      opt.method = 'POST';
      opt.headers['content-type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(path, opt).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: '响应不是合法 JSON（HTTP ' + res.status + '）' }; });
    });
  }

  function slugify(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function letterAvatar(t) {
    var span = document.createElement('span');
    var hash = 0;
    var s = t.slug || t.name || '?';
    for (var i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    span.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
    span.style.width = '100%';
    span.style.height = '100%';
    span.style.display = 'inline-flex';
    span.style.alignItems = 'center';
    span.style.justifyContent = 'center';
    span.style.fontSize = '13px';
    span.style.fontWeight = '700';
    span.style.color = '#3b4763';
    span.textContent = (t.name || '?').trim().charAt(0).toUpperCase();
    return span;
  }

  /* ---------------- 数据加载与渲染 ---------------- */

  function reload() {
    return api('/api/data').then(function (r) {
      if (!r.ok) { log('✗ 加载数据失败：' + (r.error || '未知错误'), 'err'); return; }
      state.site = r.site;
      state.categories = r.categories;
      state.tools = r.tools;
      renderCategoryOptions();
      renderTable();
      $('stats').textContent = '共 ' + r.tools.length + ' 款工具 · ' + r.categories.length + ' 个分类';
    });
  }

  function renderCategoryOptions() {
    var sel = $('category');
    var keep = sel.value;
    sel.textContent = '';
    state.categories.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.slug;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    if (keep && state.categories.some(function (c) { return c.slug === keep; })) sel.value = keep;
  }

  function renderTable() {
    var q = $('search').value.trim().toLowerCase();
    var tbody = $('tbody');
    tbody.textContent = '';
    var shown = 0;
    state.tools.forEach(function (t) {
      var hay = (t.name + ' ' + t.slug + ' ' + (t.tags || []).join(' ')).toLowerCase();
      if (q && hay.indexOf(q) === -1) return;
      shown++;

      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      var cell = document.createElement('div');
      cell.className = 'cell-name';
      var icon = document.createElement('span');
      icon.className = 'rowicon';
      if (t.logo) {
        var img = document.createElement('img');
        img.src = '/' + t.logo;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function () { icon.textContent = ''; icon.appendChild(letterAvatar(t)); };
        icon.appendChild(img);
      } else {
        icon.appendChild(letterAvatar(t));
      }
      var names = document.createElement('div');
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = t.name;
      var sl = document.createElement('div');
      sl.className = 'sl';
      sl.textContent = t.slug;
      names.appendChild(nm);
      names.appendChild(sl);
      if (typeof t.rating === 'number') {
        var rt = document.createElement('div');
        rt.className = 'rate';
        rt.textContent = '★ ' + t.rating.toFixed(1);
        names.appendChild(rt);
      }
      cell.appendChild(icon);
      cell.appendChild(names);
      tdName.appendChild(cell);
      tr.appendChild(tdName);

      var cat = state.categories.find(function (c) { return c.slug === t.category; });
      tr.appendChild(td(cat ? cat.name : t.category));

      var tdPricing = document.createElement('td');
      var bp = document.createElement('span');
      bp.className = 'badge b-' + t.pricing;
      bp.textContent = PRICING_LABEL[t.pricing] || t.pricing;
      tdPricing.appendChild(bp);
      tr.appendChild(tdPricing);

      var tdAccess = document.createElement('td');
      var ba = document.createElement('span');
      ba.className = 'badge b-' + (t.access || 'unknown');
      ba.textContent = ACCESS_LABEL[t.access] || '未知';
      tdAccess.appendChild(ba);
      tr.appendChild(tdAccess);

      var tdLogo = document.createElement('td');
      tdLogo.textContent = t.logo ? '本地' : '首字母';
      tdLogo.style.color = t.logo ? 'var(--ok)' : 'var(--text-secondary)';
      tr.appendChild(tdLogo);

      tr.appendChild(td(t.updatedAt || '-'));

      var tdStar = document.createElement('td');
      if (t.featured) {
        var star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        star.title = '首页推荐';
        tdStar.appendChild(star);
      }
      tr.appendChild(tdStar);

      var tdOps = document.createElement('td');
      tdOps.style.whiteSpace = 'nowrap';
      var btnEdit = document.createElement('button');
      btnEdit.textContent = '编辑';
      btnEdit.addEventListener('click', function () { fillForm(t); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      var btnDel = document.createElement('button');
      btnDel.textContent = '删除';
      btnDel.className = 'danger';
      btnDel.style.marginLeft = '6px';
      btnDel.addEventListener('click', function () { removeTool(t); });
      tdOps.appendChild(btnEdit);
      tdOps.appendChild(btnDel);
      tr.appendChild(tdOps);

      tbody.appendChild(tr);
    });
    $('toolCount').textContent = shown === state.tools.length ? '（' + state.tools.length + '）' : '（' + shown + ' / ' + state.tools.length + '）';
  }

  function td(text) {
    var el = document.createElement('td');
    el.textContent = text;
    return el;
  }

  /* ---------------- 表单 ---------------- */

  function setLogo(path) {
    $('logo').value = path || '';
    var img = $('logoPreview');
    if (path) {
      img.src = '/' + path;
      img.classList.remove('empty');
      $('logoPath').textContent = path;
    } else {
      img.removeAttribute('src');
      img.classList.add('empty');
      $('logoPath').textContent = '未设置（将显示首字母头像）';
    }
  }

  function fillForm(t) {
    state.editing = t ? t.slug : null;
    state.slugTouched = false;
    clearFormMsg();
    $('formTitle').textContent = t ? '编辑工具：' + t.name : '新增工具';
    $('name').value = t ? t.name : '';
    $('slug').value = t ? t.slug : '';
    $('slug').readOnly = !!t;
    $('slugHint').textContent = t
      ? '编辑时不可修改 slug（详情页地址主键）'
      : '仅小写字母/数字/连字符，全站唯一；英文名会自动生成';
    renderCategoryOptions();
    if (t && state.categories.some(function (c) { return c.slug === t.category; })) $('category').value = t.category;
    $('tagline').value = t ? t.tagline : '';
    $('website').value = t ? t.website : '';
    $('description').value = t ? (t.description || '') : '';
    $('tags').value = t ? (t.tags || []).join(', ') : '';
    $('featured').checked = t ? !!t.featured : false;
    $('pricing').value = t ? t.pricing : 'freemium';
    $('access').value = t ? (t.access || 'direct') : 'direct';
    $('rating').value = t && typeof t.rating === 'number' ? t.rating : '';
    $('likes').value = t && typeof t.likes === 'number' ? t.likes : '';
    setLogo(t ? t.logo : '');
  }

  function gather() {
    return {
      slug: $('slug').value.trim(),
      name: $('name').value.trim(),
      category: $('category').value,
      tagline: $('tagline').value.trim(),
      description: $('description').value.trim(),
      website: $('website').value.trim(),
      pricing: $('pricing').value,
      access: $('access').value,
      tags: $('tags').value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean),
      featured: $('featured').checked,
      logo: $('logo').value.trim(),
      rating: $('rating').value.trim(),
      likes: $('likes').value.trim(),
    };
  }

  function save(withPush) {
    clearFormMsg();
    var tool = gather();
    if (!tool.slug) {
      var auto = slugify(tool.name);
      if (auto) {
        tool.slug = auto;
        $('slug').value = auto;
      } else {
        formMsg('中文名称无法自动生成 slug，请手动填写英文标识（如 keling-video）', 'err');
        return;
      }
    }
    var btnSave = $('btnSave');
    var btnPush = $('btnSavePush');
    btnSave.disabled = true;
    btnPush.disabled = true;
    log((withPush ? '正在保存并推送' : '正在保存') + '：' + tool.name + ' …', 'info');
    api('/api/save', { tool: tool, originalSlug: state.editing, push: !!withPush }).then(function (r) {
      btnSave.disabled = false;
      btnPush.disabled = false;
      if (!r.ok) {
        formMsg((r.errors && r.errors.length ? r.errors.join('；') : r.error || '保存失败'), 'err');
        log('✗ 保存失败：' + ((r.errors || [r.error]).join('；')), 'err');
        return;
      }
      (r.warnings || []).forEach(function (w) { log('⚠ ' + w, 'warn'); });
      log('✓ 已' + (r.action === 'created' ? '新增' : '更新') + '：' + r.tool.name + '（' + r.tool.slug + '）', 'ok');
      if (r.build && r.build.ok) {
        log('✓ 站点已重建（dist/）', 'ok');
      } else if (r.build) {
        log('✗ 站点重建失败（数据已保存，请按下列报错修正）：\n' + r.build.output, 'err');
      }
      if (r.push) {
        if (r.push.ok) log('✓ ' + r.push.output, 'ok');
        else log('✗ 推送失败：\n' + r.push.output, 'err');
      }
      formMsg('已保存' + (withPush ? '并推送' : '') + '：' + r.tool.name, 'ok');
      return reload().then(function () {
        if (state.editing) {
          var fresh = state.tools.find(function (t) { return t.slug === r.tool.slug; });
          if (fresh) fillForm(fresh);
        }
      });
    });
  }

  function removeTool(t) {
    if (!window.confirm('确定删除「' + t.name + '」？\n将移除 data/tools.json 中的记录并重建站点；\n需再点「提交并推送」才会在线上生效。')) return;
    api('/api/delete', { slug: t.slug }).then(function (r) {
      if (!r.ok) { log('✗ 删除失败：' + (r.error || '未知错误'), 'err'); return; }
      log('✓ 已删除：' + t.name, 'ok');
      if (r.build && r.build.ok) log('✓ 站点已重建', 'ok');
      else if (r.build) log('✗ 重建失败：\n' + r.build.output, 'err');
      if (state.editing === t.slug) fillForm(null);
      reload();
    });
  }

  /* ---------------- 图标 ---------------- */

  function fetchLogo() {
    var slug = state.editing || $('slug').value.trim();
    var website = $('website').value.trim();
    if (!slug) { formMsg('请先填写 slug 再抓取图标', 'err'); return; }
    if (!/^https?:\/\/\S+$/.test(website)) { formMsg('请先填写合法的官网地址', 'err'); return; }
    log('正在从 ' + website + ' 抓取图标 …', 'info');
    api('/api/fetch-logo', { slug: slug, website: website }).then(function (r) {
      if (!r.ok) { log('✗ 抓取失败：' + (r.error || '未找到可用图标'), 'err'); return; }
      setLogo(r.logo);
      log('✓ 图标已抓取：' + r.logo + '（' + (r.size / 1024).toFixed(1) + 'KB）', 'ok');
    });
  }

  function uploadLogo(file) {
    var slug = state.editing || $('slug').value.trim();
    if (!slug) { formMsg('请先填写 slug 再上传图标', 'err'); return; }
    if (file.size > 2 * 1024 * 1024) { formMsg('图标文件过大（上限 2MB，建议压缩到 200KB 以内）', 'err'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      log('正在上传图标 ' + file.name + ' …', 'info');
      api('/api/logo', { slug: slug, data: String(reader.result) }).then(function (r) {
        if (!r.ok) { formMsg(r.error || '上传失败', 'err'); log('✗ 上传失败：' + (r.error || ''), 'err'); return; }
        setLogo(r.logo);
        log('✓ 图标已上传：' + r.logo + '（' + (r.size / 1024).toFixed(1) + 'KB）', 'ok');
      });
    };
    reader.onerror = function () { formMsg('读取文件失败', 'err'); };
    reader.readAsDataURL(file);
  }

  /* ---------------- 构建与推送 ---------------- */

  function buildOnly() {
    var btn = $('btnBuild');
    btn.disabled = true;
    log('正在重建站点 …', 'info');
    api('/api/build', {}).then(function (r) {
      btn.disabled = false;
      if (r.ok) { log('✓ ' + (r.build && r.build.output ? r.build.output : '站点已重建（dist/）'), 'ok'); }
      else { log('✗ 重建失败：\n' + (r.build ? r.build.output : r.error), 'err'); }
    });
  }

  function pushOnly() {
    if (!window.confirm('将执行 git add -A / commit / push，把当前所有改动推送到 GitHub（Pages 会自动部署）。继续？')) return;
    var btn = $('btnPush');
    btn.disabled = true;
    log('正在提交并推送 …', 'info');
    api('/api/push', {}).then(function (r) {
      btn.disabled = false;
      if (r.ok) log('✓ ' + r.push.output, 'ok');
      else log('✗ 推送失败：\n' + r.push.output, 'err');
    });
  }

  /* ---------------- 事件绑定与初始化 ---------------- */

  $('name').addEventListener('input', function () {
    if (!state.editing && !state.slugTouched) $('slug').value = slugify(this.value);
  });
  $('slug').addEventListener('input', function () { state.slugTouched = true; });
  $('search').addEventListener('input', renderTable);

  $('btnSave').addEventListener('click', function () { save(false); });
  $('btnSavePush').addEventListener('click', function () { save(true); });
  $('btnReset').addEventListener('click', function () { fillForm(null); });
  $('btnBuild').addEventListener('click', buildOnly);
  $('btnPush').addEventListener('click', pushOnly);
  $('btnFetchLogo').addEventListener('click', fetchLogo);
  $('btnClearLogo').addEventListener('click', function () { setLogo(''); });
  $('btnUploadLogo').addEventListener('click', function () { $('logoFile').click(); });
  $('logoFile').addEventListener('change', function () {
    if (this.files && this.files[0]) uploadLogo(this.files[0]);
    this.value = '';
  });
  $('btnClearLog').addEventListener('click', function () { $('log').textContent = ''; });

  fillForm(null);
  reload().then(function () {
    log('收录工作台就绪：共 ' + state.tools.length + ' 款工具。新增/编辑后会自动重建 dist/，推送后 GitHub Pages 自动部署。', 'ok');
  });
})();
