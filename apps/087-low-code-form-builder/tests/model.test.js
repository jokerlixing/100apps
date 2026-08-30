const test = require('node:test');
const assert = require('node:assert/strict');

const Model = require('../model.js');

test('creates type-specific fields without sharing option arrays', () => {
  const first = Model.createField('select');
  const second = Model.createField('select');

  assert.equal(first.type, 'select');
  assert.equal(first.label, '下拉选择');
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.options, second.options);
  assert.deepEqual(first.options, ['选项 1', '选项 2', '选项 3']);
});

test('starter schema contains a useful registration form', () => {
  const schema = Model.createStarterSchema();

  assert.equal(schema.version, 1);
  assert.match(schema.title, /报名/);
  assert.ok(schema.fields.length >= 5);
  assert.ok(schema.fields.some((field) => field.type === 'email'));
  assert.ok(schema.fields.some((field) => field.required));
});

test('sanitizes imported schemas and repairs duplicate ids', () => {
  const schema = Model.sanitizeSchema({
    title: '  <script>报名表</script>  ',
    description: 42,
    submitLabel: '',
    fields: [
      { id: 'same id', type: 'text', label: '  姓名  ', width: 'half' },
      { id: 'same id', type: 'select', label: '', options: ['A', 'A', ' ', 'B'] },
      { id: 'bad', type: 'unknown', label: 'ignore me' },
    ],
  });

  assert.equal(schema.title, '<script>报名表</script>');
  assert.equal(schema.description, '');
  assert.equal(schema.submitLabel, '提交表单');
  assert.equal(schema.fields.length, 2);
  assert.notEqual(schema.fields[0].id, schema.fields[1].id);
  assert.equal(schema.fields[0].width, 'half');
  assert.deepEqual(schema.fields[1].options, ['A', 'B']);
});

test('adds, updates, duplicates, moves and removes fields immutably', () => {
  const base = Model.sanitizeSchema({ title: '测试', fields: [] });
  const withText = Model.addField(base, 'text');
  const textId = withText.fields[0].id;
  const updated = Model.updateField(withText, textId, { label: '联系人', required: true });
  const duplicated = Model.duplicateField(updated, textId);
  const duplicateId = duplicated.fields[1].id;
  const moved = Model.moveField(duplicated, duplicateId, 0);
  const removed = Model.removeField(moved, textId);

  assert.equal(base.fields.length, 0);
  assert.equal(updated.fields[0].label, '联系人');
  assert.equal(updated.fields[0].required, true);
  assert.match(duplicated.fields[1].label, /副本/);
  assert.equal(moved.fields[0].id, duplicateId);
  assert.deepEqual(removed.fields.map((field) => field.id), [duplicateId]);
});

test('parses, trims, de-duplicates and limits options', () => {
  const source = Array.from({ length: 20 }, (_, index) => ` 选项 ${index + 1} `).join('\n');
  const options = Model.parseOptions(`${source}\n选项 1\n`);

  assert.equal(options.length, 12);
  assert.equal(options[0], '选项 1');
  assert.equal(options[11], '选项 12');
  assert.deepEqual(Model.parseOptions(' \n '), ['选项 1', '选项 2']);
});

test('validates required, email, numeric bounds and checkbox groups', () => {
  const schema = Model.sanitizeSchema({
    title: '验收',
    fields: [
      { id: 'name', type: 'text', label: '姓名', required: true },
      { id: 'mail', type: 'email', label: '邮箱', required: true },
      { id: 'count', type: 'number', label: '人数', min: 1, max: 4 },
      { id: 'topics', type: 'checkbox', label: '主题', options: ['A', 'B'], required: true },
      { id: 'intro', type: 'heading', label: '说明' },
    ],
  });
  const result = Model.validateSubmission(schema, {
    name: ' ',
    mail: 'not-an-email',
    count: '9',
    topics: [],
    intro: 'ignored',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.name, /必填/);
  assert.match(result.errors.mail, /邮箱/);
  assert.match(result.errors.count, /4/);
  assert.match(result.errors.topics, /至少选择/);
  assert.equal('intro' in result.data, false);
});

test('normalizes a valid submission', () => {
  const schema = Model.sanitizeSchema({
    fields: [
      { id: 'mail', type: 'email', label: '邮箱', required: true },
      { id: 'count', type: 'number', label: '人数', min: 1, max: 4 },
      { id: 'topics', type: 'checkbox', label: '主题', options: ['A', 'B'] },
    ],
  });
  const result = Model.validateSubmission(schema, {
    mail: '  demo@example.com ',
    count: '3',
    topics: ['A'],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.data.mail, 'demo@example.com');
  assert.equal(result.data.count, 3);
  assert.deepEqual(result.data.topics, ['A']);
});

test('serializes and deserializes through the sanitized schema boundary', () => {
  const source = Model.createStarterSchema();
  const json = Model.serializeSchema(source);
  const restored = Model.deserializeSchema(json);

  assert.deepEqual(restored, source);
  assert.throws(() => Model.deserializeSchema('{bad json'), /JSON/);
});

test('creates filesystem-safe export names', () => {
  assert.equal(Model.safeFileName('  夏日活动 / 报名表  '), '夏日活动-报名表');
  assert.equal(Model.safeFileName('***'), 'jig-87-form');
  assert.equal(Model.safeFileName('A'.repeat(90)).length, 48);
});

test('generates self-contained escaped HTML with validation hooks', () => {
  const schema = Model.sanitizeSchema({
    title: '</title><script>alert(1)</script>',
    description: '<img src=x onerror=alert(1)>',
    submitLabel: '发送',
    fields: [
      { id: 'name', type: 'text', label: '<b>姓名</b>', required: true },
      { id: 'choice', type: 'radio', label: '方向', options: ['A', '<script>B</script>'] },
    ],
  });
  const html = Model.generateStandaloneHtml(schema);

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /data-jig-export="1"/);
  assert.match(html, /required/);
  assert.match(html, /提交成功/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;b&gt;姓名&lt;\/b&gt;/);
});
