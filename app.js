const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const SAVED_LOCATIONS_KEY = "weather-atlas-saved-locations-v1";
const SETTINGS_KEY = "weather-atlas-settings-v1";

const searchForm = document.querySelector("#search-form");
const searchInput = document.querySelector("#search-input");
const searchResults = document.querySelector("#search-results");
const searchFeedback = document.querySelector("#search-feedback");
const currentLocationButton = document.querySelector("#current-location");
const saveLocationButton = document.querySelector("#save-location");
const unitToggleButton = document.querySelector("#unit-toggle");
const installAppButton = document.querySelector("#install-app");
const statusPill = document.querySelector("#status-pill");
const resultTemplate = document.querySelector("#result-template");

const elements = {
  locationName: document.querySelector("#location-name"),
  locationMeta: document.querySelector("#location-meta"),
  currentTemp: document.querySelector("#current-temp"),
  conditionText: document.querySelector("#condition-text"),
  conditionArt: document.querySelector("#condition-art"),
  conditionGlyph: document.querySelector("#condition-glyph"),
  lastUpdated: document.querySelector("#last-updated"),
  metricsGrid: document.querySelector("#metrics-grid"),
  highlightGrid: document.querySelector("#highlight-grid"),
  hourlyForecast: document.querySelector("#hourly-forecast"),
  dailyForecast: document.querySelector("#daily-forecast"),
  savedLocations: document.querySelector("#saved-locations")
};

const state = {
  unit: "celsius",
  temperatureSymbol: "C",
  speedUnit: "kmh",
  speedLabel: "km/h",
  savedLocations: [],
  activeLocation: null,
  weather: null,
  deferredInstallPrompt: null
};

init();

function init() {
  loadSettings();
  loadSavedLocations();
  attachEvents();
  renderSavedLocations();
  updateUnitButton();
  loadDefaultLocation();
}

function attachEvents() {
  searchForm.addEventListener("submit", handleSearch);
  currentLocationButton.addEventListener("click", useCurrentLocation);
  saveLocationButton.addEventListener("click", saveActiveLocation);
  unitToggleButton.addEventListener("click", toggleUnits);
  installAppButton.addEventListener("click", installApp);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    installAppButton.hidden = false;
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Leave the app functional even if service worker registration fails.
    });
  }
}

async function loadDefaultLocation() {
  const initialLocation = state.savedLocations[0] || {
    name: "London",
    country: "United Kingdom",
    admin1: "England",
    latitude: 51.5072,
    longitude: -0.1276,
    timezone: "Europe/London"
  };

  await selectLocation(initialLocation);
}

async function handleSearch(event) {
  event.preventDefault();
  const query = searchInput.value.trim();

  if (query.length < 2) {
    setFeedback("Enter at least two characters to search.");
    return;
  }

  setFeedback("Searching locations...");
  searchResults.innerHTML = "";
  setStatus("Searching");

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "8");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("Location search failed.");
    }

    const data = await response.json();
    const results = data.results || [];

    if (!results.length) {
      setFeedback("No matching locations found.");
      setStatus("Ready");
      return;
    }

    setFeedback(`Found ${results.length} location${results.length === 1 ? "" : "s"}.`);
    renderSearchResults(results);
    setStatus("Ready");
  } catch (error) {
    setFeedback("Unable to search right now. Check your connection and try again.");
    setStatus("Offline");
  }
}

function renderSearchResults(results) {
  searchResults.innerHTML = "";

  results.forEach((result) => {
    const card = resultTemplate.content.firstElementChild.cloneNode(true);
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    title.textContent = `${result.name}, ${result.country}`;
    meta.className = "result-meta";
    meta.textContent = [result.admin1, result.timezone].filter(Boolean).join(" / ");
    card.replaceChildren(title, meta);
    card.addEventListener("click", async () => {
      await selectLocation(result);
      searchResults.innerHTML = "";
      searchInput.value = `${result.name}`;
      setFeedback(`Loaded ${result.name}.`);
    });
    searchResults.appendChild(card);
  });
}

async function selectLocation(location) {
  state.activeLocation = normalizeLocation(location);
  setStatus("Loading");
  setFeedback(`Loading weather for ${state.activeLocation.name}...`);

  try {
    const weather = await fetchWeather(state.activeLocation);
    state.weather = weather;
    renderWeather();
    setFeedback(`Updated ${state.activeLocation.name}.`);
    setStatus("Live");
  } catch (error) {
    setFeedback("Unable to load forecast right now.");
    setStatus("Offline");
  }
}

async function fetchWeather(location) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");
  url.searchParams.set("current", [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m"
  ].join(","));
  url.searchParams.set("hourly", [
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "weather_code",
    "wind_speed_10m"
  ].join(","));
  url.searchParams.set("daily", [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "sunrise",
    "sunset",
    "precipitation_probability_max",
    "wind_speed_10m_max"
  ].join(","));
  url.searchParams.set("temperature_unit", state.unit);
  url.searchParams.set("wind_speed_unit", state.speedUnit);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Forecast request failed.");
  }

  return response.json();
}

function renderWeather() {
  if (!state.activeLocation || !state.weather) {
    return;
  }

  const { current, daily, hourly } = state.weather;
  const currentWeather = describeWeather(current.weather_code, current.is_day);
  const temperature = formatTemperature(current.temperature_2m);

  elements.locationName.textContent = state.activeLocation.name;
  elements.locationMeta.textContent = [
    state.activeLocation.admin1,
    state.activeLocation.country,
    state.weather.timezone
  ].filter(Boolean).join(" / ");
  elements.currentTemp.textContent = temperature;
  elements.conditionText.textContent = currentWeather.label;
  elements.conditionGlyph.textContent = currentWeather.icon;
  elements.conditionArt.className = `condition-art ${currentWeather.tone}`;
  elements.lastUpdated.textContent = `Updated ${formatTimestamp(new Date())}`;

  renderMetrics([
    ["Feels Like", formatTemperature(current.apparent_temperature)],
    ["Humidity", `${Math.round(current.relative_humidity_2m)}%`],
    ["Wind", `${Math.round(current.wind_speed_10m)} ${state.speedLabel}`],
    ["Direction", `${Math.round(current.wind_direction_10m)} deg`]
  ]);

  renderHighlights(daily);
  renderHourly(hourly);
  renderDaily(daily);
}

function renderMetrics(items) {
  elements.metricsGrid.innerHTML = items.map(([label, value]) => `
    <article class="metric-card">
      <span class="detail-label">${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderHighlights(daily) {
  const today = 0;
  const sunrise = formatTime(daily.sunrise[today]);
  const sunset = formatTime(daily.sunset[today]);
  const rainChance = daily.precipitation_probability_max[today];
  const windMax = Math.round(daily.wind_speed_10m_max[today]);

  const items = [
    ["High / Low", `${formatTemperature(daily.temperature_2m_max[today])} / ${formatTemperature(daily.temperature_2m_min[today])}`],
    ["Rain Chance", `${Math.round(rainChance)}%`],
    ["Sunrise", sunrise],
    ["Sunset", sunset],
    ["Peak Wind", `${windMax} ${state.speedLabel}`],
    ["Daylight", getDaylightLength(daily.sunrise[today], daily.sunset[today])]
  ];

  elements.highlightGrid.innerHTML = items.map(([label, value]) => `
    <article class="highlight-card">
      <span class="detail-label">${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderHourly(hourly) {
  const startIndex = findClosestHourIndex(hourly.time);
  const sliceEnd = Math.min(startIndex + 24, hourly.time.length);
  const cards = [];

  for (let index = startIndex; index < sliceEnd; index += 1) {
    const weather = describeWeather(hourly.weather_code[index], isDayTimeFromHour(hourly.time[index]));
    cards.push(`
      <article class="hour-card">
        <time>${formatHour(hourly.time[index])}</time>
        <span class="hour-icon">${weather.icon}</span>
        <strong>${formatTemperature(hourly.temperature_2m[index])}</strong>
        <div class="forecast-subtle">Feels ${formatTemperature(hourly.apparent_temperature[index])}</div>
        <div class="forecast-subtle">Rain ${Math.round(hourly.precipitation_probability[index] || 0)}%</div>
        <div class="forecast-subtle">Wind ${Math.round(hourly.wind_speed_10m[index])} ${state.speedLabel}</div>
      </article>
    `);
  }

  elements.hourlyForecast.innerHTML = cards.join("");
}

function renderDaily(daily) {
  elements.dailyForecast.innerHTML = daily.time.map((day, index) => {
    const weather = describeWeather(daily.weather_code[index], true);
    return `
      <article class="day-card">
        <time>${formatDay(day, index)}</time>
        <span class="day-icon">${weather.icon}</span>
        <div class="forecast-subtle">${weather.label}</div>
        <strong>${formatTemperature(daily.temperature_2m_max[index])} / ${formatTemperature(daily.temperature_2m_min[index])}</strong>
        <div class="forecast-subtle">Rain ${Math.round(daily.precipitation_probability_max[index] || 0)}%</div>
      </article>
    `;
  }).join("");
}

function loadSavedLocations() {
  try {
    const raw = localStorage.getItem(SAVED_LOCATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.savedLocations = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.savedLocations = [];
  }
}

function renderSavedLocations() {
  if (!state.savedLocations.length) {
    elements.savedLocations.innerHTML = `<div class="saved-empty">No saved places yet. Search for somewhere and tap Save Place.</div>`;
    return;
  }

  elements.savedLocations.innerHTML = "";

  state.savedLocations.forEach((location, index) => {
    const card = document.createElement("article");
    card.className = "saved-card";
    const main = document.createElement("div");
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    const actions = document.createElement("div");
    const loadButton = document.createElement("button");
    const removeButton = document.createElement("button");

    main.className = "saved-main";
    actions.className = "saved-actions";
    loadButton.className = "saved-action saved-action--load";
    removeButton.className = "saved-action saved-action--remove";
    loadButton.type = "button";
    removeButton.type = "button";

    title.textContent = location.name;
    meta.textContent = [location.admin1, location.country].filter(Boolean).join(" / ");
    loadButton.textContent = "Load";
    removeButton.textContent = "Remove";

    loadButton.addEventListener("click", () => selectLocation(location));
    removeButton.addEventListener("click", () => removeSavedLocation(index));

    main.append(title, meta);
    actions.append(loadButton, removeButton);
    card.append(main, actions);
    elements.savedLocations.appendChild(card);
  });
}

function saveActiveLocation() {
  if (!state.activeLocation) {
    return;
  }

  const exists = state.savedLocations.some((location) => isSameLocation(location, state.activeLocation));
  if (exists) {
    setFeedback(`${state.activeLocation.name} is already saved.`);
    return;
  }

  state.savedLocations = [state.activeLocation, ...state.savedLocations].slice(0, 8);
  persistSavedLocations();
  renderSavedLocations();
  setFeedback(`Saved ${state.activeLocation.name}.`);
}

function removeSavedLocation(index) {
  state.savedLocations.splice(index, 1);
  persistSavedLocations();
  renderSavedLocations();
  setFeedback("Saved place removed.");
}

function persistSavedLocations() {
  localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(state.savedLocations));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed?.unit === "fahrenheit") {
      state.unit = "fahrenheit";
      state.temperatureSymbol = "F";
      state.speedUnit = "mph";
      state.speedLabel = "mph";
    }
  } catch {
    // Ignore broken saved settings.
  }
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ unit: state.unit }));
}

async function toggleUnits() {
  if (state.unit === "celsius") {
    state.unit = "fahrenheit";
    state.temperatureSymbol = "F";
    state.speedUnit = "mph";
    state.speedLabel = "mph";
  } else {
    state.unit = "celsius";
    state.temperatureSymbol = "C";
    state.speedUnit = "kmh";
    state.speedLabel = "km/h";
  }

  persistSettings();
  updateUnitButton();

  if (state.activeLocation) {
    await selectLocation(state.activeLocation);
  }
}

function updateUnitButton() {
  const useFahrenheit = state.unit === "celsius";
  unitToggleButton.textContent = useFahrenheit ? "Switch to F" : "Switch to C";
  unitToggleButton.setAttribute("aria-pressed", String(!useFahrenheit));
}

async function useCurrentLocation() {
  if (!("geolocation" in navigator)) {
    setFeedback("Geolocation is not available in this browser.");
    return;
  }

  setFeedback("Checking your location...");
  setStatus("Locating");

  navigator.geolocation.getCurrentPosition(async (position) => {
    const location = {
      name: "Current Location",
      country: "",
      admin1: "",
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    await selectLocation(location);
  }, () => {
    setFeedback("Location access was denied or unavailable.");
    setStatus("Ready");
  }, {
    enableHighAccuracy: true,
    timeout: 10000
  });
}

function normalizeLocation(location) {
  return {
    name: location.name,
    country: location.country || "",
    admin1: location.admin1 || "",
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    timezone: location.timezone || ""
  };
}

function isSameLocation(a, b) {
  return a.name === b.name
    && Number(a.latitude).toFixed(3) === Number(b.latitude).toFixed(3)
    && Number(a.longitude).toFixed(3) === Number(b.longitude).toFixed(3);
}

function setFeedback(message) {
  searchFeedback.textContent = message;
}

function setStatus(message) {
  statusPill.textContent = message;
}

function findClosestHourIndex(times) {
  const now = Date.now();
  let closestIndex = 0;
  let smallestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const distance = Math.abs(new Date(time).getTime() - now);
    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatHour(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric"
  }).format(new Date(value));
}

function formatDay(value, index) {
  if (index === 0) {
    return "Today";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short"
  }).format(new Date(value));
}

function formatTemperature(value) {
  return `${Math.round(value)} ${state.temperatureSymbol}`;
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    weekday: "short"
  }).format(value);
}

function getDaylightLength(sunrise, sunset) {
  const diff = new Date(sunset).getTime() - new Date(sunrise).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.round((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

async function installApp() {
  if (!state.deferredInstallPrompt) {
    setFeedback("On iPhone, use Share then Add to Home Screen after hosting the app.");
    return;
  }

  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  installAppButton.hidden = true;
}

function isDayTimeFromHour(value) {
  const hour = new Date(value).getHours();
  return hour >= 6 && hour < 20;
}

function describeWeather(code, isDay) {
  const map = {
    0: { label: "Clear", icon: isDay ? "SUN" : "MOON", tone: "is-sun" },
    1: { label: "Mostly Clear", icon: isDay ? "FAIR" : "MOON", tone: "is-sun" },
    2: { label: "Partly Cloudy", icon: "PART", tone: "is-cloud" },
    3: { label: "Overcast", icon: "CLOUD", tone: "is-cloud" },
    45: { label: "Fog", icon: "FOG", tone: "is-fog" },
    48: { label: "Rime Fog", icon: "FOG", tone: "is-fog" },
    51: { label: "Light Drizzle", icon: "DRIZ", tone: "is-rain" },
    53: { label: "Drizzle", icon: "DRIZ", tone: "is-rain" },
    55: { label: "Dense Drizzle", icon: "RAIN", tone: "is-rain" },
    56: { label: "Freezing Drizzle", icon: "RAIN", tone: "is-rain" },
    57: { label: "Heavy Freezing Drizzle", icon: "RAIN", tone: "is-rain" },
    61: { label: "Light Rain", icon: "RAIN", tone: "is-rain" },
    63: { label: "Rain", icon: "RAIN", tone: "is-rain" },
    65: { label: "Heavy Rain", icon: "RAIN", tone: "is-rain" },
    66: { label: "Freezing Rain", icon: "RAIN", tone: "is-rain" },
    67: { label: "Heavy Freezing Rain", icon: "RAIN", tone: "is-rain" },
    71: { label: "Light Snow", icon: "SNOW", tone: "is-snow" },
    73: { label: "Snow", icon: "SNOW", tone: "is-snow" },
    75: { label: "Heavy Snow", icon: "SNOW", tone: "is-snow" },
    77: { label: "Snow Grains", icon: "SNOW", tone: "is-snow" },
    80: { label: "Rain Showers", icon: "SHWR", tone: "is-rain" },
    81: { label: "Heavy Showers", icon: "SHWR", tone: "is-rain" },
    82: { label: "Violent Showers", icon: "STORM", tone: "is-storm" },
    85: { label: "Snow Showers", icon: "SNOW", tone: "is-snow" },
    86: { label: "Heavy Snow Showers", icon: "SNOW", tone: "is-snow" },
    95: { label: "Thunderstorm", icon: "STORM", tone: "is-storm" },
    96: { label: "Storm With Hail", icon: "STORM", tone: "is-storm" },
    99: { label: "Severe Storm", icon: "STORM", tone: "is-storm" }
  };

  return map[code] || { label: "Unknown", icon: "UNKN", tone: "is-cloud" };
}
