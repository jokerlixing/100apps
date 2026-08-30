import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildForecastUrl,
  buildGeocodingUrl,
  geocodeLocation,
  loadWeather,
  normalizeForecast,
} from '../src/api.js';
import { WeatherError } from '../src/errors.js';
import {
  createWeatherFetch,
  forecastPayload,
  jsonResponse,
  locationPayload,
} from './fixture.js';

test('builds encoded geocoding and unit-aware forecast URLs', () => {
  const geocoding = new URL(buildGeocodingUrl('New York, US', { lang: 'en' }));
  assert.equal(geocoding.searchParams.get('name'), 'New York, US');
  assert.equal(geocoding.searchParams.get('language'), 'en');
  assert.equal(geocoding.searchParams.get('count'), '1');

  const forecast = new URL(buildForecastUrl(locationPayload.results[0], { days: 5, unit: 'f' }));
  assert.equal(forecast.searchParams.get('forecast_days'), '5');
  assert.equal(forecast.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(forecast.searchParams.get('wind_speed_unit'), 'mph');
  assert.match(forecast.searchParams.get('current'), /weather_code/);
  assert.match(forecast.searchParams.get('daily'), /precipitation_probability_max/);
});

test('loads and normalizes a complete city forecast', async () => {
  const { fetchImpl, calls } = createWeatherFetch();
  const weather = await loadWeather('上海', { fetchImpl, days: 3, lang: 'zh' });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /language=zh/);
  assert.match(calls[1], /forecast_days=3/);
  assert.equal(weather.location.name, '上海');
  assert.equal(weather.location.timezone, 'Asia/Shanghai');
  assert.equal(weather.current.temperature, 29.1);
  assert.equal(weather.current.isDay, true);
  assert.equal(weather.forecast.length, 3);
  assert.equal(weather.forecast[1].precipitationProbability, 70);
  assert.equal(weather.source, 'Open-Meteo');
});

test('reports an unmatched location without requesting a forecast', async () => {
  const { fetchImpl, calls } = createWeatherFetch({ geocoding: { results: [] } });

  await assert.rejects(
    geocodeLocation('不存在的地点', { fetchImpl }),
    (error) => error instanceof WeatherError && error.code === 'LOCATION_NOT_FOUND',
  );
  assert.equal(calls.length, 1);
});

test('normalization rejects incomplete current data', () => {
  const broken = structuredClone(forecastPayload);
  delete broken.current.temperature_2m;
  assert.throws(
    () => normalizeForecast(locationPayload.results[0], broken),
    (error) => error.code === 'INVALID_RESPONSE',
  );
});

test('normalizes the provider imperial wind unit label to mph', () => {
  const imperial = structuredClone(forecastPayload);
  imperial.current_units.wind_speed_10m = 'mp/h';
  const weather = normalizeForecast(locationPayload.results[0], imperial);
  assert.equal(weather.units.windSpeed, 'mph');
});

test('wraps API and network failures in stable errors', async () => {
  const apiFetch = async () => jsonResponse(
    { error: true, reason: 'bad request' },
    { status: 400, statusText: 'Bad Request' },
  );
  await assert.rejects(
    geocodeLocation('Paris', { fetchImpl: apiFetch }),
    (error) => error.code === 'API_ERROR' && /bad request/.test(error.message),
  );

  const networkFetch = async () => {
    throw new Error('socket closed');
  };
  await assert.rejects(
    geocodeLocation('Paris', { fetchImpl: networkFetch }),
    (error) => error.code === 'NETWORK_ERROR' && /socket closed/.test(error.message),
  );
});

test('distinguishes timeouts and malformed JSON responses', async () => {
  const hangingFetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  await assert.rejects(
    geocodeLocation('Paris', { fetchImpl: hangingFetch, timeoutMs: 5 }),
    (error) => error.code === 'TIMEOUT',
  );

  const malformedFetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      throw new SyntaxError('not json');
    },
  });
  await assert.rejects(
    geocodeLocation('Paris', { fetchImpl: malformedFetch }),
    (error) => error.code === 'INVALID_RESPONSE',
  );
});
