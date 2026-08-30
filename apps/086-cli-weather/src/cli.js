import { parseArgs } from './args.js';
import { loadWeather } from './api.js';
import { UsageError, WeatherError } from './errors.js';
import { formatJson, formatTerminal, shouldUseColor } from './format.js';

export const VERSION = '1.0.0';

export function formatHelp(lang = 'zh') {
  if (lang === 'en') {
    return `SKY/86 · Weather in your terminal

Usage:
  weather86 <location> [options]

Options:
  -d, --days <1-7>    Forecast days (default: 3)
  -u, --unit <c|f>    Temperature unit (default: c)
  -l, --lang <zh|en>  Output language (default: zh)
  -j, --json          Print machine-readable JSON
      --color         Force ANSI colors
      --no-color      Disable ANSI colors
  -h, --help          Show help
  -v, --version       Show version

Examples:
  weather86 Shanghai
  weather86 "New York" --days 5 --unit f --lang en
  weather86 Tokyo --json
`;
  }

  return `SKY/86 · 终端天气查询

用法：
  weather86 <城市> [选项]

选项：
  -d, --days <1-7>    预报天数（默认：3）
  -u, --unit <c|f>    摄氏或华氏（默认：c）
  -l, --lang <zh|en>  中文或英文（默认：zh）
  -j, --json          输出机器可读 JSON
      --color         强制启用 ANSI 颜色
      --no-color      禁用 ANSI 颜色
  -h, --help          显示帮助
  -v, --version       显示版本

示例：
  weather86 上海
  weather86 "New York" --days 5 --unit f --lang en
  weather86 东京 --json
`;
}

function write(stream, text) {
  stream.write(text.endsWith('\n') ? text : `${text}\n`);
}

export async function run(argv, {
  stdout = process.stdout,
  stderr = process.stderr,
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
} = {}) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.help) {
      write(stdout, formatHelp(options.lang));
      return 0;
    }
    if (options.version) {
      write(stdout, VERSION);
      return 0;
    }

    const weather = await loadWeather(options.location, {
      fetchImpl,
      timeoutMs,
      days: options.days,
      unit: options.unit,
      lang: options.lang,
    });
    if (options.json) {
      write(stdout, formatJson(weather));
    } else {
      const color = shouldUseColor({ requested: options.color, stream: stdout, env });
      write(stdout, formatTerminal(weather, { lang: options.lang, color }));
    }
    return 0;
  } catch (error) {
    const known = error instanceof WeatherError;
    const message = known ? error.message : '发生了未预期的错误';
    write(stderr, `SKY/86: ${message}`);
    if (error instanceof UsageError) {
      write(stderr, '运行 weather86 --help 查看完整用法。');
    }
    return known ? error.exitCode : 1;
  }
}

export async function main(argv = process.argv.slice(2)) {
  process.exitCode = await run(argv);
}
