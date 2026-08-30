(function initFormModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FormModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFormModel() {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MAX_FIELDS = 60;
  const MAX_OPTIONS = 12;
  let idSequence = 0;

  const FIELD_TYPES = Object.freeze({
    text: { label: '单行文本', icon: 'Aa', placeholder: '请输入内容' },
    email: { label: '邮箱地址', icon: '@', placeholder: 'name@example.com' },
    number: { label: '数字', icon: '12', placeholder: '请输入数字' },
    textarea: { label: '长文本', icon: '¶', placeholder: '请输入详细内容' },
    select: { label: '下拉选择', icon: '⌄', options: ['选项 1', '选项 2', '选项 3'] },
    radio: { label: '单项选择', icon: '◉', options: ['选项 1', '选项 2', '选项 3'] },
    checkbox: { label: '多项选择', icon: '☑', options: ['选项 1', '选项 2', '选项 3'] },
    date: { label: '日期', icon: '日', placeholder: '' },
    heading: { label: '分段标题', icon: 'H', placeholder: '' },
  });

  const CHOICE_TYPES = new Set(['select', 'radio', 'checkbox']);

  function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  function nextId(prefix) {
    idSequence += 1;
    const time = Date.now().toString(36);
    return `${prefix || 'field'}-${time}-${idSequence.toString(36)}`;
  }

  function cleanId(value) {
    const cleaned = cleanText(value, 64)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return cleaned || nextId('field');
  }

  function parseOptions(value) {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [];
    const seen = new Set();
    const result = [];

    list.forEach((item) => {
      const option = cleanText(String(item ?? ''), 60);
      const key = option.toLocaleLowerCase();
      if (!option || seen.has(key) || result.length >= MAX_OPTIONS) return;
      seen.add(key);
      result.push(option);
    });

    return result.length ? result : ['选项 1', '选项 2'];
  }

  function numberOrNull(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function sanitizeField(input, seenIds) {
    if (!input || typeof input !== 'object' || !FIELD_TYPES[input.type]) return null;
    const type = input.type;
    const defaults = FIELD_TYPES[type];
    const seen = seenIds || new Set();
    let id = cleanId(input.id);
    let suffix = 2;
    const baseId = id;
    while (seen.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);

    const field = {
      id,
      type,
      label: cleanText(input.label, 80) || defaults.label,
      help: cleanText(input.help, 140),
      placeholder: cleanText(input.placeholder, 100),
      required: type === 'heading' ? false : Boolean(input.required),
      width: input.width === 'half' ? 'half' : 'full',
    };

    if (CHOICE_TYPES.has(type)) field.options = parseOptions(input.options ?? defaults.options);
    if (type === 'number') {
      field.min = numberOrNull(input.min);
      field.max = numberOrNull(input.max);
      if (field.min !== null && field.max !== null && field.min > field.max) {
        [field.min, field.max] = [field.max, field.min];
      }
    }

    return field;
  }

  function createField(type, seed) {
    if (!FIELD_TYPES[type]) throw new Error(`不支持的字段类型：${type}`);
    const defaults = FIELD_TYPES[type];
    return sanitizeField({
      id: nextId('field'),
      type,
      label: defaults.label,
      placeholder: defaults.placeholder || '',
      options: defaults.options ? [...defaults.options] : undefined,
      ...(seed && typeof seed === 'object' ? seed : {}),
    });
  }

  function sanitizeSchema(input) {
    const source = input && typeof input === 'object' ? input : {};
    const seen = new Set();
    const fields = Array.isArray(source.fields)
      ? source.fields.slice(0, MAX_FIELDS).map((field) => sanitizeField(field, seen)).filter(Boolean)
      : [];

    return {
      version: SCHEMA_VERSION,
      title: cleanText(source.title, 80) || '未命名表单',
      description: cleanText(source.description, 240),
      submitLabel: cleanText(source.submitLabel, 30) || '提交表单',
      fields,
    };
  }

  function createStarterSchema() {
    return sanitizeSchema({
      title: '开放日预约报名',
      description: '填写基本信息并选择你想参加的工作坊，我们会把确认信息发送到邮箱。',
      submitLabel: '确认报名',
      fields: [
        createField('heading', { label: '联系信息', help: '用于发送预约确认' }),
        createField('text', { label: '姓名', placeholder: '请输入真实姓名', required: true, width: 'half' }),
        createField('email', { label: '邮箱', required: true, width: 'half' }),
        createField('radio', { label: '参加时段', options: ['上午 10:00', '下午 14:00'], required: true }),
        createField('checkbox', { label: '感兴趣的工作坊', options: ['产品设计', '前端开发', 'AI 创作'] }),
        createField('textarea', { label: '备注', placeholder: '饮食、无障碍或其他需求（选填）' }),
      ],
    });
  }

  function cloneSchema(schema) {
    return sanitizeSchema(JSON.parse(JSON.stringify(sanitizeSchema(schema))));
  }

  function addField(schema, type, index) {
    const next = cloneSchema(schema);
    if (next.fields.length >= MAX_FIELDS) return next;
    const target = Number.isInteger(index) ? Math.max(0, Math.min(index, next.fields.length)) : next.fields.length;
    next.fields.splice(target, 0, createField(type));
    return sanitizeSchema(next);
  }

  function updateField(schema, id, patch) {
    const next = cloneSchema(schema);
    next.fields = next.fields.map((field) => field.id === id ? { ...field, ...(patch || {}), id: field.id, type: field.type } : field);
    return sanitizeSchema(next);
  }

  function duplicateField(schema, id) {
    const next = cloneSchema(schema);
    if (next.fields.length >= MAX_FIELDS) return next;
    const index = next.fields.findIndex((field) => field.id === id);
    if (index < 0) return next;
    const source = next.fields[index];
    const copy = {
      ...source,
      id: nextId('field'),
      label: `${source.label}（副本）`.slice(0, 80),
      options: source.options ? [...source.options] : undefined,
    };
    next.fields.splice(index + 1, 0, copy);
    return sanitizeSchema(next);
  }

  function removeField(schema, id) {
    const next = cloneSchema(schema);
    next.fields = next.fields.filter((field) => field.id !== id);
    return sanitizeSchema(next);
  }

  function moveField(schema, id, targetIndex) {
    const next = cloneSchema(schema);
    const sourceIndex = next.fields.findIndex((field) => field.id === id);
    if (sourceIndex < 0 || !Number.isFinite(Number(targetIndex))) return next;
    const [field] = next.fields.splice(sourceIndex, 1);
    const bounded = Math.max(0, Math.min(Math.trunc(Number(targetIndex)), next.fields.length));
    next.fields.splice(bounded, 0, field);
    return sanitizeSchema(next);
  }

  function isEmpty(value) {
    return Array.isArray(value) ? value.length === 0 : value === null || value === undefined || String(value).trim() === '';
  }

  function validateSubmission(schemaInput, valuesInput) {
    const schema = sanitizeSchema(schemaInput);
    const values = valuesInput && typeof valuesInput === 'object' ? valuesInput : {};
    const errors = {};
    const data = {};

    schema.fields.forEach((field) => {
      if (field.type === 'heading') return;
      const raw = values[field.id];

      if (field.type === 'checkbox') {
        const list = Array.isArray(raw) ? raw : isEmpty(raw) ? [] : [raw];
        const selected = list.map(String).filter((value) => field.options.includes(value));
        data[field.id] = selected;
        if (field.required && !selected.length) errors[field.id] = `“${field.label}”至少选择一项`;
        return;
      }

      const text = isEmpty(raw) ? '' : String(raw).trim();
      if (field.required && !text) {
        errors[field.id] = `“${field.label}”为必填项`;
        data[field.id] = field.type === 'number' ? null : '';
        return;
      }

      if (!text) {
        data[field.id] = field.type === 'number' ? null : '';
        return;
      }

      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        errors[field.id] = `“${field.label}”需要有效的邮箱地址`;
      }

      if (field.type === 'number') {
        const number = Number(text);
        data[field.id] = number;
        if (!Number.isFinite(number)) errors[field.id] = `“${field.label}”需要填写数字`;
        else if (field.min !== null && number < field.min) errors[field.id] = `“${field.label}”不能小于 ${field.min}`;
        else if (field.max !== null && number > field.max) errors[field.id] = `“${field.label}”不能大于 ${field.max}`;
        return;
      }

      if ((field.type === 'select' || field.type === 'radio') && !field.options.includes(text)) {
        errors[field.id] = `“${field.label}”包含无效选项`;
      }
      data[field.id] = text;
    });

    return { valid: Object.keys(errors).length === 0, errors, data };
  }

  function serializeSchema(schema) {
    return JSON.stringify(sanitizeSchema(schema), null, 2);
  }

  function deserializeSchema(source) {
    let parsed;
    try {
      parsed = typeof source === 'string' ? JSON.parse(source) : source;
    } catch (error) {
      throw new Error(`JSON 解析失败：${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON 根节点必须是对象');
    return sanitizeSchema(parsed);
  }

  function safeFileName(value) {
    const name = cleanText(value, 100)
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.\s-]+|[.\s-]+$/g, '')
      .slice(0, 48);
    return name || 'jig-87-form';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function attributes(field) {
    const attrs = [
      `id="${escapeHtml(field.id)}"`,
      `name="${escapeHtml(field.id)}"`,
      field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : '',
      field.required ? 'required' : '',
      field.type === 'number' && field.min !== null ? `min="${field.min}"` : '',
      field.type === 'number' && field.max !== null ? `max="${field.max}"` : '',
    ];
    return attrs.filter(Boolean).join(' ');
  }

  function renderExportField(field) {
    const label = `<span class="label">${escapeHtml(field.label)}${field.required ? ' <b aria-hidden="true">*</b>' : ''}</span>`;
    const help = field.help ? `<small>${escapeHtml(field.help)}</small>` : '';
    if (field.type === 'heading') return `<section class="section"><h2>${escapeHtml(field.label)}</h2>${help}</section>`;
    let control = '';
    if (field.type === 'textarea') {
      control = `<textarea ${attributes(field)} rows="5"></textarea>`;
    } else if (field.type === 'select') {
      control = `<select ${attributes(field)}><option value="">请选择</option>${field.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}</select>`;
    } else if (field.type === 'radio' || field.type === 'checkbox') {
      control = `<span class="choices">${field.options.map((option, index) => `<label><input type="${field.type}" name="${escapeHtml(field.id)}" value="${escapeHtml(option)}"${field.required && index === 0 ? ' required' : ''}> <span>${escapeHtml(option)}</span></label>`).join('')}</span>`;
    } else {
      control = `<input type="${field.type}" ${attributes(field)}>`;
    }
    return `<label class="field ${field.width === 'half' ? 'half' : ''}">${label}${control}${help}<span class="error" data-error="${escapeHtml(field.id)}"></span></label>`;
  }

  function generateStandaloneHtml(schemaInput) {
    const schema = sanitizeSchema(schemaInput);
    const fields = schema.fields.map(renderExportField).join('\n        ');
    return `<!doctype html>
<html lang="zh-CN" data-jig-export="1">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(schema.title)}</title>
  <style>
    :root{font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#17202a;background:#d7dee2;color-scheme:light}
    *{box-sizing:border-box}body{margin:0;padding:clamp(20px,5vw,72px);background:linear-gradient(90deg,transparent 23px,rgba(23,50,77,.08) 24px),#d7dee2;background-size:24px 24px}
    main{max-width:780px;margin:auto;background:#f5f7f6;border:2px solid #17324d;box-shadow:12px 12px 0 #17324d;padding:clamp(24px,6vw,64px)}
    .mark{font:700 12px Consolas,monospace;letter-spacing:.15em;color:#b63d20;text-transform:uppercase}h1{font:800 clamp(34px,8vw,64px)/.95 "Arial Narrow",sans-serif;margin:12px 0 14px;letter-spacing:-.03em}p{line-height:1.6;color:#46545f}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px 18px;margin-top:34px}.field{display:grid;gap:8px}.field:not(.half),.section{grid-column:1/-1}.label,h2{font-weight:750}.label b{color:#b63d20}input,textarea,select{width:100%;font:inherit;border:1.5px solid #6b7880;background:white;padding:12px;min-height:46px;border-radius:2px}textarea{resize:vertical}.choices{display:grid;gap:8px}.choices label{display:flex;align-items:center;gap:9px}.choices input{width:20px;min-height:20px}.section{border-bottom:3px solid #f2c94c;padding:18px 0 8px}.section h2{margin:0;font-size:22px}small{color:#5d6972}.error{color:#b42c16;min-height:1.2em;font-size:13px}button{margin-top:28px;background:#f05a32;color:#fff;border:2px solid #923119;padding:13px 22px;min-height:48px;font:800 15px inherit;cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:4px solid #f2c94c;outline-offset:2px}.receipt{display:none;margin-top:28px;border-left:6px solid #1d7a62;background:#e6f4ef;padding:18px;white-space:pre-wrap}.receipt.show{display:block}@media(max-width:600px){body{padding:18px}main{padding:24px;box-shadow:7px 7px 0 #17324d}.grid{grid-template-columns:1fr}.field.half{grid-column:1/-1}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
  </style>
</head>
<body>
  <main>
    <div class="mark">JIG/87 · standalone form</div>
    <h1>${escapeHtml(schema.title)}</h1>
    ${schema.description ? `<p>${escapeHtml(schema.description)}</p>` : ''}
    <form novalidate>
      <div class="grid">
        ${fields}
      </div>
      <button type="submit">${escapeHtml(schema.submitLabel)}</button>
    </form>
    <div class="receipt" role="status" aria-live="polite"></div>
  </main>
  <script>
    const form=document.querySelector('form');
    const receipt=document.querySelector('.receipt');
    form.addEventListener('submit',(event)=>{
      event.preventDefault();
      document.querySelectorAll('.error').forEach((node)=>node.textContent='');
      if(!form.reportValidity())return;
      const values={};
      new FormData(form).forEach((value,key)=>{values[key]=key in values?[].concat(values[key],value):value});
      receipt.textContent='提交成功（本地演示，不会发送到服务器）\\n\\n'+JSON.stringify(values,null,2);
      receipt.classList.add('show');
      receipt.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
    });
  <\/script>
</body>
</html>`;
  }

  return Object.freeze({
    FIELD_TYPES,
    createField,
    createStarterSchema,
    sanitizeSchema,
    addField,
    updateField,
    duplicateField,
    removeField,
    moveField,
    parseOptions,
    validateSubmission,
    serializeSchema,
    deserializeSchema,
    safeFileName,
    generateStandaloneHtml,
  });
});
