import { UsageError } from './errors.js';

const VALUE_OPTIONS = new Map([
  ['--days', 'days'],
  ['-d', 'days'],
  ['--unit', 'unit'],
  ['-u', 'unit'],
  ['--lang', 'lang'],
  ['-l', 'lang'],
]);

const FLAG_OPTIONS = new Map([
  ['--json', ['json', true]],
  ['-j', ['json', true]],
  ['--color', ['color', true]],
  ['--no-color', ['color', false]],
  ['--help', ['help', true]],
  ['-h', ['help', true]],
  ['--version', ['version', true]],
  ['-v', ['version', true]],
]);

function splitLongOption(argument) {
  if (!argument.startsWith('--') || !argument.includes('=')) return null;
  const separator = argument.indexOf('=');
  return [argument.slice(0, separator), argument.slice(separator + 1)];
}

function applyValue(options, key, value) {
  if (value === undefined || value === '') {
    throw new UsageError(`选项 ${key === 'days' ? '--days' : key === 'unit' ? '--unit' : '--lang'} 缺少值`);
  }

  if (key === 'days') {
    if (!/^\d+$/.test(value)) throw new UsageError('--days 必须是 1 到 7 的整数');
    const days = Number(value);
    if (days < 1 || days > 7) throw new UsageError('--days 必须在 1 到 7 之间');
    options.days = days;
    return;
  }

  if (key === 'unit') {
    const unit = value.toLowerCase();
    if (!['c', 'f'].includes(unit)) throw new UsageError('--unit 只接受 c 或 f');
    options.unit = unit;
    return;
  }

  const lang = value.toLowerCase();
  if (!['zh', 'en'].includes(lang)) throw new UsageError('--lang 只接受 zh 或 en');
  options.lang = lang;
}

export function parseArgs(argv) {
  const options = {
    location: '',
    days: 3,
    unit: 'c',
    lang: 'zh',
    json: false,
    color: undefined,
    help: false,
    version: false,
  };
  const locationParts = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--') {
      locationParts.push(...argv.slice(index + 1));
      break;
    }

    const assigned = splitLongOption(argument);
    if (assigned) {
      const [name, value] = assigned;
      const key = VALUE_OPTIONS.get(name);
      if (!key) throw new UsageError(`未知选项：${name}`);
      applyValue(options, key, value);
      continue;
    }

    if (FLAG_OPTIONS.has(argument)) {
      const [key, value] = FLAG_OPTIONS.get(argument);
      options[key] = value;
      continue;
    }

    if (VALUE_OPTIONS.has(argument)) {
      const key = VALUE_OPTIONS.get(argument);
      index += 1;
      applyValue(options, key, argv[index]);
      continue;
    }

    if (argument.startsWith('-')) throw new UsageError(`未知选项：${argument}`);
    locationParts.push(argument);
  }

  options.location = locationParts.join(' ').trim();
  if (!options.help && !options.version && !options.location) {
    throw new UsageError('请提供城市名，例如：weather86 上海');
  }
  return options;
}
