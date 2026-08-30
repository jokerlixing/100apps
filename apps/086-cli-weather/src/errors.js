export class WeatherError extends Error {
  constructor(message, { code = 'WEATHER_ERROR', exitCode = 1, cause } = {}) {
    super(message, { cause });
    this.name = 'WeatherError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class UsageError extends WeatherError {
  constructor(message) {
    super(message, { code: 'INVALID_ARGUMENT', exitCode: 2 });
    this.name = 'UsageError';
  }
}
