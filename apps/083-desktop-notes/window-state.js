'use strict';

const DEFAULT_WINDOW_STATE = Object.freeze({
  width: 1180,
  height: 780,
  x: null,
  y: null,
  compact: false,
  alwaysOnTop: false,
});

function integerWithin(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function coordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

function normalizeWindowState(input) {
  const state = input && typeof input === 'object' ? input : {};
  return {
    width: integerWithin(state.width, 860, 2200, DEFAULT_WINDOW_STATE.width),
    height: integerWithin(state.height, 620, 1400, DEFAULT_WINDOW_STATE.height),
    x: coordinate(state.x),
    y: coordinate(state.y),
    compact: state.compact === true,
    alwaysOnTop: state.alwaysOnTop === true,
  };
}

module.exports = { DEFAULT_WINDOW_STATE, normalizeWindowState };
