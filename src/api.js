const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEO_CACHE = 'sunshift:geo:';
const FORECAST_CACHE = 'sunshift:forecast:';

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app still works without a cache.
  }
}

function failure(message, retryable) {
  const err = new Error(message);
  err.retryable = retryable;
  return err;
}

async function getJson(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw failure('Network error. Check your internet connection.', true);
  }
  if (response.status === 429) {
    throw failure('Too many requests to the weather service. Try again later.', true);
  }
  if (!response.ok) {
    throw failure(`Weather service error (${response.status}).`, response.status >= 500);
  }
  try {
    return await response.json();
  } catch {
    throw failure('Unexpected response from the weather service.', true);
  }
}

export async function geocodeCity(name) {
  const key = GEO_CACHE + name.trim().toLowerCase();
  const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;

  let data;
  try {
    data = await getJson(url);
  } catch (err) {
    const cached = readCache(key);
    if (
      err.retryable &&
      cached &&
      Number.isFinite(cached.latitude) &&
      Number.isFinite(cached.longitude)
    ) {
      return { ...cached, fromCache: true };
    }
    throw err;
  }

  if (!data.results || data.results.length === 0) {
    throw failure(`No city found for "${name}".`, false);
  }
  const r = data.results[0];
  const place = {
    name: r.name,
    country: r.country || '',
    latitude: r.latitude,
    longitude: r.longitude,
  };
  writeCache(key, place);
  return { ...place, fromCache: false };
}

export async function fetchForecast(latitude, longitude) {
  const key = `${FORECAST_CACHE}${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  try {
    const params = new URLSearchParams({
      latitude,
      longitude,
      hourly: 'shortwave_radiation,temperature_2m,cloud_cover',
      forecast_days: '2',
      timezone: 'auto',
    });
    const data = await getJson(`${FORECAST_URL}?${params}`);
    const h = data.hourly;
    if (
      !h ||
      !Array.isArray(h.time) ||
      h.time.length < 24 ||
      !Array.isArray(h.shortwave_radiation) ||
      !Array.isArray(h.temperature_2m) ||
      !Array.isArray(h.cloud_cover)
    ) {
      throw failure('Unexpected response from the weather service.', true);
    }
    const hours = h.time.map((t, i) => ({
      time: t,
      radiation: h.shortwave_radiation[i],
      temperature: h.temperature_2m[i],
      cloud: h.cloud_cover[i],
    }));
    const savedAt = Date.now();
    writeCache(key, { savedAt, hours });
    return { hours, fromCache: false, savedAt };
  } catch (err) {
    const cached = readCache(key);
    if (err.retryable && cached && Array.isArray(cached.hours) && cached.hours.length >= 24) {
      return { hours: cached.hours, fromCache: true, savedAt: cached.savedAt };
    }
    throw err;
  }
}