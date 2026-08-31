import { loadWeather } from './src/api.js';
import { formatTerminal } from './src/format.js';

const form = document.getElementById('weather-form');
const cityInput = document.getElementById('city-input');
const unitSelect = document.getElementById('unit-select');
const daysSelect = document.getElementById('days-select');
const status = document.getElementById('request-status');
const output = document.getElementById('terminal-output');
const submitButton = form.querySelector('button[type="submit"]');

let requestId = 0;
let latestWeather = null;

function setBusy(busy) {
  form.setAttribute('aria-busy', String(busy));
  submitButton.disabled = busy;
  submitButton.firstChild.textContent = busy ? '正在查询 ' : '运行查询 ';
}

function commandLine(city, days, unit) {
  return `$ weather86 "${city}" --days ${days}${unit === 'f' ? ' --unit f' : ''}`;
}

async function runWeather(city = cityInput.value) {
  const query = String(city || '').trim();
  if (!query) {
    cityInput.focus();
    status.textContent = 'INPUT REQUIRED';
    return null;
  }

  const currentRequest = ++requestId;
  const days = Number(daysSelect.value);
  const unit = unitSelect.value;
  cityInput.value = query;
  setBusy(true);
  status.textContent = 'CONNECTING';
  status.dataset.state = 'loading';
  output.textContent = `${commandLine(query, days, unit)}\n\n正在连接 Open-Meteo…`;

  try {
    const weather = await loadWeather(query, { days, unit, lang: 'zh', timeoutMs: 10_000 });
    if (currentRequest !== requestId) return null;
    latestWeather = weather;
    output.textContent = `${commandLine(query, days, unit)}\n\n${formatTerminal(weather, { lang: 'zh', color: false })}`;
    status.textContent = 'LIVE';
    status.dataset.state = 'success';
    const url = new URL(window.location.href);
    url.searchParams.set('city', query);
    history.replaceState(null, '', url);
    return weather;
  } catch (error) {
    if (currentRequest !== requestId) return null;
    latestWeather = null;
    output.textContent = `${commandLine(query, days, unit)}\n\n查询失败：${error.message}\n\n请检查城市名称或稍后再试。`;
    status.textContent = error.code || 'ERROR';
    status.dataset.state = 'error';
    return null;
  } finally {
    if (currentRequest === requestId) setBusy(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runWeather();
});

document.querySelectorAll('[data-city]').forEach((button) => {
  button.addEventListener('click', () => {
    cityInput.value = button.dataset.city;
    runWeather(button.dataset.city);
  });
});

const initialCity = new URLSearchParams(window.location.search).get('city');
if (initialCity) cityInput.value = initialCity.slice(0, 80);
document.body.classList.add('ready');
if (initialCity) runWeather(cityInput.value);

window.__SKY86__ = Object.freeze({
  runWeather,
  getState: () => ({ requestId, latestWeather, busy: form.getAttribute('aria-busy') === 'true' }),
});
