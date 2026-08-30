export const locationPayload = {
  results: [
    {
      name: '上海',
      admin1: '上海市',
      country: '中国',
      country_code: 'CN',
      latitude: 31.22222,
      longitude: 121.45806,
      timezone: 'Asia/Shanghai',
    },
  ],
};

export const forecastPayload = {
  latitude: 31.25,
  longitude: 121.5,
  timezone: 'Asia/Shanghai',
  current_units: {
    temperature_2m: '°C',
    apparent_temperature: '°C',
    relative_humidity_2m: '%',
    precipitation: 'mm',
    wind_speed_10m: 'km/h',
  },
  current: {
    time: '2026-08-31T10:00',
    temperature_2m: 29.1,
    apparent_temperature: 31.4,
    relative_humidity_2m: 66,
    precipitation: 0,
    weather_code: 1,
    wind_speed_10m: 13.2,
    wind_direction_10m: 135,
    is_day: 1,
  },
  daily_units: {
    temperature_2m_max: '°C',
    temperature_2m_min: '°C',
    precipitation_probability_max: '%',
  },
  daily: {
    time: ['2026-08-31', '2026-09-01', '2026-09-02'],
    weather_code: [1, 61, 95],
    temperature_2m_max: [32.3, 30.1, 29.4],
    temperature_2m_min: [25.2, 24.6, 23.8],
    precipitation_probability_max: [10, 70, 80],
    sunrise: ['2026-08-31T05:29', '2026-09-01T05:30', '2026-09-02T05:30'],
    sunset: ['2026-08-31T18:16', '2026-09-01T18:15', '2026-09-02T18:14'],
  },
};

export function jsonResponse(payload, { status = 200, statusText = 'OK' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async json() {
      return payload;
    },
  };
}

export function createWeatherFetch({ geocoding = locationPayload, forecast = forecastPayload } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return String(url).startsWith('https://geocoding-api.')
      ? jsonResponse(geocoding)
      : jsonResponse(forecast);
  };
  return { fetchImpl, calls };
}
