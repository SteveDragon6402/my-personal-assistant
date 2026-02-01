import type { WeatherPort, WeatherData, HourlyForecast } from '../../ports/WeatherPort.js';
import type { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';

interface OpenWeatherCurrent {
  temp: number;
  feels_like: number;
  humidity: number;
  uvi: number;
  wind_speed: number;
  weather: Array<{ description: string }>;
}

interface OpenWeatherDaily {
  temp: { min: number; max: number };
  pop: number; // probability of precipitation (0-1)
  sunrise: number;
  sunset: number;
}

interface OpenWeatherHourly {
  dt: number;
  temp: number;
  pop: number;
  weather: Array<{ description: string }>;
}

interface OpenWeatherResponse {
  current: OpenWeatherCurrent;
  daily: OpenWeatherDaily[];
  hourly: OpenWeatherHourly[];
}

export class OpenWeatherAdapter implements WeatherPort {
  private readonly logger = createLogger({ adapter: 'OpenWeatherAdapter' });
  private readonly apiKey: string | undefined;

  constructor(config: Config) {
    this.apiKey = config.openWeatherApiKey;
    if (!this.apiKey) {
      this.logger.warn('OpenWeather API key not configured; weather will be unavailable');
    }
  }

  async getWeather(lat: number, lon: number): Promise<WeatherData> {
    const logger = this.logger.child({ method: 'getWeather', lat, lon });

    if (!this.apiKey) {
      throw new Error('OpenWeather API key not configured');
    }

    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${this.apiKey}&units=metric&exclude=minutely,alerts`;

    logger.info('Fetching weather data');

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      logger.error({ status: response.status }, 'OpenWeather API request failed');
      throw new Error(`OpenWeather API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenWeatherResponse;

    const current = data.current;
    const today = data.daily[0];
    const hourlyForecasts = data.hourly.slice(0, 12); // Next 12 hours

    const weatherData: WeatherData = {
      current: {
        temp: Math.round(current.temp),
        feelsLike: Math.round(current.feels_like),
        humidity: current.humidity,
        uvi: current.uvi,
        description: current.weather[0]?.description ?? 'unknown',
        windSpeed: Math.round(current.wind_speed * 3.6), // m/s to km/h
      },
      today: {
        high: Math.round(today?.temp.max ?? current.temp),
        low: Math.round(today?.temp.min ?? current.temp),
        rainChance: Math.round((today?.pop ?? 0) * 100),
        sunrise: this.formatTime(today?.sunrise ?? 0),
        sunset: this.formatTime(today?.sunset ?? 0),
      },
      hourly: hourlyForecasts.map((h): HourlyForecast => ({
        hour: this.formatTime(h.dt),
        temp: Math.round(h.temp),
        rainChance: Math.round(h.pop * 100),
        description: h.weather[0]?.description ?? 'unknown',
      })),
    };

    logger.info({ temp: weatherData.current.temp }, 'Weather data fetched');

    return weatherData;
  }

  private formatTime(unixTimestamp: number): string {
    if (!unixTimestamp) return '';
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
