/* 收录工作台前端逻辑（无依赖，原生 DOM） */
(function () {
  'use strict';

  var TOKEN = '__ADMIN_TOKEN__';
  var $ = function (id) { return document.getElementById(id); };

  var state = { site: {}, categories: [], tools: [], editing: null, slugTouched: false, submissions: [], fromSubmission: null };

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

  function fillForm(t, asNew) {
    var isEdit = !!t && !asNew;
    state.editing = isEdit ? t.slug : null;
    state.slugTouched = !!t;
    state.fromSubmission = null;
    clearFormMsg();
    $('formTitle').textContent = isEdit
      ? '编辑工具：' + t.name
      : t
        ? '新增工具（来自提交，核对后保存）'
        : '新增工具';
    $('name').value = t ? t.name : '';
    $('slug').value = t ? (t.slug || '') : '';
    $('slug').readOnly = isEdit;
    $('slugHint').textContent = isEdit
      ? '编辑时不可修改 slug（详情页地址主键）'
      : '仅小写字母/数字/连字符，全站唯一；中文名无法自动生成时请手填英文标识';
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
      if (r.action === 'created' && state.fromSubmission) {
        var src = state.submissions.find(function (x) { return x.recordId === state.fromSubmission.recordId; });
        state.fromSubmission = null;
        if (src && src.status === '待审核') markSubmission(src, '已收录');
        else if (src) log('该提交在收集表里已是「' + src.status + '」，不再改动', 'info');
      }
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

  /* ---------------- 待审核提交（飞书收集表） ----------------
   * 只读拉取别人提交的工具，核对后「填入表单」；收录/忽略只回写收集表的状态字段，
   * 不动站点数据。收集表没配置或读不到时，面板给明确提示，不阻塞其它功能。
   */

  var STATUS_BADGE = { '待审核': 'b-wait', '已收录': 'b-done', '已忽略': 'b-skip' };

  function pendingCount() {
    return state.submissions.filter(function (s) { return s.status === '待审核'; }).length;
  }

  function setPendingCount(n) {
    var el = $('pendingCount');
    el.textContent = String(n);
    el.className = 'pending-count' + (n ? '' : ' zero');
  }

  function renderPendingNotice(text) {
    var body = $('pendingBody');
    body.textContent = '';
    body.className = 'pending-empty';
    body.textContent = text;
  }

  function loadSubmissions(silent) {
    var btn = $('btnRefreshSubs');
    btn.disabled = true;
    if (!silent) log('正在读取提交收集表 …', 'info');
    return api('/api/submissions').then(function (r) {
      btn.disabled = false;
      if (!r.ok) {
        state.submissions = [];
        setPendingCount(0);
        if (r.configured === false) {
          renderPendingNotice('尚未配置收集表：请把 data/submissions.example.json 复制为 data/submissions.local.json，填好 baseToken / tableId 后重启工作台。');
          log('⚠ 提交收集表未配置：' + (r.error || ''), 'warn');
        } else {
          renderPendingNotice('读取失败：' + (r.error || '未知错误'));
          log('✗ 读取提交失败：' + (r.error || '未知错误'), 'err');
        }
        return;
      }
      state.submissions = r.items || [];
      var link = $('openTable');
      if (r.tableUrl) {
        link.href = r.tableUrl;
        link.style.display = '';
      }
      renderPending();
      log('✓ 提交收集表：共 ' + state.submissions.length + ' 条，待审核 ' + pendingCount() + ' 条', 'ok');
      if (r.hasMore) log('⚠ 收集表记录超过一次拉取上限，当前只显示最近 200 条；请先在收集表里处理掉旧记录', 'warn');
    });
  }

  function metaText(text) {
    var sp = document.createElement('span');
    sp.textContent = text;
    return sp;
  }

  function mkBtn(text, cls, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    return b;
  }

  function pendingItem(s) {
    var d = s.draft || {};
    var cat = state.categories.find(function (c) { return c.slug === d.category; });
    var item = document.createElement('div');
    item.className = 'pending-item' + (s.status === '待审核' ? '' : ' done');

    var top = document.createElement('div');
    top.className = 'pi-top';
    var nm = document.createElement('span');
    nm.className = 'pi-name';
    nm.textContent = d.name || '（提交未填工具名称）';
    top.appendChild(nm);
    var sl = document.createElement('span');
    sl.className = 'pi-slug';
    sl.textContent = d.slug ? 'slug: ' + d.slug : 'slug: 待手填';
    top.appendChild(sl);
    var badge = document.createElement('span');
    badge.className = 'badge ' + (STATUS_BADGE[s.status] || 'b-unknown');
    badge.textContent = s.status;
    top.appendChild(badge);
    if (s.slugTaken) {
      var warn = document.createElement('span');
      warn.className = 'warn-inline';
      warn.textContent = '⚠ slug 已被收录工具占用，填入表单后请改成新的英文标识';
      top.appendChild(warn);
    }
    item.appendChild(top);

    var tagline = document.createElement('div');
    tagline.className = 'pi-tagline';
    tagline.textContent = d.tagline || '（未填一句话简介）';
    item.appendChild(tagline);

    var meta = document.createElement('div');
    meta.className = 'pi-meta';
    if (s.categoryMapped && cat) {
      meta.appendChild(metaText('分类：' + cat.name));
    } else {
      meta.appendChild(metaText('分类：⚠ 未识别' + (s.raw && s.raw.category ? '（原值：' + s.raw.category + '）' : '（表单未选）') + '，填入表单后请手选'));
    }
    meta.appendChild(metaText('定价：' + (PRICING_LABEL[d.pricing] || d.pricing || '未知')));
    meta.appendChild(metaText('国内访问：' + (ACCESS_LABEL[d.access] || d.access || '未知')));
    if (d.tags && d.tags.length) meta.appendChild(metaText('标签：' + d.tags.join('、')));
    if (s.email) meta.appendChild(metaText('提交者：' + s.email));
    if (s.submittedAt) meta.appendChild(metaText('提交时间：' + s.submittedAt));
    if (d.website) {
      var link = document.createElement('a');
      link.href = d.website;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = d.website;
      meta.appendChild(link);
    } else {
      meta.appendChild(metaText('⚠ 未填官网链接'));
    }
    item.appendChild(meta);

    var ops = document.createElement('div');
    ops.className = 'pi-ops';
    if (s.status === '待审核') {
      ops.appendChild(mkBtn('填入表单', 'primary', function () { adoptSubmission(s); }));
      ops.appendChild(mkBtn('标记已收录', '', function () { markSubmission(s, '已收录'); }));
      ops.appendChild(mkBtn('标记已忽略', 'ghost', function () { markSubmission(s, '已忽略'); }));
    } else {
      ops.appendChild(mkBtn('填入表单', '', function () { adoptSubmission(s); }));
      ops.appendChild(mkBtn('恢复待审核', 'ghost', function () { markSubmission(s, '待审核'); }));
    }
    item.appendChild(ops);
    return item;
  }

  function renderPending() {
    var body = $('pendingBody');
    var showDone = $('showDone').checked;
    var list = state.submissions.filter(function (s) { return showDone || s.status === '待审核'; });
    setPendingCount(pendingCount());
    if (!state.submissions.length) {
      renderPendingNotice('暂无提交。别人通过在线收集表提交后会出现在这里。');
      return;
    }
    if (!list.length) {
      renderPendingNotice('没有待审核的提交（全部 ' + state.submissions.length + ' 条已处理，勾选右上角「显示已处理」可查看）。');
      return;
    }
    body.textContent = '';
    body.className = 'pending-list';
    list.forEach(function (s) { body.appendChild(pendingItem(s)); });
  }

  function adoptSubmission(s) {
    fillForm(s.draft, true);
    state.fromSubmission = { recordId: s.recordId, slug: (s.draft && s.draft.slug) || '' };
    if (s.slugTaken) {
      formMsg('slug「' + s.draft.slug + '」已被现有工具占用，请先改成新的英文标识再保存', 'err');
    } else if (!s.draft.slug) {
      formMsg('中文名无法自动生成 slug，请手填英文标识再保存', 'err');
    } else {
      formMsg('已填入表单，核对后保存；保存成功会自动在收集表标记「已收录」', 'ok');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    log('已载入提交：' + (s.draft.name || s.recordId) + '（核对后点「保存并重建站点」）', 'info');
  }

  function markSubmission(s, status) {
    if (!s.recordId) {
      log('✗ 该提交缺少 recordId，无法回写收集表状态', 'err');
      return Promise.resolve(false);
    }
    log('正在把「' + (s.draft.name || s.recordId) + '」标记为「' + status + '」 …', 'info');
    return api('/api/submissions/status', { recordId: s.recordId, status: status }).then(function (r) {
      if (!r.ok) {
        log('✗ 状态回写失败：' + (r.error || '未知错误'), 'err');
        return false;
      }
      s.status = status;
      renderPending();
      log('✓ 已在收集表标记「' + status + '」：' + (s.draft.name || s.recordId), 'ok');
      return true;
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
  $('btnRefreshSubs').addEventListener('click', function () { loadSubmissions(); });
  $('showDone').addEventListener('change', renderPending);

  fillForm(null);
  reload().then(function () {
    log('收录工作台就绪：共 ' + state.tools.length + ' 款工具。新增/编辑后会自动重建 dist/，推送后 GitHub Pages 自动部署。', 'ok');
  });
  loadSubmissions(true);
})();
