import { getCondition } from './weather-codes.js';

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  cyan: '\u001b[36m',
  blue: '\u001b[34m',
  yellow: '\u001b[33m',
  gray: '\u001b[90m',
};

function paint(text, color, enabled) {
  return enabled ? `${ANSI[color]}${text}${ANSI.reset}` : text;
}

function valueOrDash(value, suffix = '') {
  return value === null || value === undefined ? '-' : `${Math.round(value * 10) / 10}${suffix}`;
}

function locationLabel(location) {
  const parts = [location.name];
  if (location.admin1 && location.admin1 !== location.name) parts.push(location.admin1);
  if (location.country && location.country !== location.admin1) parts.push(location.country);
  return parts.join(' · ');
}

export function formatWindDirection(degrees, lang = 'zh') {
  if (degrees === null || degrees === undefined || !Number.isFinite(degrees)) return '-';
  const zh = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return (lang === 'en' ? en : zh)[index];
}

export function shouldUseColor({ requested, stream = process.stdout, env = process.env } = {}) {
  if (requested === false || Object.hasOwn(env, 'NO_COLOR')) return false;
  if (requested === true) return true;
  return Boolean(stream?.isTTY);
}

function formatCurrentLines(weather, lang) {
  const { current, units } = weather;
  const direction = formatWindDirection(current.windDirection, lang);
  if (lang === 'en') {
    return [
      `${valueOrDash(current.temperature, units.temperature)}  Feels ${valueOrDash(current.apparentTemperature, units.temperature)}`,
      `Humidity ${valueOrDash(current.humidity, '%')}  Rain ${valueOrDash(current.precipitation, units.precipitation)}`,
      `Wind ${direction} ${valueOrDash(current.windSpeed, units.windSpeed)}`,
      `Local ${current.time || '-'}  ${weather.location.timezone || '-'}`,
    ];
  }
  return [
    `${valueOrDash(current.temperature, units.temperature)}  体感 ${valueOrDash(current.apparentTemperature, units.temperature)}`,
    `湿度 ${valueOrDash(current.humidity, '%')}  降水 ${valueOrDash(current.precipitation, units.precipitation)}`,
    `风向 ${direction}  风速 ${valueOrDash(current.windSpeed, units.windSpeed)}`,
    `当地 ${current.time || '-'}  ${weather.location.timezone || '-'}`,
  ];
}

export function formatTerminal(weather, { lang = 'zh', color = false } = {}) {
  const currentCondition = getCondition(weather.current.weatherCode, lang);
  const details = formatCurrentLines(weather, lang);
  const heading = paint('SKY/86', 'cyan', color);
  const place = paint(locationLabel(weather.location), 'bold', color);
  const condition = paint(currentCondition.label, currentCondition.key === 'clear' ? 'yellow' : 'blue', color);
  const lines = [
    `${heading}  ${place}`,
    paint('─'.repeat(52), 'gray', color),
  ];

  for (let index = 0; index < currentCondition.art.length; index += 1) {
    const side = index === 0 ? condition : details[index - 1] || '';
    lines.push(`${paint(currentCondition.art[index], currentCondition.key === 'clear' ? 'yellow' : 'blue', color)}  ${side}`.trimEnd());
  }
  lines.push(`               ${details[3]}`);
  lines.push('');
  lines.push(paint(lang === 'en' ? `NEXT ${weather.forecast.length} DAYS` : `未来 ${weather.forecast.length} 天`, 'cyan', color));

  for (const day of weather.forecast) {
    const dayCondition = getCondition(day.weatherCode, lang);
    const temperature = `${valueOrDash(day.minTemperature, weather.units.temperature)} ~ ${valueOrDash(day.maxTemperature, weather.units.temperature)}`;
    const precipitation = lang === 'en'
      ? `Rain ${valueOrDash(day.precipitationProbability, '%')}`
      : `降水 ${valueOrDash(day.precipitationProbability, '%')}`;
    lines.push(`${day.date}  ${dayCondition.label.padEnd(lang === 'en' ? 22 : 10)}  ${temperature}  ${precipitation}`);
  }

  lines.push('');
  lines.push(paint(lang === 'en' ? 'Data: Open-Meteo' : '数据：Open-Meteo', 'gray', color));
  return `${lines.join('\n')}\n`;
}

export function formatJson(weather) {
  return `${JSON.stringify({ app: 'SKY/86', ...weather }, null, 2)}\n`;
}
