import { WeatherError } from './errors.js';

export const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
export const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

function ensureFetch(fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new WeatherError('当前 Node.js 环境不支持 fetch，请升级到 Node.js 18 或更高版本', {
      code: 'FETCH_UNAVAILABLE',
    });
  }
}

async function requestJson(url, { fetchImpl, timeoutMs }) {
  ensureFetch(fetchImpl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new WeatherError('天气服务返回了无法解析的数据', {
        code: 'INVALID_RESPONSE',
        cause: error,
      });
    }

    if (!response.ok || payload?.error) {
      const reason = payload?.reason || `${response.status} ${response.statusText || ''}`.trim();
      throw new WeatherError(`天气服务请求失败：${reason}`, { code: 'API_ERROR' });
    }
    return payload;
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw new WeatherError(`天气服务响应超时（${Math.round(timeoutMs / 1000)} 秒）`, {
        code: 'TIMEOUT',
        cause: error,
      });
    }
    throw new WeatherError(`无法连接天气服务：${error?.message || '网络异常'}`, {
      code: 'NETWORK_ERROR',
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

function requireNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new WeatherError(`天气服务响应缺少有效字段：${field}`, { code: 'INVALID_RESPONSE' });
  }
  return value;
}

function optionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dailyValue(daily, field, index) {
  const values = daily?.[field];
  return Array.isArray(values) ? values[index] ?? null : null;
}

function normalizeWindUnit(unit) {
  return unit === 'mp/h' ? 'mph' : unit;
}

export function buildGeocodingUrl(query, { lang = 'zh' } = {}) {
  const params = new URLSearchParams({
    name: query,
    count: '1',
    format: 'json',
    language: lang,
  });
  return `${GEOCODING_ENDPOINT}?${params}`;
}

export function buildForecastUrl(location, { days = 3, unit = 'c' } = {}) {
  const fahrenheit = unit === 'f';
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'is_day',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'sunrise',
      'sunset',
    ].join(','),
    timezone: 'auto',
    forecast_days: String(days),
    temperature_unit: fahrenheit ? 'fahrenheit' : 'celsius',
    wind_speed_unit: fahrenheit ? 'mph' : 'kmh',
    precipitation_unit: fahrenheit ? 'inch' : 'mm',
  });
  return `${FORECAST_ENDPOINT}?${params}`;
}

export async function geocodeLocation(query, {
  fetchImpl = globalThis.fetch,
  lang = 'zh',
  timeoutMs = 8_000,
} = {}) {
  const payload = await requestJson(buildGeocodingUrl(query, { lang }), { fetchImpl, timeoutMs });
  const result = payload?.results?.[0];
  if (!result) {
    throw new WeatherError(`没有找到地点“${query}”，请尝试加入省份或国家`, {
      code: 'LOCATION_NOT_FOUND',
    });
  }

  return {
    name: String(result.name || query),
    admin1: result.admin1 ? String(result.admin1) : '',
    country: result.country ? String(result.country) : '',
    countryCode: result.country_code ? String(result.country_code) : '',
    latitude: requireNumber(result.latitude, 'latitude'),
    longitude: requireNumber(result.longitude, 'longitude'),
    timezone: result.timezone ? String(result.timezone) : 'auto',
  };
}

export function normalizeForecast(location, payload) {
  const current = payload?.current;
  const daily = payload?.daily;
  if (!current || !daily || !Array.isArray(daily.time) || daily.time.length === 0) {
    throw new WeatherError('天气服务响应不完整，请稍后重试', { code: 'INVALID_RESPONSE' });
  }

  const forecast = daily.time.map((date, index) => ({
    date,
    weatherCode: optionalNumber(dailyValue(daily, 'weather_code', index)),
    minTemperature: optionalNumber(dailyValue(daily, 'temperature_2m_min', index)),
    maxTemperature: optionalNumber(dailyValue(daily, 'temperature_2m_max', index)),
    precipitationProbability: optionalNumber(dailyValue(daily, 'precipitation_probability_max', index)),
    sunrise: dailyValue(daily, 'sunrise', index),
    sunset: dailyValue(daily, 'sunset', index),
  }));

  return {
    location: {
      ...location,
      timezone: payload.timezone || location.timezone,
    },
    units: {
      temperature: payload.current_units?.temperature_2m || payload.daily_units?.temperature_2m_max || '°C',
      windSpeed: normalizeWindUnit(payload.current_units?.wind_speed_10m || 'km/h'),
      precipitation: payload.current_units?.precipitation || 'mm',
    },
    current: {
      time: current.time || '',
      temperature: requireNumber(current.temperature_2m, 'current.temperature_2m'),
      apparentTemperature: optionalNumber(current.apparent_temperature),
      humidity: optionalNumber(current.relative_humidity_2m),
      precipitation: optionalNumber(current.precipitation),
      weatherCode: requireNumber(current.weather_code, 'current.weather_code'),
      windSpeed: optionalNumber(current.wind_speed_10m),
      windDirection: optionalNumber(current.wind_direction_10m),
      isDay: current.is_day === 1,
    },
    forecast,
    source: 'Open-Meteo',
  };
}

export async function fetchForecast(location, {
  fetchImpl = globalThis.fetch,
  days = 3,
  unit = 'c',
  timeoutMs = 8_000,
} = {}) {
  const url = buildForecastUrl(location, { days, unit });
  const payload = await requestJson(url, { fetchImpl, timeoutMs });
  return normalizeForecast(location, payload);
}

export async function loadWeather(query, options = {}) {
  const location = await geocodeLocation(query, options);
  return fetchForecast(location, options);
}
