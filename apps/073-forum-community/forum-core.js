(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ThreadlineCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STAGES = Object.freeze(['idea', 'draft', 'prototype', 'polish']);
  const TAGS = Object.freeze(['平面', '排版', '摄影', '声音', '游戏', '手作', '写作', '空间']);

  class DomainError extends Error {
    constructor(code, message, field) {
      super(message);
      this.name = 'DomainError';
      this.code = code;
      this.field = field || '';
    }
  }

  const text = (value) => String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  const longText = (value) => String(value == null ? '' : value).trim().replace(/\r\n?/g, '\n');
  const iso = (value) => {
    const parsed = Date.parse(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const uniqueStrings = (items) => [...new Set((Array.isArray(items) ? items : []).filter((item) => typeof item === 'string' && item))];
  const defaultId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  function normalizeRegistration(input) {
    const username = text(input && input.username).toLowerCase();
    const displayName = text(input && input.displayName);
    const bio = text(input && input.bio);
    const password = String(input && input.password || '');
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new DomainError('INVALID_USERNAME', '用户名需为 3–20 位小写字母、数字或下划线。', 'username');
    }
    if (displayName.length < 2 || displayName.length > 24 || /[<>\u0000-\u001f]/.test(displayName)) {
      throw new DomainError('INVALID_DISPLAY_NAME', '显示名需为 2–24 个可见字符。', 'displayName');
    }
    if (bio.length > 160 || /[<>\u0000-\u001f]/.test(bio)) {
      throw new DomainError('INVALID_BIO', '简介不能超过 160 字，且不能包含尖括号。', 'bio');
    }
    if (password.length < 8 || password.length > 72 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      throw new DomainError('WEAK_PASSWORD', '密码需为 8–72 位，并同时包含字母和数字。', 'password');
    }
    return { username, displayName, bio, password };
  }

  function normalizeProfile(input) {
    const displayName = text(input && input.displayName);
    const bio = text(input && input.bio);
    if (displayName.length < 2 || displayName.length > 24 || /[<>\u0000-\u001f]/.test(displayName)) {
      throw new DomainError('INVALID_DISPLAY_NAME', '显示名需为 2–24 个可见字符。', 'displayName');
    }
    if (bio.length > 160 || /[<>\u0000-\u001f]/.test(bio)) {
      throw new DomainError('INVALID_BIO', '简介不能超过 160 字，且不能包含尖括号。', 'bio');
    }
    return { displayName, bio };
  }

  function normalizePostInput(input) {
    const title = text(input && input.title);
    const body = longText(input && input.body);
    const stage = text(input && input.stage).toLowerCase();
    const focus = text(input && input.focus);
    const tags = uniqueStrings(input && input.tags).slice(0, 3);
    if (title.length < 6 || title.length > 80 || /[<>\u0000-\u001f]/.test(title)) {
      throw new DomainError('INVALID_TITLE', '标题需为 6–80 个字符。', 'title');
    }
    if (body.length < 24 || body.length > 1600 || /\u0000/.test(body)) {
      throw new DomainError('INVALID_BODY', '正文需为 24–1600 个字符。', 'body');
    }
    if (!STAGES.includes(stage)) {
      throw new DomainError('INVALID_STAGE', '请选择有效的作品阶段。', 'stage');
    }
    if (focus.length < 4 || focus.length > 60 || /[<>\u0000-\u001f]/.test(focus)) {
      throw new DomainError('INVALID_FOCUS', '请用 4–60 个字符说明希望大家重点反馈什么。', 'focus');
    }
    if (!tags.length || tags.some((tag) => !TAGS.includes(tag))) {
      throw new DomainError('INVALID_TAGS', '请选择 1–3 个有效标签。', 'tags');
    }
    return { title, body, stage, focus, tags };
  }

  function normalizeCommentInput(input) {
    const body = longText(input && input.body);
    const quoteCommentId = text(input && input.quoteCommentId);
    if (body.length < 6 || body.length > 800 || /\u0000/.test(body)) {
      throw new DomainError('INVALID_COMMENT', '回复需为 6–800 个字符。', 'body');
    }
    if (quoteCommentId && !/^[A-Za-z0-9_-]{3,80}$/.test(quoteCommentId)) {
      throw new DomainError('INVALID_QUOTE', '引用的回复无效。', 'quoteCommentId');
    }
    return { body, quoteCommentId };
  }

  function createPost(authorId, input, options) {
    const author = text(authorId);
    if (!author) throw new DomainError('AUTH_REQUIRED', '请先选择身份。');
    const normalized = normalizePostInput(input);
    const opts = options || {};
    const now = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
    const id = typeof opts.id === 'function' ? opts.id() : defaultId('post');
    return {
      id, authorId: author, ...normalized, createdAt: now, updatedAt: now,
      likes: [], bookmarks: [], comments: [],
    };
  }

  function createComment(post, authorId, input, options) {
    if (!post || !Array.isArray(post.comments)) throw new DomainError('POST_NOT_FOUND', '主题不存在。');
    const author = text(authorId);
    if (!author) throw new DomainError('AUTH_REQUIRED', '请先选择身份。');
    const normalized = normalizeCommentInput(input);
    if (normalized.quoteCommentId && !post.comments.some((comment) => comment.id === normalized.quoteCommentId)) {
      throw new DomainError('INVALID_QUOTE', '只能引用当前主题中存在的回复。', 'quoteCommentId');
    }
    const opts = options || {};
    const now = typeof opts.now === 'function' ? opts.now() : new Date().toISOString();
    const id = typeof opts.id === 'function' ? opts.id() : defaultId('comment');
    const comment = {
      id, authorId: author, body: normalized.body, quoteCommentId: normalized.quoteCommentId,
      createdAt: now, likes: [],
    };
    return {
      comment,
      post: { ...post, comments: [...post.comments, comment], updatedAt: now },
    };
  }

  function toggleReaction(entity, userId, field) {
    if (!entity || !['likes', 'bookmarks'].includes(field)) {
      throw new DomainError('INVALID_REACTION', '不支持的互动类型。');
    }
    const user = text(userId);
    if (!user) throw new DomainError('AUTH_REQUIRED', '请先选择身份。');
    const current = uniqueStrings(entity[field]);
    const active = !current.includes(user);
    const next = active ? [...current, user] : current.filter((id) => id !== user);
    return { entity: { ...entity, [field]: next }, active, count: next.length };
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: text(user.id), username: text(user.username), displayName: text(user.displayName),
      bio: text(user.bio), createdAt: text(user.createdAt),
    };
  }

  function publicComment(comment, viewerId) {
    const likes = uniqueStrings(comment && comment.likes);
    return {
      id: text(comment && comment.id), authorId: text(comment && comment.authorId),
      body: longText(comment && comment.body), quoteCommentId: text(comment && comment.quoteCommentId),
      createdAt: text(comment && comment.createdAt), likeCount: likes.length,
      likedByViewer: Boolean(viewerId && likes.includes(viewerId)),
    };
  }

  function publicPost(post, viewerId) {
    const likes = uniqueStrings(post && post.likes);
    const bookmarks = uniqueStrings(post && post.bookmarks);
    return {
      id: text(post && post.id), authorId: text(post && post.authorId), title: text(post && post.title),
      body: longText(post && post.body), stage: text(post && post.stage), focus: text(post && post.focus),
      tags: uniqueStrings(post && post.tags).slice(0, 3), createdAt: text(post && post.createdAt),
      updatedAt: text(post && post.updatedAt), likeCount: likes.length, commentCount: Array.isArray(post && post.comments) ? post.comments.length : 0,
      likedByViewer: Boolean(viewerId && likes.includes(viewerId)),
      bookmarkedByViewer: Boolean(viewerId && bookmarks.includes(viewerId)),
      comments: (Array.isArray(post && post.comments) ? post.comments : []).map((comment) => publicComment(comment, viewerId)),
    };
  }

  function sortPosts(posts, mode) {
    const next = [...(Array.isArray(posts) ? posts : [])];
    const byNewest = (a, b) => iso(b.createdAt) - iso(a.createdAt) || String(a.id).localeCompare(String(b.id));
    if (mode === 'hot') {
      return next.sort((a, b) => {
        const score = (post) => (Array.isArray(post.likes) ? uniqueStrings(post.likes).length : Number(post.likeCount || 0)) * 3 + (Array.isArray(post.comments) ? post.comments.length : Number(post.commentCount || 0)) * 2;
        return score(b) - score(a) || byNewest(a, b);
      });
    }
    if (mode === 'unanswered') {
      return next.sort((a, b) => {
        const comments = (post) => Array.isArray(post.comments) ? post.comments.length : Number(post.commentCount || 0);
        return Number(comments(a) > 0) - Number(comments(b) > 0) || byNewest(a, b);
      });
    }
    return next.sort(byNewest);
  }

  function canEdit(actorId, authorId) {
    return Boolean(actorId && authorId && actorId === authorId);
  }

  const SEED_USERS = Object.freeze([
    { id: 'user_lin', username: 'linotype', displayName: '林铅字', bio: '独立出版与信息设计，正在练习把反馈问具体。', createdAt: '2026-08-24T08:00:00.000Z' },
    { id: 'user_north', username: 'northbank', displayName: '北岸录音', bio: '记录城市声音，也做小型叙事播客。', createdAt: '2026-08-24T09:15:00.000Z' },
    { id: 'user_moss', username: 'mossframe', displayName: '苔格', bio: '摄影书、暗房和缓慢的编辑过程。', createdAt: '2026-08-25T02:20:00.000Z' },
    { id: 'user_pond', username: 'pondpixel', displayName: '池像素', bio: '一个人做叙事游戏，关心玩家在哪里真正做决定。', createdAt: '2026-08-25T05:40:00.000Z' },
  ]);

  const SEED_POSTS = Object.freeze([
    {
      id: 'post_wayfinding', authorId: 'user_lin', title: '电影放映海报的阅读顺序清楚吗？',
      body: '这是社区露天放映的第二版海报。我希望视线先落到片名，再看到周六晚八点和河岸广场；现在担心蓝色批注抢走了日期。请只看三秒，然后告诉我最先记住的两条信息。',
      stage: 'draft', focus: '三秒内的信息层级', tags: ['平面', '排版'], createdAt: '2026-08-30T13:30:00.000Z', updatedAt: '2026-08-30T15:10:00.000Z',
      likes: ['user_north', 'user_moss', 'user_pond'], bookmarks: ['user_moss'],
      comments: [
        { id: 'comment_way_1', authorId: 'user_moss', body: '第一眼是片名，第二眼却落在蓝色批注，不是日期。可以让日期和场地共用一条更硬的水平基线。', quoteCommentId: '', createdAt: '2026-08-30T14:05:00.000Z', likes: ['user_lin', 'user_pond'] },
        { id: 'comment_way_2', authorId: 'user_lin', body: '“共用水平基线”很具体，我会保留批注颜色，但把它移出主阅读路径。', quoteCommentId: 'comment_way_1', createdAt: '2026-08-30T15:10:00.000Z', likes: ['user_moss'] },
      ],
    },
    {
      id: 'post_roomtone', authorId: 'user_north', title: '播客开场的二十秒环境声是否太长？',
      body: '第一集从清晨菜市场的卷帘门开始，二十秒后人物才说话。我想先建立空间，但两位试听者都在十秒左右拿起了手机。现在有八秒、十二秒和二十秒三个版本。',
      stage: 'prototype', focus: '人物进入前的耐心阈值', tags: ['声音'], createdAt: '2026-08-30T09:20:00.000Z', updatedAt: '2026-08-30T10:40:00.000Z',
      likes: ['user_lin', 'user_pond'], bookmarks: ['user_pond', 'user_lin'],
      comments: [{ id: 'comment_room_1', authorId: 'user_pond', body: '先试十二秒，但在第五秒提前放进人物的一次呼吸或脚步，让听众知道“人”已经在场。', quoteCommentId: '', createdAt: '2026-08-30T10:40:00.000Z', likes: ['user_north'] }],
    },
    {
      id: 'post_photobook', authorId: 'user_moss', title: '摄影书中这张空房间应该留在章节末尾吗？',
      body: '这一章前面都是夜班工人的手和工具，最后突然出现一张没有人的休息室。我把它当作停顿，但也担心读者会把它理解成项目已经结束。下一章会转到清晨交班。',
      stage: 'polish', focus: '章节转场而不是全书结尾', tags: ['摄影', '排版'], createdAt: '2026-08-29T15:15:00.000Z', updatedAt: '2026-08-29T16:00:00.000Z',
      likes: ['user_lin', 'user_north'], bookmarks: ['user_lin'], comments: [],
    },
    {
      id: 'post_choice', authorId: 'user_pond', title: '玩家会意识到这里是在做一次不可逆选择吗？',
      body: '原型里玩家把最后一枚车票交给陌生人，之后便无法回到故乡。按钮现在只写“递出车票”，没有二次确认。我不想用警告框破坏叙事，但需要让代价在动作前被感知。',
      stage: 'prototype', focus: '选择前的代价提示', tags: ['游戏', '写作'], createdAt: '2026-08-29T08:05:00.000Z', updatedAt: '2026-08-30T07:30:00.000Z',
      likes: ['user_lin', 'user_north', 'user_moss'], bookmarks: ['user_north'],
      comments: [
        { id: 'comment_choice_1', authorId: 'user_lin', body: '把“最后一枚”写进按钮附近的物品标签，比弹窗更符合世界。动作仍叫递出，但库存先告诉我没有回程。', quoteCommentId: '', createdAt: '2026-08-29T09:20:00.000Z', likes: ['user_pond', 'user_moss'] },
        { id: 'comment_choice_2', authorId: 'user_north', body: '还可以让车站广播在这一刻提到末班车，代价通过环境进入，不必解释机制。', quoteCommentId: '', createdAt: '2026-08-30T07:30:00.000Z', likes: ['user_pond'] },
      ],
    },
    {
      id: 'post_binding', authorId: 'user_lin', title: '手工装订说明是否还缺一个关键动作？',
      body: '我把八页小册子的骑马钉替换成棉线装订，说明卡只有折页、打孔、穿线、打结四步。测试者能完成，但成品经常在书脊顶部留下松线。',
      stage: 'draft', focus: '新手最容易漏掉的动作', tags: ['手作', '排版'], createdAt: '2026-08-28T11:45:00.000Z', updatedAt: '2026-08-28T11:45:00.000Z',
      likes: ['user_moss'], bookmarks: [], comments: [],
    },
  ]);

  return {
    STAGES, TAGS, SEED_USERS, SEED_POSTS, DomainError, normalizeRegistration, normalizeProfile,
    normalizePostInput, normalizeCommentInput, createPost, createComment, toggleReaction,
    publicUser, publicPost, sortPosts, canEdit,
  };
});
