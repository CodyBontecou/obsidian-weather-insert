import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	requestUrl,
} from "obsidian";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeatherInsertSettings {
	location: string;
	units: "metric" | "imperial";
	format: string;
	apiProvider: "wttr" | "openmeteo";
	showWind: boolean;
	showHumidity: boolean;
}

const DEFAULT_SETTINGS: WeatherInsertSettings = {
	location: "",
	units: "imperial",
	format: "{icon} {temp}, {conditions} | Wind: {wind}",
	apiProvider: "openmeteo",
	showWind: true,
	showHumidity: false,
};

interface WeatherData {
	temp: string;
	conditions: string;
	icon: string;
	wind: string;
	humidity: string;
	feelsLike: string;
	location: string;
}

// ---------------------------------------------------------------------------
// Weather condition → emoji mapping
// ---------------------------------------------------------------------------

function wmoCodeToCondition(code: number): { text: string; icon: string } {
	// WMO Weather interpretation codes (WW)
	// https://open-meteo.com/en/docs
	const map: Record<number, { text: string; icon: string }> = {
		0: { text: "Clear sky", icon: "☀️" },
		1: { text: "Mainly clear", icon: "🌤" },
		2: { text: "Partly cloudy", icon: "⛅" },
		3: { text: "Overcast", icon: "☁️" },
		45: { text: "Fog", icon: "🌫" },
		48: { text: "Depositing rime fog", icon: "🌫" },
		51: { text: "Light drizzle", icon: "🌦" },
		53: { text: "Moderate drizzle", icon: "🌦" },
		55: { text: "Dense drizzle", icon: "🌧" },
		56: { text: "Light freezing drizzle", icon: "🌧" },
		57: { text: "Dense freezing drizzle", icon: "🌧" },
		61: { text: "Slight rain", icon: "🌦" },
		63: { text: "Moderate rain", icon: "🌧" },
		65: { text: "Heavy rain", icon: "🌧" },
		66: { text: "Light freezing rain", icon: "🌧" },
		67: { text: "Heavy freezing rain", icon: "🌧" },
		71: { text: "Slight snow", icon: "🌨" },
		73: { text: "Moderate snow", icon: "🌨" },
		75: { text: "Heavy snow", icon: "❄️" },
		77: { text: "Snow grains", icon: "❄️" },
		80: { text: "Slight rain showers", icon: "🌦" },
		81: { text: "Moderate rain showers", icon: "🌧" },
		82: { text: "Violent rain showers", icon: "🌧" },
		85: { text: "Slight snow showers", icon: "🌨" },
		86: { text: "Heavy snow showers", icon: "❄️" },
		95: { text: "Thunderstorm", icon: "⛈" },
		96: { text: "Thunderstorm with slight hail", icon: "⛈" },
		99: { text: "Thunderstorm with heavy hail", icon: "⛈" },
	};
	return map[code] ?? { text: "Unknown", icon: "🌡" };
}

// ---------------------------------------------------------------------------
// Geocoding (Open-Meteo geocoding API, no key required)
// ---------------------------------------------------------------------------

interface GeoResult {
	latitude: number;
	longitude: number;
	name: string;
	country: string;
	admin1?: string;
}

async function geocode(location: string): Promise<GeoResult> {
	const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
	const resp = await requestUrl({ url });
	const data = resp.json;
	if (!data.results || data.results.length === 0) {
		throw new Error(`Location "${location}" not found. Try a city name like "New York" or "London".`);
	}
	const r = data.results[0];
	return {
		latitude: r.latitude,
		longitude: r.longitude,
		name: r.name,
		country: r.country,
		admin1: r.admin1,
	};
}

// ---------------------------------------------------------------------------
// Fetch weather from Open-Meteo (no API key needed)
// ---------------------------------------------------------------------------

async function fetchOpenMeteo(
	location: string,
	units: "metric" | "imperial"
): Promise<WeatherData> {
	const geo = await geocode(location);

	const tempUnit = units === "metric" ? "celsius" : "fahrenheit";
	const windUnit = units === "metric" ? "kmh" : "mph";

	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
		`&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
		`&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}&forecast_days=1`;

	const resp = await requestUrl({ url });
	const data = resp.json;
	const current = data.current;

	const { text, icon } = wmoCodeToCondition(current.weather_code);
	const tempSymbol = units === "metric" ? "°C" : "°F";
	const windLabel = units === "metric" ? "km/h" : "mph";

	const locationLabel = geo.admin1
		? `${geo.name}, ${geo.admin1}`
		: `${geo.name}, ${geo.country}`;

	return {
		temp: `${Math.round(current.temperature_2m)}${tempSymbol}`,
		conditions: text,
		icon,
		wind: `${Math.round(current.wind_speed_10m)} ${windLabel}`,
		humidity: `${current.relative_humidity_2m}%`,
		feelsLike: `${Math.round(current.apparent_temperature)}${tempSymbol}`,
		location: locationLabel,
	};
}

// ---------------------------------------------------------------------------
// Fetch weather from wttr.in (no API key needed)
// ---------------------------------------------------------------------------

async function fetchWttr(
	location: string,
	units: "metric" | "imperial"
): Promise<WeatherData> {
	const unitParam = units === "metric" ? "m" : "u";
	const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1&${unitParam}`;
	const resp = await requestUrl({ url });
	const data = resp.json;

	const current = data.current_condition?.[0];
	if (!current) {
		throw new Error("Could not parse weather data from wttr.in");
	}

	const tempSymbol = units === "metric" ? "°C" : "°F";
	const temp = units === "metric" ? current.temp_C : current.temp_F;
	const feelsLike =
		units === "metric" ? current.FeelsLikeC : current.FeelsLikeF;
	const windSpeed =
		units === "metric" ? current.windspeedKmph : current.windspeedMiles;
	const windLabel = units === "metric" ? "km/h" : "mph";
	const conditions = current.weatherDesc?.[0]?.value ?? "Unknown";

	// Map wttr condition text to an icon
	const icon = conditionTextToIcon(conditions);

	const nearestArea = data.nearest_area?.[0];
	const locName = nearestArea?.areaName?.[0]?.value ?? location;
	const locRegion = nearestArea?.region?.[0]?.value ?? "";

	return {
		temp: `${temp}${tempSymbol}`,
		conditions,
		icon,
		wind: `${windSpeed} ${windLabel}`,
		humidity: `${current.humidity}%`,
		feelsLike: `${feelsLike}${tempSymbol}`,
		location: locRegion ? `${locName}, ${locRegion}` : locName,
	};
}

function conditionTextToIcon(text: string): string {
	const lower = text.toLowerCase();
	if (lower.includes("thunder")) return "⛈";
	if (lower.includes("snow") || lower.includes("blizzard")) return "❄️";
	if (lower.includes("sleet") || lower.includes("freezing")) return "🌨";
	if (lower.includes("heavy rain") || lower.includes("downpour"))
		return "🌧";
	if (lower.includes("rain") || lower.includes("drizzle")) return "🌦";
	if (lower.includes("fog") || lower.includes("mist")) return "🌫";
	if (lower.includes("overcast")) return "☁️";
	if (lower.includes("partly") || lower.includes("cloudy")) return "⛅";
	if (lower.includes("clear") || lower.includes("sunny")) return "☀️";
	return "🌡";
}

// ---------------------------------------------------------------------------
// Format the weather line
// ---------------------------------------------------------------------------

function formatWeather(
	weather: WeatherData,
	format: string,
	settings: WeatherInsertSettings
): string {
	let result = format
		.replace(/{icon}/g, weather.icon)
		.replace(/{temp}/g, weather.temp)
		.replace(/{conditions}/g, weather.conditions)
		.replace(/{wind}/g, weather.wind)
		.replace(/{humidity}/g, weather.humidity)
		.replace(/{feelsLike}/g, weather.feelsLike)
		.replace(/{location}/g, weather.location);

	// Strip wind/humidity segments if disabled
	if (!settings.showWind) {
		result = result.replace(/\s*\|\s*Wind:\s*\S+\s*\S*/g, "");
	}
	if (!settings.showHumidity) {
		result = result.replace(/\s*\|\s*Humidity:\s*\S+/g, "");
	}

	return result.trim();
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default class WeatherInsertPlugin extends Plugin {
	settings: WeatherInsertSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Command: Insert weather at cursor
		this.addCommand({
			id: "insert-weather",
			name: "Insert current weather",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.insertWeather(editor);
			},
		});

		// Command: Insert weather as frontmatter
		this.addCommand({
			id: "insert-weather-frontmatter",
			name: "Insert weather into frontmatter",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				await this.insertWeatherFrontmatter(editor);
			},
		});

		this.addSettingTab(new WeatherInsertSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async fetchWeather(): Promise<WeatherData> {
		const loc = this.settings.location;
		if (!loc) {
			throw new Error(
				"No location set. Open Settings → Weather Insert to configure your location."
			);
		}

		if (this.settings.apiProvider === "wttr") {
			return fetchWttr(loc, this.settings.units);
		}
		return fetchOpenMeteo(loc, this.settings.units);
	}

	async insertWeather(editor: Editor) {
		new Notice("Fetching weather…");
		try {
			const weather = await this.fetchWeather();
			const line = formatWeather(
				weather,
				this.settings.format,
				this.settings
			);
			const cursor = editor.getCursor();
			editor.replaceRange(line, cursor);
			// Move cursor to end of inserted text
			editor.setCursor({
				line: cursor.line,
				ch: cursor.ch + line.length,
			});
			new Notice("Weather inserted ✓");
		} catch (e: any) {
			new Notice(`Weather error: ${e.message}`);
			console.error("Weather Insert:", e);
		}
	}

	async insertWeatherFrontmatter(editor: Editor) {
		new Notice("Fetching weather…");
		try {
			const weather = await this.fetchWeather();
			const content = editor.getValue();

			const fmFields = [
				`weather_temp: "${weather.temp}"`,
				`weather_conditions: "${weather.conditions}"`,
				`weather_icon: "${weather.icon}"`,
				`weather_wind: "${weather.wind}"`,
				`weather_humidity: "${weather.humidity}"`,
				`weather_location: "${weather.location}"`,
			].join("\n");

			if (content.startsWith("---")) {
				// Insert before closing ---
				const closingIdx = content.indexOf("---", 3);
				if (closingIdx !== -1) {
					const before = content.slice(0, closingIdx);
					const after = content.slice(closingIdx);
					editor.setValue(before + fmFields + "\n" + after);
				}
			} else {
				// Create new frontmatter block
				editor.setValue(
					"---\n" + fmFields + "\n---\n\n" + content
				);
			}
			new Notice("Weather added to frontmatter ✓");
		} catch (e: any) {
			new Notice(`Weather error: ${e.message}`);
			console.error("Weather Insert:", e);
		}
	}
}

// ---------------------------------------------------------------------------
// Settings Tab
// ---------------------------------------------------------------------------

class WeatherInsertSettingTab extends PluginSettingTab {
	plugin: WeatherInsertPlugin;

	constructor(app: App, plugin: WeatherInsertPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Weather Insert" });

		new Setting(containerEl)
			.setName("Location")
			.setDesc(
				"City name (e.g. \"New York\", \"London\", \"Tokyo\"). Used for geocoding."
			)
			.addText((text) =>
				text
					.setPlaceholder("New York")
					.setValue(this.plugin.settings.location)
					.onChange(async (value) => {
						this.plugin.settings.location = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Units")
			.setDesc("Temperature and wind speed units.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("imperial", "Imperial (°F, mph)")
					.addOption("metric", "Metric (°C, km/h)")
					.setValue(this.plugin.settings.units)
					.onChange(async (value) => {
						this.plugin.settings.units = value as
							| "metric"
							| "imperial";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Weather source")
			.setDesc(
				"Open-Meteo is more reliable. wttr.in is a fallback option."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openmeteo", "Open-Meteo (recommended)")
					.addOption("wttr", "wttr.in")
					.setValue(this.plugin.settings.apiProvider)
					.onChange(async (value) => {
						this.plugin.settings.apiProvider = value as
							| "wttr"
							| "openmeteo";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Format template")
			.setDesc(
				"Available tokens: {icon} {temp} {conditions} {wind} {humidity} {feelsLike} {location}"
			)
			.addTextArea((text) =>
				text
					.setPlaceholder(
						"{icon} {temp}, {conditions} | Wind: {wind}"
					)
					.setValue(this.plugin.settings.format)
					.onChange(async (value) => {
						this.plugin.settings.format = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show wind")
			.setDesc("Include wind speed in the default format.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showWind)
					.onChange(async (value) => {
						this.plugin.settings.showWind = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Show humidity")
			.setDesc("Include humidity percentage in the default format.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showHumidity)
					.onChange(async (value) => {
						this.plugin.settings.showHumidity = value;
						await this.plugin.saveSettings();
					})
			);

		// Preview section
		containerEl.createEl("h3", { text: "Preview" });
		const previewEl = containerEl.createEl("div", {
			cls: "weather-insert-preview",
		});
		previewEl.style.padding = "12px";
		previewEl.style.background = "var(--background-secondary)";
		previewEl.style.borderRadius = "6px";
		previewEl.style.fontFamily = "var(--font-monospace)";
		previewEl.style.marginBottom = "12px";

		const previewBtn = containerEl.createEl("button", {
			text: "Fetch preview",
		});
		previewBtn.addEventListener("click", async () => {
			previewEl.setText("Fetching…");
			try {
				const weather =
					this.plugin.settings.apiProvider === "wttr"
						? await fetchWttr(
								this.plugin.settings.location,
								this.plugin.settings.units
							)
						: await fetchOpenMeteo(
								this.plugin.settings.location,
								this.plugin.settings.units
							);
				const line = formatWeather(
					weather,
					this.plugin.settings.format,
					this.plugin.settings
				);
				previewEl.setText(line);
			} catch (e: any) {
				previewEl.setText(`Error: ${e.message}`);
			}
		});
	}
}
