const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SEED_USERS,
  SEED_POSTS,
  normalizeRegistration,
  normalizeProfile,
  normalizePostInput,
  normalizeCommentInput,
  createPost,
  createComment,
  toggleReaction,
  publicUser,
  publicPost,
  sortPosts,
  canEdit,
} = require('./forum-core');

test('ships a connected creator-critique seed community', () => {
  assert.ok(SEED_USERS.length >= 4);
  assert.ok(SEED_POSTS.length >= 5);
  const userIds = new Set(SEED_USERS.map((user) => user.id));
  for (const post of SEED_POSTS) {
    assert.equal(userIds.has(post.authorId), true);
    assert.ok(post.tags.length >= 1 && post.tags.length <= 3);
    assert.ok(Array.isArray(post.likes));
    assert.ok(Array.isArray(post.bookmarks));
    for (const comment of post.comments) assert.equal(userIds.has(comment.authorId), true);
  }
});

test('normalizes registration fields and rejects weak or unsafe identities', () => {
  assert.deepEqual(normalizeRegistration({
    username: '  Paper_River ',
    displayName: '  纸河  ',
    bio: '  做小刊物与折页  ',
    password: 'thread73pass',
  }), {
    username: 'paper_river',
    displayName: '纸河',
    bio: '做小刊物与折页',
    password: 'thread73pass',
  });

  assert.throws(() => normalizeRegistration({ username: 'ab', displayName: '纸河', password: 'thread73pass' }), { code: 'INVALID_USERNAME' });
  assert.throws(() => normalizeRegistration({ username: 'valid_name', displayName: '<', password: 'thread73pass' }), { code: 'INVALID_DISPLAY_NAME' });
  assert.throws(() => normalizeRegistration({ username: 'valid_name', displayName: '纸河', password: 'onlyletters' }), { code: 'WEAK_PASSWORD' });
});

test('normalizes editable profiles without accepting oversized bios', () => {
  assert.deepEqual(normalizeProfile({ displayName: '  北岸 ', bio: '  记录声音现场  ' }), {
    displayName: '北岸',
    bio: '记录声音现场',
  });
  assert.throws(() => normalizeProfile({ displayName: '北岸', bio: '长'.repeat(161) }), { code: 'INVALID_BIO' });
});

test('validates and normalizes focused critique topics', () => {
  const result = normalizePostInput({
    title: '  这组海报的阅读顺序清楚吗？  ',
    body: `  我正在做一组社区电影放映海报，主标题需要先被看到，再落到日期和地点。${'补充说明'.repeat(3)}  `,
    stage: 'draft',
    focus: '  信息层级  ',
    tags: ['平面', '平面', '排版'],
  });
  assert.equal(result.title, '这组海报的阅读顺序清楚吗？');
  assert.equal(result.focus, '信息层级');
  assert.deepEqual(result.tags, ['平面', '排版']);

  assert.throws(() => normalizePostInput({ title: '太短', body: '说明'.repeat(20), stage: 'draft', focus: '层级', tags: ['平面'] }), { code: 'INVALID_TITLE' });
  assert.throws(() => normalizePostInput({ title: '一个足够明确的主题', body: '短', stage: 'draft', focus: '信息层级', tags: ['平面'] }), { code: 'INVALID_BODY' });
  assert.throws(() => normalizePostInput({ title: '一个足够明确的主题', body: '说明'.repeat(20), stage: 'unknown', focus: '信息层级', tags: ['平面'] }), { code: 'INVALID_STAGE' });
});

test('creates deterministic posts and comments with valid same-thread quotes', () => {
  const post = createPost('user_a', {
    title: '播客开场是否进入主题太慢？',
    body: '我保留了二十秒环境声，希望建立空间，但担心听众在人物出现前已经离开。',
    stage: 'prototype',
    focus: '开场节奏',
    tags: ['声音'],
  }, {
    id: () => 'post_test',
    now: () => '2026-08-31T00:00:00.000Z',
  });
  assert.equal(post.id, 'post_test');
  assert.equal(post.authorId, 'user_a');
  assert.deepEqual(post.likes, []);
  assert.deepEqual(post.comments, []);

  const first = createComment(post, 'user_b', { body: '可以把环境声压到八秒，再让第一句从声场里进入。' }, {
    id: () => 'comment_one', now: () => '2026-08-31T00:02:00.000Z',
  });
  const second = createComment(first.post, 'user_a', { body: '八秒这个锚点很具体，我会做两个版本比较。', quoteCommentId: 'comment_one' }, {
    id: () => 'comment_two', now: () => '2026-08-31T00:03:00.000Z',
  });
  assert.equal(first.comment.quoteCommentId, '');
  assert.equal(second.comment.quoteCommentId, 'comment_one');
  assert.equal(second.post.comments.length, 2);
  assert.throws(() => createComment(post, 'user_a', { body: '引用一个不存在的回复', quoteCommentId: 'missing' }), { code: 'INVALID_QUOTE' });
  assert.throws(() => normalizeCommentInput({ body: '短' }), { code: 'INVALID_COMMENT' });
});

test('toggles reactions idempotently without mutating the source', () => {
  const source = { id: 'post_a', likes: ['user_a'], bookmarks: [] };
  const removed = toggleReaction(source, 'user_a', 'likes');
  const added = toggleReaction(removed.entity, 'user_b', 'likes');
  const saved = toggleReaction(added.entity, 'user_b', 'bookmarks');

  assert.deepEqual(source.likes, ['user_a']);
  assert.equal(removed.active, false);
  assert.deepEqual(added.entity.likes, ['user_b']);
  assert.equal(saved.active, true);
  assert.deepEqual(saved.entity.bookmarks, ['user_b']);
  assert.throws(() => toggleReaction(source, 'user_a', 'shares'), { code: 'INVALID_REACTION' });
});

test('public serializers strip credentials and derive viewer flags', () => {
  const user = publicUser({ id: 'u1', username: 'maker', displayName: '造物者', bio: '简介', passwordHash: 'secret', passwordSalt: 'salt', sessionToken: 'token', createdAt: 'now' });
  assert.deepEqual(user, { id: 'u1', username: 'maker', displayName: '造物者', bio: '简介', createdAt: 'now' });

  const post = publicPost({
    id: 'p1', authorId: 'u1', title: '主题', body: '正文', stage: 'draft', focus: '层级', tags: ['平面'],
    createdAt: 'now', updatedAt: 'now', likes: ['u2'], bookmarks: ['u1'],
    internalNote: 'never expose', comments: [{ id: 'c1', authorId: 'u2', body: '回复内容', quoteCommentId: '', createdAt: 'now', likes: ['u1'], internalNote: 'hidden' }],
  }, 'u1');
  assert.equal(post.likeCount, 1);
  assert.equal(post.likedByViewer, false);
  assert.equal(post.bookmarkedByViewer, true);
  assert.equal(post.comments[0].likedByViewer, true);
  assert.equal('internalNote' in post, false);
  assert.equal('likes' in post, false);
});

test('sorts newest, hot, and unanswered views deterministically', () => {
  const posts = [
    { id: 'old-hot', createdAt: '2026-08-30T00:00:00.000Z', likes: ['a', 'b', 'c'], comments: [{ id: 'c' }] },
    { id: 'new-cold', createdAt: '2026-08-31T00:00:00.000Z', likes: [], comments: [] },
    { id: 'mid', createdAt: '2026-08-30T12:00:00.000Z', likes: ['a'], comments: [] },
  ];
  assert.deepEqual(sortPosts(posts, 'newest').map((post) => post.id), ['new-cold', 'mid', 'old-hot']);
  assert.deepEqual(sortPosts(posts, 'hot').map((post) => post.id), ['old-hot', 'mid', 'new-cold']);
  assert.deepEqual(sortPosts(posts, 'unanswered').map((post) => post.id), ['new-cold', 'mid', 'old-hot']);
  assert.deepEqual(posts.map((post) => post.id), ['old-hot', 'new-cold', 'mid']);
});

test('allows only the original author to edit content', () => {
  assert.equal(canEdit('user_a', 'user_a'), true);
  assert.equal(canEdit('user_b', 'user_a'), false);
  assert.equal(canEdit('', 'user_a'), false);
});
