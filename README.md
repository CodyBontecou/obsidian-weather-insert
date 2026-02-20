# Weather Insert

A minimal Obsidian plugin that inserts a single line of current weather into your note at the cursor. Perfect for daily journals.

No API key required — uses [Open-Meteo](https://open-meteo.com/) (recommended) or [wttr.in](https://wttr.in/) as weather sources.

## What it does

Run the **"Insert current weather"** command and get a line like:

```
☀️ 72°F, Clear sky | Wind: 5 mph
```

That's it. No status bar widgets, no weather panels, no dashboards — just a quick weather line in your note.

## Commands

| Command | Description |
|---------|-------------|
| **Insert current weather** | Inserts a formatted weather line at the cursor |
| **Insert weather into frontmatter** | Adds weather data as frontmatter properties |

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Location** | City name (e.g. "New York", "Tokyo") | — |
| **Units** | Imperial (°F, mph) or Metric (°C, km/h) | Imperial |
| **Weather source** | Open-Meteo (recommended) or wttr.in | Open-Meteo |
| **Format template** | Customizable output using tokens | `{icon} {temp}, {conditions} \| Wind: {wind}` |
| **Show wind** | Include wind speed | ✓ |
| **Show humidity** | Include humidity | ✗ |

## Format Tokens

Customize the format template with these tokens:

| Token | Example |
|-------|---------|
| `{icon}` | ☀️ |
| `{temp}` | 72°F |
| `{conditions}` | Clear sky |
| `{wind}` | 5 mph |
| `{humidity}` | 45% |
| `{feelsLike}` | 70°F |
| `{location}` | New York, New York |

### Example formats

```
{icon} {temp}, {conditions}
→ ☀️ 72°F, Clear sky

Weather: {icon} {temp} ({feelsLike} feels like) — {conditions}
→ Weather: ☀️ 72°F (70°F feels like) — Clear sky

{location}: {icon} {temp} | Wind: {wind} | Humidity: {humidity}
→ New York, New York: ☀️ 72°F | Wind: 5 mph | Humidity: 45%
```

## Frontmatter mode

The **"Insert weather into frontmatter"** command adds structured weather data to your note's YAML frontmatter:

```yaml
---
weather_temp: "72°F"
weather_conditions: "Clear sky"
weather_icon: "☀️"
weather_wind: "5 mph"
weather_humidity: "45%"
weather_location: "New York, New York"
---
```

This is useful for Dataview queries or Bases tables that track weather across journal entries.

## Installation

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder `<vault>/.obsidian/plugins/obsidian-weather-insert/`
3. Copy the files into that folder
4. Enable the plugin in Settings → Community Plugins

## Credits

- [Open-Meteo](https://open-meteo.com/) — free weather API, no key required
- [wttr.in](https://wttr.in/) — console weather service
