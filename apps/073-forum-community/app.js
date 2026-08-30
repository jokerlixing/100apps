(function () {
  'use strict';

  const core = window.ThreadlineCore;
  if (!core) throw new Error('THREADLINE/73 core failed to load');

  const LOCAL_KEY = 'threadline73_forum_v1';
  const TOKEN_KEY = 'threadline73_session_v1';
  const offline = new URLSearchParams(location.search).get('offline') === '1';
  const stageLabels = { idea: '想法', draft: '草稿', prototype: '原型', polish: '收尾' };
  const sortLabels = { newest: '最新优先', hot: '回应热度', unanswered: '待回应优先' };
  const state = {
    mode: 'checking', modeReason: '', users: [], posts: [], currentUser: null,
    sort: 'newest', tag: '', query: '', activePostId: '', quoteCommentId: '',
    authMode: 'login', token: readToken(), toastTimer: 0,
  };

  const $ = (id) => document.getElementById(id);
  const ui = {
    modeLight: $('modeLight'), modeLabel: $('modeLabel'), modeCopy: $('modeCopy'),
    identityButton: $('identityButton'), headerAvatar: $('headerAvatar'), headerMode: $('headerMode'), headerName: $('headerName'),
    searchInput: $('searchInput'), sortControls: $('sortControls'), tagFilters: $('tagFilters'), clearFiltersButton: $('clearFiltersButton'),
    resultCount: $('resultCount'), activeFilter: $('activeFilter'), threadList: $('threadList'), publishButton: $('publishButton'),
    profileAvatar: $('profileAvatar'), profileName: $('profileName'), profileHandle: $('profileHandle'), profileBio: $('profileBio'),
    profilePosts: $('profilePosts'), profileReplies: $('profileReplies'), profileBookmarks: $('profileBookmarks'), profileActionButton: $('profileActionButton'),
    communityUsers: $('communityUsers'), communityReplies: $('communityReplies'), communityOpen: $('communityOpen'),
    threadDialog: $('threadDialog'), threadDialogTitle: $('threadDialogTitle'), threadCloseButton: $('threadCloseButton'), threadDetail: $('threadDetail'),
    replyForm: $('replyForm'), replyBody: $('replyBody'), replyMessage: $('replyMessage'), replySubmitButton: $('replySubmitButton'),
    quotePreview: $('quotePreview'), quotePreviewText: $('quotePreviewText'), clearQuoteButton: $('clearQuoteButton'),
    publishDialog: $('publishDialog'), publishForm: $('publishForm'), publishCloseButton: $('publishCloseButton'), publishMessage: $('publishMessage'),
    publishSubmitButton: $('publishSubmitButton'), postTagPicker: $('postTagPicker'),
    authDialog: $('authDialog'), authForm: $('authForm'), authCloseButton: $('authCloseButton'), authKicker: $('authKicker'), authDialogTitle: $('authDialogTitle'),
    authTabs: $('authTabs'), authExplainer: $('authExplainer'), localIdentitySection: $('localIdentitySection'), identityList: $('identityList'),
    authUsername: $('authUsername'), authDisplayName: $('authDisplayName'), authBio: $('authBio'), authPassword: $('authPassword'),
    authMessage: $('authMessage'), authSubmitButton: $('authSubmitButton'), toast: $('toast'),
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }
  function safeId(value) { return escapeHtml(String(value || '').replace(/[^A-Za-z0-9_-]/g, '')); }
  function initials(name) { return String(name || '访').trim().slice(0, 1).toUpperCase(); }
  function randomId(prefix) {
    const random = window.crypto && typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return `${prefix}_${random.slice(0, 24)}`;
  }
  function readToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (_) { return ''; } }
  function writeToken(token) {
    state.token = token || '';
    try { state.token ? localStorage.setItem(TOKEN_KEY, state.token) : localStorage.removeItem(TOKEN_KEY); } catch (_) { /* keep in memory */ }
  }
  function readLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY));
      if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.posts)) return parsed;
    } catch (_) { /* reset malformed state */ }
    return { users: clone(core.SEED_USERS), posts: clone(core.SEED_POSTS), currentUserId: core.SEED_USERS[0].id };
  }
  function saveLocal() {
    if (state.mode !== 'local') return;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ users: state.users, posts: state.posts, currentUserId: state.currentUser && state.currentUser.id || '' }));
    } catch (_) { showToast('浏览器没有允许保存，本次改动只在当前页面有效。'); }
  }
  function userById(id) { return state.users.find((user) => user.id === id) || null; }
  function authorLabel(id) { const user = userById(id); return user ? user.displayName : '未知创作者'; }
  function viewPost(post) { return state.mode === 'local' ? core.publicPost(post, state.currentUser && state.currentUser.id) : post; }
  function allViewPosts() { return state.posts.map(viewPost); }
  function sourcePost(id) { return state.posts.find((post) => post.id === id) || null; }
  function visiblePosts() {
    const query = state.query.trim().toLocaleLowerCase('zh-CN');
    const filtered = allViewPosts().filter((post) => {
      const author = authorLabel(post.authorId);
      const haystack = `${post.title} ${post.body} ${post.focus} ${post.tags.join(' ')} ${author}`.toLocaleLowerCase('zh-CN');
      return (!state.tag || post.tags.includes(state.tag)) && (!query || haystack.includes(query));
    });
    return core.sortPosts(filtered, state.sort);
  }
  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '时间未知';
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function renderMode() {
    ui.modeLight.className = `mode-light ${state.mode === 'checking' ? '' : state.mode}`;
    if (state.mode === 'server') {
      ui.modeLabel.textContent = '共享社区'; ui.modeCopy.textContent = '账号与主题由本机 Node 服务持久化。';
    } else if (state.mode === 'local') {
      ui.modeLabel.textContent = '本地演示'; ui.modeCopy.textContent = state.modeReason || '身份与内容只保存在这个浏览器。';
    } else {
      ui.modeLabel.textContent = '正在检查服务'; ui.modeCopy.textContent = '正在确认是否有共享社区服务。';
    }
  }

  function renderFilters() {
    ui.tagFilters.innerHTML = core.TAGS.map((tag) => `<button type="button" data-tag="${escapeHtml(tag)}" aria-pressed="${state.tag === tag}">${escapeHtml(tag)}</button>`).join('');
    [...ui.sortControls.querySelectorAll('[data-sort]')].forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.sort === state.sort)));
    const picked = new Set([...ui.postTagPicker.querySelectorAll('input:checked')].map((input) => input.value));
    ui.postTagPicker.innerHTML = core.TAGS.map((tag) => `<label><input type="checkbox" name="tags" value="${escapeHtml(tag)}" ${picked.has(tag) ? 'checked' : ''}><span>${escapeHtml(tag)}</span></label>`).join('');
  }

  function renderIdentity() {
    const user = state.currentUser;
    ui.headerAvatar.textContent = initials(user && user.displayName);
    ui.headerMode.textContent = state.mode === 'server' ? '共享账号' : state.mode === 'local' ? '本地演示身份' : '正在连接';
    ui.headerName.textContent = user ? user.displayName : '选择身份';
    ui.profileAvatar.textContent = initials(user && user.displayName);
    ui.profileName.textContent = user ? user.displayName : '尚未选择身份';
    ui.profileHandle.textContent = user ? `@${user.username}` : (state.mode === 'server' ? '登录或创建账号' : '本地演示可立即开始');
    ui.profileBio.textContent = user && user.bio || '选择或创建一个身份后，可以发布、回复、点赞和收藏。';
    const posts = allViewPosts();
    if (user) {
      ui.profilePosts.textContent = posts.filter((post) => post.authorId === user.id).length;
      ui.profileReplies.textContent = posts.reduce((sum, post) => sum + post.comments.filter((comment) => comment.authorId === user.id).length, 0);
      ui.profileBookmarks.textContent = posts.filter((post) => post.bookmarkedByViewer).length;
    } else {
      ui.profilePosts.textContent = '—'; ui.profileReplies.textContent = '—'; ui.profileBookmarks.textContent = '—';
    }
    ui.profileActionButton.textContent = user ? (state.mode === 'server' ? '账号与退出' : '切换身份') : (state.mode === 'server' ? '登录 / 创建账号' : '选择身份');
  }

  function renderCommunityStats() {
    const posts = allViewPosts();
    ui.communityUsers.textContent = state.users.length;
    ui.communityReplies.textContent = posts.reduce((sum, post) => sum + post.comments.length, 0);
    ui.communityOpen.textContent = posts.filter((post) => post.comments.length === 0).length;
  }

  function threadCard(post) {
    const author = userById(post.authorId);
    return `<article class="thread-card ${state.activePostId === post.id ? 'is-active' : ''}" data-post-id="${safeId(post.id)}">
      <div class="thread-card-top"><span class="thread-stage">${escapeHtml(stageLabels[post.stage] || post.stage)}</span><time class="thread-time" datetime="${escapeHtml(post.createdAt)}">${escapeHtml(formatTime(post.createdAt))}</time></div>
      <h2><button type="button" data-action="open" data-post-id="${safeId(post.id)}">${escapeHtml(post.title)}</button></h2>
      <p class="thread-summary">${escapeHtml(post.body)}</p>
      <p class="focus-note"><b>请看这里</b>${escapeHtml(post.focus)}</p>
      <div class="thread-tags">${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
      <footer class="thread-card-foot">
        <div class="author-line"><span class="mini-avatar">${escapeHtml(initials(author && author.displayName))}</span><span><b>${escapeHtml(author && author.displayName || '未知创作者')}</b><small>@${escapeHtml(author && author.username || 'unknown')}</small></span></div>
        <div class="thread-actions">
          <button class="text-action ${post.likedByViewer ? 'active' : ''}" type="button" data-action="like" data-post-id="${safeId(post.id)}" aria-pressed="${post.likedByViewer}">赞 ${post.likeCount}</button>
          <button class="text-action" type="button" data-action="open" data-post-id="${safeId(post.id)}">回应 ${post.comments.length}</button>
          <button class="text-action ${post.bookmarkedByViewer ? 'active' : ''}" type="button" data-action="bookmark" data-post-id="${safeId(post.id)}" aria-pressed="${post.bookmarkedByViewer}">${post.bookmarkedByViewer ? '已收藏' : '收藏'}</button>
        </div>
      </footer>
    </article>`;
  }

  function renderThreads() {
    const posts = visiblePosts();
    ui.resultCount.textContent = posts.length;
    ui.activeFilter.textContent = `${state.tag || '全部作品'} · ${sortLabels[state.sort]}${state.query ? ` · “${state.query}”` : ''}`;
    ui.threadList.innerHTML = posts.length ? posts.map(threadCard).join('') : `<div class="empty-feed"><b>这条线上暂时没有主题</b><p>换一个标签或关键词，回到工作台继续找。</p><button type="button" data-action="clear">清除筛选</button></div>`;
  }

  function renderAll() {
    renderMode(); renderFilters(); renderIdentity(); renderCommunityStats(); renderThreads();
    if (ui.threadDialog.open && state.activePostId) renderThreadDetail();
  }

  function commentMarkup(comment, post) {
    const author = userById(comment.authorId);
    const quoted = comment.quoteCommentId ? post.comments.find((item) => item.id === comment.quoteCommentId) : null;
    return `<article class="comment-card ${quoted ? 'quoted' : ''}" data-comment-id="${safeId(comment.id)}">
      <div class="comment-author"><b>${escapeHtml(author && author.displayName || '未知创作者')} <small>@${escapeHtml(author && author.username || 'unknown')}</small></b><time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(formatTime(comment.createdAt))}</time></div>
      ${quoted ? `<div class="quote-block">引用 ${escapeHtml(authorLabel(quoted.authorId))}：${escapeHtml(quoted.body.slice(0, 120))}</div>` : ''}
      <p>${escapeHtml(comment.body)}</p>
      <div class="comment-actions"><button type="button" data-detail-action="quote" data-comment-id="${safeId(comment.id)}">引用回应</button><button type="button" data-detail-action="comment-like" data-comment-id="${safeId(comment.id)}" aria-pressed="${comment.likedByViewer}">${comment.likedByViewer ? '已赞' : '赞'} ${comment.likeCount}</button></div>
    </article>`;
  }

  function renderThreadDetail() {
    const source = sourcePost(state.activePostId);
    if (!source) { closeDialog(ui.threadDialog); return; }
    const post = viewPost(source);
    const author = userById(post.authorId);
    ui.threadDialogTitle.textContent = post.title;
    ui.threadDetail.innerHTML = `<article class="thread-detail-main">
      <div class="detail-head"><div><span class="eyebrow">${escapeHtml(author && author.displayName || '未知创作者')} · ${escapeHtml(formatTime(post.createdAt))}</span><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.body)}</p></div><span class="detail-stage">${escapeHtml(stageLabels[post.stage] || post.stage)}</span></div>
      <div class="detail-focus"><small>这次希望大家重点看</small><b>${escapeHtml(post.focus)}</b></div>
      <div class="thread-tags">${post.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="detail-meta"><div class="author-line"><span class="mini-avatar">${escapeHtml(initials(author && author.displayName))}</span><span><b>${escapeHtml(author && author.displayName || '未知创作者')}</b><small>@${escapeHtml(author && author.username || 'unknown')}</small></span></div><div class="detail-actions"><button class="${post.likedByViewer ? 'active' : ''}" type="button" data-detail-action="like" aria-pressed="${post.likedByViewer}">赞 ${post.likeCount}</button><button class="${post.bookmarkedByViewer ? 'active' : ''}" type="button" data-detail-action="bookmark" aria-pressed="${post.bookmarkedByViewer}">${post.bookmarkedByViewer ? '已收藏' : '收藏主题'}</button></div></div>
    </article>
    <section class="comment-section" aria-labelledby="commentHeading"><h3 class="comment-heading" id="commentHeading">${post.comments.length} 条公开回应</h3>${post.comments.length ? post.comments.map((comment) => commentMarkup(comment, post)).join('') : '<div class="empty-comments">还没有回应。先写下你观察到的一个具体细节。</div>'}</section>`;
    const quote = state.quoteCommentId && post.comments.find((comment) => comment.id === state.quoteCommentId);
    ui.quotePreview.hidden = !quote;
    ui.quotePreviewText.textContent = quote ? `${authorLabel(quote.authorId)}：${quote.body}` : '';
  }

  function clearErrors(form) {
    form.querySelectorAll('[data-error-for]').forEach((element) => { element.textContent = ''; });
  }
  function showFieldError(form, error) {
    const field = error && error.field;
    const target = field && form.querySelector(`[data-error-for="${field}"]`);
    if (target) target.textContent = error.message;
  }
  function showToast(message) {
    clearTimeout(state.toastTimer); ui.toast.textContent = message; ui.toast.classList.add('show');
    state.toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2600);
  }
  function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
  function closeDialog(dialog) { if (dialog.open) dialog.close(); }
  function setBusy(button, busy) { button.disabled = busy; button.setAttribute('aria-busy', String(busy)); }
  function ensureIdentity() {
    if (state.currentUser) return true;
    openAuth(); showToast('先选择一个身份，草稿会留在这里。'); return false;
  }

  async function api(path, options) {
    const settings = options || {};
    const headers = { Accept: 'application/json', ...(settings.body ? { 'Content-Type': 'application/json' } : {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(path.replace(/^\//, ''), { ...settings, headers: { ...headers, ...(settings.headers || {}) }, body: settings.body ? JSON.stringify(settings.body) : undefined });
    let payload = {};
    try { payload = await response.json(); } catch (_) { /* stable fallback below */ }
    if (!response.ok) {
      if (response.status === 401) { writeToken(''); state.currentUser = null; }
      const error = new Error(payload.message || '社区服务暂时没有完成这个操作。');
      error.code = payload.code || `HTTP_${response.status}`; error.field = payload.field || '';
      throw error;
    }
    return payload;
  }

  async function bootstrapServer(signal) {
    const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
    const response = await fetch('api/bootstrap', { headers, signal });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) throw new Error('API unavailable');
    const payload = await response.json();
    state.mode = 'server'; state.modeReason = ''; state.users = payload.users || []; state.posts = payload.posts || []; state.currentUser = payload.currentUser || null;
  }
  function loadLocal(reason) {
    const local = readLocal();
    state.mode = 'local'; state.modeReason = reason || '身份与内容只保存在这个浏览器。';
    state.users = local.users; state.posts = local.posts; state.currentUser = local.users.find((user) => user.id === local.currentUserId) || local.users[0] || null;
    saveLocal();
  }
  async function initialize() {
    renderFilters(); renderAll();
    if (offline) { loadLocal('已强制使用本地演示；内容不会离开这个浏览器。'); renderAll(); document.body.classList.add('ready'); return; }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    try { await bootstrapServer(controller.signal); }
    catch (_) { loadLocal('公开页面使用本地演示；内容不会离开这个浏览器。'); }
    finally { clearTimeout(timeout); renderAll(); document.body.classList.add('ready'); }
  }

  async function togglePostReaction(postId, type) {
    if (!ensureIdentity()) return;
    try {
      if (state.mode === 'local') {
        const index = state.posts.findIndex((post) => post.id === postId);
        if (index < 0) return;
        const field = type === 'like' ? 'likes' : 'bookmarks';
        state.posts[index] = core.toggleReaction(state.posts[index], state.currentUser.id, field).entity;
        saveLocal();
      } else {
        const payload = await api(`api/posts/${encodeURIComponent(postId)}/reactions`, { method: 'POST', body: { type } });
        const index = state.posts.findIndex((post) => post.id === postId);
        if (index >= 0) state.posts[index] = payload.post;
      }
      renderAll();
    } catch (error) { showToast(error.message); renderAll(); }
  }

  async function toggleCommentLike(commentId) {
    if (!ensureIdentity()) return;
    const postId = state.activePostId;
    try {
      if (state.mode === 'local') {
        const postIndex = state.posts.findIndex((post) => post.id === postId);
        const commentIndex = postIndex >= 0 ? state.posts[postIndex].comments.findIndex((comment) => comment.id === commentId) : -1;
        if (commentIndex < 0) return;
        const result = core.toggleReaction(state.posts[postIndex].comments[commentIndex], state.currentUser.id, 'likes');
        state.posts[postIndex].comments[commentIndex] = result.entity; saveLocal();
      } else {
        const payload = await api(`api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/like`, { method: 'POST', body: {} });
        const index = state.posts.findIndex((post) => post.id === postId); if (index >= 0) state.posts[index] = payload.post;
      }
      renderAll();
    } catch (error) { showToast(error.message); renderAll(); }
  }

  function openThread(postId) {
    if (!sourcePost(postId)) return;
    state.activePostId = postId; state.quoteCommentId = ''; ui.replyBody.value = ''; ui.replyMessage.textContent = '';
    renderThreads(); renderThreadDetail(); openDialog(ui.threadDialog);
  }
  function openPublish() {
    if (!ensureIdentity()) return;
    ui.publishMessage.textContent = ''; clearErrors(ui.publishForm); openDialog(ui.publishDialog); $('postTitle').focus();
  }
  function openAuth() {
    ui.authMessage.textContent = ''; clearErrors(ui.authForm); renderAuthDialog(); openDialog(ui.authDialog);
  }

  function renderAuthDialog() {
    const server = state.mode === 'server';
    const accountOpen = server && Boolean(state.currentUser);
    ui.authKicker.textContent = server ? 'IDENTITY / 共享账号' : 'IDENTITY / 本地演示';
    ui.authDialogTitle.textContent = server ? (state.currentUser ? '账号与会话' : '进入共享工作台') : '选择你的工作台身份';
    ui.localIdentitySection.hidden = server;
    ui.authTabs.hidden = !server || Boolean(state.currentUser);
    ui.authForm.querySelectorAll('.server-only').forEach((element) => { element.hidden = !server; });
    ui.authForm.querySelectorAll('.register-only').forEach((element) => { element.hidden = server && state.authMode === 'login'; });
    ui.authPassword.required = server && !state.currentUser;
    ui.authDisplayName.required = !server || state.authMode === 'register';
    [ui.authUsername, ui.authDisplayName, ui.authBio, ui.authPassword].forEach((field) => { field.disabled = accountOpen; });
    if (!server) {
      ui.authExplainer.textContent = '本地身份只保存在这个浏览器，不需要真实邮箱或密码。';
      ui.authSubmitButton.textContent = '创建本地身份 ↗';
      ui.identityList.innerHTML = state.users.map((user) => `<button class="identity-choice ${state.currentUser && state.currentUser.id === user.id ? 'active' : ''}" type="button" data-identity-id="${safeId(user.id)}"><span class="mini-avatar">${escapeHtml(initials(user.displayName))}</span><span><b>${escapeHtml(user.displayName)}</b><small>@${escapeHtml(user.username)}</small></span></button>`).join('');
    } else if (state.currentUser) {
      ui.authExplainer.textContent = `当前以 ${state.currentUser.displayName}（@${state.currentUser.username}）登录。退出不会删除已发布的公开内容。`;
      ui.authSubmitButton.textContent = '退出共享账号';
      ui.authForm.querySelector('.auth-fields').hidden = true;
    } else {
      ui.authForm.querySelector('.auth-fields').hidden = false;
      ui.authExplainer.textContent = state.authMode === 'login' ? '登录到这个 Node 演示服务。会话只存于当前浏览器。' : '创建账号无需邮箱；请勿使用真实密码，这只是本地作品集服务。';
      ui.authSubmitButton.textContent = state.authMode === 'login' ? '登录共享账号 ↗' : '创建共享账号 ↗';
      [...ui.authTabs.querySelectorAll('[data-auth-mode]')].forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.authMode === state.authMode)));
    }
  }

  async function handlePublish(event) {
    event.preventDefault(); if (!ensureIdentity()) return;
    clearErrors(ui.publishForm); ui.publishMessage.textContent = '';
    const formData = new FormData(ui.publishForm);
    const input = { title: formData.get('title'), body: formData.get('body'), stage: formData.get('stage'), focus: formData.get('focus'), tags: formData.getAll('tags') };
    setBusy(ui.publishSubmitButton, true);
    try {
      const normalized = core.normalizePostInput(input);
      let created;
      if (state.mode === 'local') {
        created = core.createPost(state.currentUser.id, normalized, { id: () => randomId('post') }); state.posts.push(created); saveLocal();
      } else {
        const payload = await api('api/posts', { method: 'POST', body: { ...normalized, idempotencyKey: randomId('publish') } }); created = payload.post; state.posts.unshift(created);
      }
      ui.publishForm.reset(); renderFilters(); closeDialog(ui.publishDialog); renderAll(); openThread(created.id); showToast('评审主题已发布。');
    } catch (error) { ui.publishMessage.textContent = error.message; showFieldError(ui.publishForm, error); }
    finally { setBusy(ui.publishSubmitButton, false); }
  }

  async function handleReply(event) {
    event.preventDefault(); if (!ensureIdentity()) return;
    ui.replyMessage.textContent = ''; setBusy(ui.replySubmitButton, true);
    try {
      const input = core.normalizeCommentInput({ body: ui.replyBody.value, quoteCommentId: state.quoteCommentId });
      if (state.mode === 'local') {
        const index = state.posts.findIndex((post) => post.id === state.activePostId); if (index < 0) throw new Error('主题已经不在工作台上。');
        state.posts[index] = core.createComment(state.posts[index], state.currentUser.id, input, { id: () => randomId('comment') }).post; saveLocal();
      } else {
        const payload = await api(`api/posts/${encodeURIComponent(state.activePostId)}/comments`, { method: 'POST', body: { ...input, idempotencyKey: randomId('reply') } });
        const index = state.posts.findIndex((post) => post.id === state.activePostId); if (index >= 0) state.posts[index] = payload.post;
      }
      ui.replyBody.value = ''; state.quoteCommentId = ''; renderAll(); showToast('回应已发布。');
    } catch (error) { ui.replyMessage.textContent = error.message; }
    finally { setBusy(ui.replySubmitButton, false); }
  }

  async function handleAuth(event) {
    event.preventDefault(); clearErrors(ui.authForm); ui.authMessage.textContent = ''; setBusy(ui.authSubmitButton, true);
    try {
      if (state.mode === 'local') {
        const normalized = core.normalizeRegistration({ username: ui.authUsername.value, displayName: ui.authDisplayName.value, bio: ui.authBio.value, password: 'local73pass1' });
        if (state.users.some((user) => user.username === normalized.username)) throw Object.assign(new Error('这个本地用户名已存在，可以直接从上方选择。'), { code: 'USERNAME_TAKEN', field: 'username' });
        const user = { id: randomId('user'), username: normalized.username, displayName: normalized.displayName, bio: normalized.bio, createdAt: new Date().toISOString() };
        state.users.push(user); state.currentUser = user; saveLocal(); ui.authForm.reset(); closeDialog(ui.authDialog); renderAll(); showToast(`已创建本地身份：${user.displayName}`);
      } else if (state.currentUser) {
        try { await api('api/logout', { method: 'POST', body: {} }); } catch (_) { /* clear local session regardless */ }
        writeToken(''); state.currentUser = null; closeDialog(ui.authDialog); renderAll(); showToast('已退出共享账号。');
      } else {
        const body = { username: ui.authUsername.value, password: ui.authPassword.value };
        if (state.authMode === 'register') { body.displayName = ui.authDisplayName.value; body.bio = ui.authBio.value; }
        const payload = await api(`api/${state.authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', body });
        writeToken(payload.token); await bootstrapServer(); ui.authForm.reset(); closeDialog(ui.authDialog); renderAll(); showToast(state.authMode === 'register' ? '共享账号已创建。' : '已登录共享工作台。');
      }
    } catch (error) { ui.authMessage.textContent = error.message; showFieldError(ui.authForm, error); }
    finally { setBusy(ui.authSubmitButton, false); renderAuthDialog(); }
  }

  ui.searchInput.addEventListener('input', () => { state.query = ui.searchInput.value; renderThreads(); });
  ui.sortControls.addEventListener('click', (event) => { const button = event.target.closest('[data-sort]'); if (!button) return; state.sort = button.dataset.sort; renderFilters(); renderThreads(); });
  ui.tagFilters.addEventListener('click', (event) => { const button = event.target.closest('[data-tag]'); if (!button) return; state.tag = state.tag === button.dataset.tag ? '' : button.dataset.tag; renderFilters(); renderThreads(); });
  function clearFilters() { state.query = ''; state.tag = ''; state.sort = 'newest'; ui.searchInput.value = ''; renderFilters(); renderThreads(); }
  ui.clearFiltersButton.addEventListener('click', clearFilters);
  ui.threadList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]'); if (!button) return;
    if (button.dataset.action === 'clear') clearFilters();
    else if (button.dataset.action === 'open') openThread(button.dataset.postId);
    else if (button.dataset.action === 'like') togglePostReaction(button.dataset.postId, 'like');
    else if (button.dataset.action === 'bookmark') togglePostReaction(button.dataset.postId, 'bookmark');
  });
  ui.threadDetail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail-action]'); if (!button) return;
    if (button.dataset.detailAction === 'like') togglePostReaction(state.activePostId, 'like');
    else if (button.dataset.detailAction === 'bookmark') togglePostReaction(state.activePostId, 'bookmark');
    else if (button.dataset.detailAction === 'comment-like') toggleCommentLike(button.dataset.commentId);
    else if (button.dataset.detailAction === 'quote') { state.quoteCommentId = button.dataset.commentId; renderThreadDetail(); ui.replyBody.focus(); }
  });
  ui.clearQuoteButton.addEventListener('click', () => { state.quoteCommentId = ''; renderThreadDetail(); ui.replyBody.focus(); });
  ui.publishButton.addEventListener('click', openPublish); ui.publishForm.addEventListener('submit', handlePublish); ui.replyForm.addEventListener('submit', handleReply);
  ui.identityButton.addEventListener('click', openAuth); ui.profileActionButton.addEventListener('click', openAuth); ui.authForm.addEventListener('submit', handleAuth);
  ui.identityList.addEventListener('click', (event) => { const button = event.target.closest('[data-identity-id]'); if (!button) return; state.currentUser = userById(button.dataset.identityId); saveLocal(); closeDialog(ui.authDialog); renderAll(); showToast(`已切换为 ${state.currentUser.displayName}`); });
  ui.authTabs.addEventListener('click', (event) => { const button = event.target.closest('[data-auth-mode]'); if (!button) return; state.authMode = button.dataset.authMode; renderAuthDialog(); });
  ui.publishCloseButton.addEventListener('click', () => closeDialog(ui.publishDialog)); ui.authCloseButton.addEventListener('click', () => closeDialog(ui.authDialog)); ui.threadCloseButton.addEventListener('click', () => closeDialog(ui.threadDialog));
  [ui.publishDialog, ui.authDialog, ui.threadDialog].forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) closeDialog(dialog); }));
  ui.postTagPicker.addEventListener('change', () => { const checked = [...ui.postTagPicker.querySelectorAll('input:checked')]; if (checked.length > 3) { checked[checked.length - 1].checked = false; showToast('最多选择 3 个作品标签。'); } });

  initialize();
})();
