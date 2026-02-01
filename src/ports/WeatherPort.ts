export interface CurrentWeather {
  temp: number;
  feelsLike: number;
  humidity: number;
  uvi: number;
  description: string;
  windSpeed: number;
}

export interface DailyWeather {
  high: number;
  low: number;
  rainChance: number;
  sunrise: string;
  sunset: string;
}

export interface HourlyForecast {
  hour: string;
  temp: number;
  rainChance: number;
  description: string;
}

export interface WeatherData {
  current: CurrentWeather;
  today: DailyWeather;
  hourly: HourlyForecast[];
}

export interface WeatherPort {
  getWeather(lat: number, lon: number): Promise<WeatherData>;
}
