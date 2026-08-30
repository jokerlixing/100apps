const ART = {
  clear: [
    '    \\   /    ',
    '     .-.     ',
    '  - (   ) -  ',
    '     `-\'     ',
  ],
  cloudy: [
    '             ',
    '     .--.    ',
    '  .-(    ).  ',
    ' (___.__)__) ',
  ],
  fog: [
    '             ',
    ' _ - _ - _ - ',
    '  _ - _ - _  ',
    ' _ - _ - _ - ',
  ],
  rain: [
    '     .--.    ',
    '  .-(    ).  ',
    ' (___.__)__) ',
    '  \'  \'  \'   ',
  ],
  snow: [
    '     .--.    ',
    '  .-(    ).  ',
    ' (___.__)__) ',
    '  *  *  *    ',
  ],
  storm: [
    '     .--.    ',
    '  .-(    ).  ',
    ' (___.__)__) ',
    '    /_/      ',
  ],
  unknown: [
    '     .--.    ',
    '    ( ?  )   ',
    '     `--\'    ',
    '             ',
  ],
};

const CONDITIONS = [
  { codes: [0], key: 'clear', zh: '晴朗', en: 'Clear' },
  { codes: [1], key: 'clear', zh: '大致晴朗', en: 'Mostly clear' },
  { codes: [2], key: 'cloudy', zh: '局部多云', en: 'Partly cloudy' },
  { codes: [3], key: 'cloudy', zh: '阴天', en: 'Overcast' },
  { codes: [45, 48], key: 'fog', zh: '有雾', en: 'Fog' },
  { codes: [51, 53, 55], key: 'rain', zh: '毛毛雨', en: 'Drizzle' },
  { codes: [56, 57], key: 'rain', zh: '冻毛毛雨', en: 'Freezing drizzle' },
  { codes: [61, 63, 65], key: 'rain', zh: '降雨', en: 'Rain' },
  { codes: [66, 67], key: 'rain', zh: '冻雨', en: 'Freezing rain' },
  { codes: [71, 73, 75, 77], key: 'snow', zh: '降雪', en: 'Snow' },
  { codes: [80, 81, 82], key: 'rain', zh: '阵雨', en: 'Rain showers' },
  { codes: [85, 86], key: 'snow', zh: '阵雪', en: 'Snow showers' },
  { codes: [95], key: 'storm', zh: '雷暴', en: 'Thunderstorm' },
  { codes: [96, 99], key: 'storm', zh: '雷暴伴冰雹', en: 'Thunderstorm with hail' },
];

export function getCondition(code, lang = 'zh') {
  const numericCode = Number(code);
  const condition = CONDITIONS.find((entry) => entry.codes.includes(numericCode));
  if (!condition) {
    return {
      key: 'unknown',
      label: lang === 'en' ? `Unknown (${code ?? '-'})` : `未知天气（${code ?? '-'}）`,
      art: ART.unknown,
    };
  }
  return {
    key: condition.key,
    label: lang === 'en' ? condition.en : condition.zh,
    art: ART[condition.key],
  };
}
