const CONFIG = {
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  latitude: Number(process.env.LATITUDE ?? '35.5086'),
  longitude: Number(process.env.LONGITUDE ?? '139.6763'),
  timezone: process.env.TIMEZONE ?? 'Asia/Tokyo',
  placeName: process.env.PLACE_NAME ?? '横浜市鶴見区付近',
  title: process.env.POST_TITLE ?? '天気予報',
  hours: Number(process.env.FORECAST_HOURS ?? '12'),
  rainThreshold: Number(process.env.RAIN_THRESHOLD ?? '40'),
};

if (!CONFIG.webhookUrl) {
  throw new Error('DISCORD_WEBHOOK_URL is required. Set it as a GitHub Actions secret.');
}
if (!Number.isFinite(CONFIG.latitude) || !Number.isFinite(CONFIG.longitude)) {
  throw new Error('LATITUDE and LONGITUDE must be valid numbers.');
}

const weatherCodeMap = new Map([
  [0, '快晴'], [1, '晴れ'], [2, '一部くもり'], [3, 'くもり'],
  [45, '霧'], [48, '着氷性の霧'],
  [51, '弱い霧雨'], [53, '霧雨'], [55, '強い霧雨'],
  [56, '弱い着氷性霧雨'], [57, '強い着氷性霧雨'],
  [61, '小雨'], [63, '雨'], [65, '強い雨'],
  [66, '弱い着氷性雨'], [67, '強い着氷性雨'],
  [71, '小雪'], [73, '雪'], [75, '強い雪'], [77, '雪粒'],
  [80, '弱いにわか雨'], [81, 'にわか雨'], [82, '激しいにわか雨'],
  [85, '弱いにわか雪'], [86, '強いにわか雪'],
  [95, '雷雨'], [96, '雷雨・弱い雹'], [99, '雷雨・強い雹'],
]);

function wdesc(code) {
  return weatherCodeMap.get(code) ?? `天気コード${code}`;
}

function hourLabel(isoTime) {
  const d = new Date(isoTime);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: CONFIG.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function dateTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: CONFIG.timezone,
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function makeOpenMeteoUrl() {
  const params = new URLSearchParams({
    latitude: String(CONFIG.latitude),
    longitude: String(CONFIG.longitude),
    timezone: CONFIG.timezone,
    forecast_days: '2',
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'rain',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

function pickUpcomingHours(data) {
  const now = new Date();
  const times = data.hourly.time;
  const rows = times.map((t, i) => ({
    time: t,
    date: new Date(t),
    temp: data.hourly.temperature_2m[i],
    humidity: data.hourly.relative_humidity_2m[i],
    pop: data.hourly.precipitation_probability[i],
    precipitation: data.hourly.precipitation[i],
    code: data.hourly.weather_code[i],
    wind: data.hourly.wind_speed_10m[i],
    gust: data.hourly.wind_gusts_10m[i],
  }));
  return rows.filter(r => r.date >= now).slice(0, CONFIG.hours);
}

function buildMessage(data) {
  const current = data.current;
  const upcoming = pickUpcomingHours(data);
  const rainHours = upcoming.filter(r => (r.pop ?? 0) >= CONFIG.rainThreshold || (r.precipitation ?? 0) > 0);
  const maxPop = Math.max(...upcoming.map(r => r.pop ?? 0));
  const maxWind = Math.max(...upcoming.map(r => r.wind ?? 0));
  const maxGust = Math.max(...upcoming.map(r => r.gust ?? 0));

  const lines = [];
  lines.push(`**${CONFIG.title}｜${CONFIG.placeName}**`);
  lines.push(`${dateTimeLabel()} 現在`);
  lines.push('');
  lines.push(`現在: ${wdesc(current.weather_code)} / ${Math.round(current.temperature_2m)}℃ / 湿度${Math.round(current.relative_humidity_2m)}% / 風${Math.round(current.wind_speed_10m)}km/h / 突風${Math.round(current.wind_gusts_10m)}km/h`);
  lines.push(`今後${upcoming.length}時間: 最大降水確率${maxPop}% / 最大風速${Math.round(maxWind)}km/h / 最大突風${Math.round(maxGust)}km/h`);

  if (rainHours.length > 0) {
    const rainText = rainHours
      .slice(0, 8)
      .map(r => `${hourLabel(r.time)} ${r.pop}% ${wdesc(r.code)}`)
      .join(' / ');
    lines.push(`雨注意: ${rainText}`);
  } else {
    lines.push(`雨注意: ${CONFIG.rainThreshold}%以上の時間帯なし`);
  }

  lines.push('');
  lines.push('```');
  lines.push('時刻  天気        気温  降水  風/突風');
  for (const r of upcoming.slice(0, 8)) {
    const time = hourLabel(r.time).padEnd(5, ' ');
    const desc = wdesc(r.code).padEnd(6, '　').slice(0, 6);
    const temp = `${Math.round(r.temp)}℃`.padStart(4, ' ');
    const pop = `${r.pop ?? '-'}%`.padStart(4, ' ');
    const wind = `${Math.round(r.wind)}/${Math.round(r.gust)}kmh`;
    lines.push(`${time} ${desc} ${temp} ${pop} ${wind}`);
  }
  lines.push('```');

  let message = lines.join('\n');
  if (message.length > 1900) {
    message = message.slice(0, 1880) + '\n…';
  }
  return message;
}

async function postToDiscord(content) {
  await fetchJson(CONFIG.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

const data = await fetchJson(makeOpenMeteoUrl());
const message = buildMessage(data);
console.log(message);
await postToDiscord(message);
