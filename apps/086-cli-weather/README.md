# SKY/86 · CLI 天气工具

一个零运行时依赖、跨平台的终端天气查询工具。输入城市名即可查看当前体感、湿度、风速、降水、未来预报和对应的 ASCII 天气图；支持中文/英文、摄氏/华氏与 JSON 输出。

```text
SKY/86  上海 · 中国
────────────────────────────────────────────────────
    \\  /       晴朗
  _ /"".-.      29.1°C  体感 31.4°C
    \\_(   ).    湿度 66%  降水 0mm
    /(___(__)    风向 东南  风速 13.2km/h
                 当地 2026-08-31T10:00  Asia/Shanghai
```

## 快速开始

需要 Node.js 18 或更高版本，不需要 API Key，也不需要安装第三方依赖。

从仓库根目录直接运行：

```bash
node apps/086-cli-weather/bin/weather.js 上海
```

进入项目目录后也可以建立本地命令：

```bash
cd apps/086-cli-weather
npm link
weather86 上海
```

不想使用 `npm link` 时：

```bash
npm start -- 上海 --days 5
```

## 命令选项

| 选项 | 说明 |
| --- | --- |
| `-d, --days <1-7>` | 未来预报天数，默认 3 |
| `-u, --unit <c\|f>` | 摄氏或华氏，默认 `c` |
| `-l, --lang <zh\|en>` | 中文或英文，默认 `zh` |
| `-j, --json` | 输出稳定、机器可读的 JSON |
| `--color` | 重定向时仍强制 ANSI 颜色 |
| `--no-color` | 禁用 ANSI 颜色 |
| `-h, --help` | 显示帮助 |
| `-v, --version` | 显示版本 |

多词城市名可以加引号，也支持放在多个参数中：

```bash
weather86 "New York" --days 5 --unit f --lang en
weather86 Los Angeles --lang en
```

脚本集成：

```bash
weather86 东京 --json > tokyo-weather.json
```

## 数据与隐私

城市搜索使用 Open-Meteo Geocoding API，天气使用 Open-Meteo Forecast API。查询会把城市名发送给该服务，但工具不收集、不保存查询历史，也不要求位置权限或密钥。终端中显示的是服务实际解析到的城市、行政区和国家，便于识别同名地点。

工具在 8 秒后主动终止超时请求。地点无匹配、服务异常、无效响应和网络失败都会输出简短错误并返回非零退出码；不会用演示数据冒充实时天气。设置通用的 `NO_COLOR` 环境变量也会关闭颜色。

## 测试

```bash
npm test --prefix apps/086-cli-weather
npm run check --prefix apps/086-cli-weather
node apps/086-cli-weather/bin/weather.js 上海 --days 3 --no-color
```

测试通过注入的网络层运行，不依赖公网，覆盖参数校验、URL 生成、API 错误、天气码、风向、终端格式、JSON 和 CLI 退出码。

## 项目结构

- `bin/weather.js`：跨平台可执行入口
- `src/args.js`：参数解析与边界校验
- `src/api.js`：Open-Meteo 请求、超时和数据标准化
- `src/weather-codes.js`：WMO 天气码、双语文案和 ASCII 图
- `src/format.js`：终端与 JSON 输出
- `src/cli.js`：流程编排、帮助和退出码
- `*.test.js`：单元与 mock 集成测试

数据来源：[Open-Meteo](https://open-meteo.com/)。
