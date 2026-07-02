const CONFIG = {
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  timezone: process.env.TIMEZONE ?? 'Asia/Tokyo',
  reportMode: process.env.REPORT_MODE ?? 'auto', // auto | full | tsurumi24
  rainMmThreshold24h: Number(process.env.RAIN_MM_THRESHOLD_24H ?? '0.5'),
  rainMmThresholdLong: Number(process.env.RAIN_MM_THRESHOLD_LONG ?? '1'),
  strongWindThreshold: Number(process.env.STRONG_WIND_THRESHOLD ?? '8'),
  strongGustThreshold: Number(process.env.STRONG_GUST_THRESHOLD ?? '15'),
};

if (!CONFIG.webhookUrl) {
  throw new Error('DISCORD_WEBHOOK_URL is required. Set it as a GitHub Actions secret.');
}

const LOCATIONS = {
  tsurumi: { name: '鶴見駅', latitude: 35.5086, longitude: 139.6761 },
  kawasaki: { name: '川崎駅', latitude: 35.5313, longitude: 139.6968 },
  yokohama: { name: '横浜駅', latitude: 35.4658, longitude: 139.6223 },
  musashiKosugi: { name: '武蔵小杉駅', latitude: 35.5765, longitude: 139.6596 },
  kamata: { name: '蒲田駅', latitude: 35.5625, longitude: 139.7160 },
  futamatagawa: { name: '二俣川駅', latitude: 35.4633, longitude: 139.5325 },
  higashiTotsuka: { name: '東戸塚駅', latitude: 35.4308, longitude: 139.5569 },
  suidobashi: { name: '水道橋駅', latitude: 35.7020, longitude: 139.7538 },
};

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
  return weatherCodeMap.get(Number(code)) ?? `天気コード${code}`;
}

function weatherEmoji(code) {
  const c = Number(code);
  if ([95, 96, 99].includes(c)) return '⛈️';
  if ([71, 73, 75, 77, 85, 86].includes(c)) return '❄️';
  if ([63, 65, 67, 80, 81, 82].includes(c)) return '🌧️';
  if ([51, 53, 55, 56, 57, 61, 66].includes(c)) return '☔';
  if ([45, 48].includes(c)) return '🌫️';
  if (c === 0 || c === 1) return '☀️';
  if (c === 2) return '🌤️';
  if (c === 3) return '☁️';
  return '🌦️';
}

function wemojiDesc(code) {
  return `${weatherEmoji(code)} ${wdesc(code)}`;
}

function rainEmoji(mm) {
  return Number(mm ?? 0) > 0 ? '💧' : '降水';
}

function windEmoji(wind, gust) {
  return isStrongWindHour({ wind, gust }) ? '⚠️🌬️' : '🌬️';
}

function nowJst() {
  // GitHub Actionsの実行環境はUTC想定なので、JST判定用にIntlで部品を取り出す。
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    dateString: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateTimeLabel(date = new Date()) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: CONFIG.timezone,
    month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function dateLabel(dateString) {
  const d = new Date(`${dateString}T00:00:00+09:00`);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: CONFIG.timezone,
    month: '2-digit', day: '2-digit', weekday: 'short',
  }).format(d);
}

function hourLabel(isoTime) {
  const d = new Date(`${isoTime}+09:00`);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: CONFIG.timezone,
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function makeForecastUrl(location, forecastDays = 4) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: CONFIG.timezone,
    forecast_days: String(forecastDays),
    wind_speed_unit: 'ms',
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'rain',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
    ].join(','),
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

function makeArchiveUrl(location, startDate, endDate) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start_date: startDate,
    end_date: endDate,
    timezone: CONFIG.timezone,
    wind_speed_unit: 'ms',
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
    ].join(','),
  });
  return `https://archive-api.open-meteo.com/v1/archive?${params}`;
}

function hourlyRows(data) {
  return data.hourly.time.map((time, i) => ({
    time,
    temp: data.hourly.temperature_2m?.[i],
    humidity: data.hourly.relative_humidity_2m?.[i],
    apparent: data.hourly.apparent_temperature?.[i],
    pop: data.hourly.precipitation_probability?.[i],
    precipitation: data.hourly.precipitation?.[i],
    code: data.hourly.weather_code?.[i],
    wind: data.hourly.wind_speed_10m?.[i],
    gust: data.hourly.wind_gusts_10m?.[i],
  }));
}

function future24hRows(data) {
  const now = new Date();
  return hourlyRows(data)
    .filter(r => new Date(`${r.time}+09:00`) >= now)
    .slice(0, 24);
}

function isRainHour24h(row) {
  return Number(row.precipitation ?? 0) >= CONFIG.rainMmThreshold24h;
}

function isRainHourLong(row) {
  return Number(row.precipitation ?? 0) >= CONFIG.rainMmThresholdLong;
}

function isStrongWindHour(row) {
  return Number(row.wind ?? 0) >= CONFIG.strongWindThreshold || Number(row.gust ?? 0) >= CONFIG.strongGustThreshold;
}

function isThreeHourSlot(row) {
  const hour = Number(row.time.slice(11, 13));
  return hour % 3 === 0;
}

function fmt1(n, unit = '') {
  return Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}${unit}` : '-';
}

function fmt0(n, unit = '') {
  return Number.isFinite(Number(n)) ? `${Math.round(Number(n))}${unit}` : '-';
}

function dailyRows(data) {
  return data.daily.time.map((time, i) => ({
    date: time,
    code: data.daily.weather_code?.[i],
    tmax: data.daily.temperature_2m_max?.[i],
    tmin: data.daily.temperature_2m_min?.[i],
    tmean: data.daily.temperature_2m_mean?.[i],
    precip: data.daily.precipitation_sum?.[i],
    popMax: data.daily.precipitation_probability_max?.[i],
    windMax: data.daily.wind_speed_10m_max?.[i],
    gustMax: data.daily.wind_gusts_10m_max?.[i],
  }));
}

function buildTsurumi24hReport(data) {
  const current = data.current;
  const rows24 = future24hRows(data);
  const displayRows = rows24.filter(r => isThreeHourSlot(r) || isRainHour24h(r) || isStrongWindHour(r));
  const maxPrecip = Math.max(...rows24.map(r => Number(r.precipitation ?? 0)));
  const maxPop = Math.max(...rows24.map(r => Number(r.pop ?? 0)));
  const maxWind = Math.max(...rows24.map(r => Number(r.wind ?? 0)));
  const maxGust = Math.max(...rows24.map(r => Number(r.gust ?? 0)));

  const lines = [];
  lines.push(`**① 鶴見駅 24時間詳細予報**`);
  lines.push('');
  lines.push(`${dateTimeLabel()} 現在`);
  lines.push(`現在: ${wemojiDesc(current.weather_code)} / 🌡️ ${fmt1(current.temperature_2m, '℃')} / 体感${fmt1(current.apparent_temperature, '℃')} / 💧 湿度${fmt0(current.relative_humidity_2m, '%')} / 🌬️ 風${fmt1(current.wind_speed_10m, 'm/s')} / 突風${fmt1(current.wind_gusts_10m, 'm/s')}`);
  lines.push(`24時間内: 💧 最大降水量${fmt1(maxPrecip, 'mm/h')} / 最大降水確率${fmt0(maxPop, '%')} / 🌬️ 最大風速${fmt1(maxWind, 'm/s')} / 最大突風${fmt1(maxGust, 'm/s')}`);
  
  lines.push('');
  lines.push('');
  
  // 3時間ごとを基本に、降水量0.5mm/h以上または強風の時間を追加表示する。
  // 投稿文には抽出条件の説明を入れず、各時刻の内容だけを出す。
  for (const r of displayRows) {
    lines.push(`・${hourLabel(r.time)}`);
    lines.push(`  ${wemojiDesc(r.code)}　🌡️: ${fmt1(r.temp, '℃')} / 体感: ${fmt1(r.apparent, '℃')}　💧: ${fmt1(r.precipitation, 'mm/h')} / 確率: ${fmt0(r.pop, '%')}　${windEmoji(r.wind, r.gust)}: ${fmt1(r.wind, 'm/s')} / 突風: ${fmt1(r.gust, 'm/s')}`);
    lines.push('');
  }
  return trimDiscord(lines.join('\n'));
}

function buildNextRainReport(data) {
  const rows = hourlyRows(data).filter(r => new Date(`${r.time}+09:00`) >= new Date()).slice(0, 24 * 4);
  const rain = rows.find(isRainHourLong);
  if (!rain) {
    return `**②-1 鶴見駅 次の雨予報**\n4日先までに、降水量${CONFIG.rainMmThresholdLong}mm以上の時間帯はありません。`;
  }
  return [
    '**②-1 鶴見駅 次の雨予報**',
    `次の降水量${CONFIG.rainMmThresholdLong}mm以上: ${hourLabel(rain.time)}`,
    `${wemojiDesc(rain.code)} / 💧 降水量${fmt1(rain.precipitation, 'mm/h')} / 降水確率${fmt0(rain.pop, '%')} / 🌬️ 風${fmt1(rain.wind, 'm/s')} / 突風${fmt1(rain.gust, 'm/s')}`,
  ].join('\n');
}

function buildTsurumi4DayReport(data) {
  const lines = ['**②-3 鶴見駅 4日先までの予報**'];
  for (const r of dailyRows(data).slice(0, 4)) {
    lines.push(`・${dateLabel(r.date)}: ${wemojiDesc(r.code)}`);
    lines.push(`  🌡️ 気温: 最高${fmt1(r.tmax, '℃')} / 最低${fmt1(r.tmin, '℃')} / 平均${fmt1(r.tmean, '℃')}`);
    lines.push(`  💧 降水: ${fmt1(r.precip, 'mm')} / 確率: ${fmt0(r.popMax, '%')} / 🌬️ 風: ${fmt1(r.windMax, 'm/s')} / 突風: ${fmt1(r.gustMax, 'm/s')}`);
    lines.push('');
  }
  return lines.join('\n');
}

function average(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function diffText(current, base) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(base))) return '-';
  const d = Number(current) - Number(base);
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}℃`;
}

function buildTemperatureCompareReport(forecast, archive) {
  const today = dailyRows(forecast)[0];
  const days = archive?.daily?.time?.map((date, i) => ({
    date,
    tmax: archive.daily.temperature_2m_max?.[i],
    tmin: archive.daily.temperature_2m_min?.[i],
    tmean: archive.daily.temperature_2m_mean?.[i],
  })) ?? [];
  const yesterday = days.at(-1);
  const last3 = days.slice(-3);
  const last7 = days.slice(-7);
  const avg3 = average(last3.map(d => d.tmean));
  const avg7 = average(last7.map(d => d.tmean));

  const lines = ['**②-2 鶴見駅 気温比較**'];
  if (!yesterday) {
    lines.push('過去実績データを取得できませんでした。');
    return lines.join('\n');
  }
  lines.push(`今日予報: 最高${fmt1(today.tmax, '℃')} / 最低${fmt1(today.tmin, '℃')} / 平均${fmt1(today.tmean, '℃')}`);
  lines.push(`昨日実績: 最高${fmt1(yesterday.tmax, '℃')} / 最低${fmt1(yesterday.tmin, '℃')} / 平均${fmt1(yesterday.tmean, '℃')}`);
  lines.push(`昨日差分: 最高${diffText(today.tmax, yesterday.tmax)} / 最低${diffText(today.tmin, yesterday.tmin)} / 平均${diffText(today.tmean, yesterday.tmean)}`);
  lines.push(`過去3日平均との差: ${diffText(today.tmean, avg3)} / 過去7日平均との差: ${diffText(today.tmean, avg7)}`);
  return lines.join('\n');
}

function buildSimpleAreaReport(groupTitle, forecastPairs) {
  const lines = [`**${groupTitle}**`];
  for (const [location, data] of forecastPairs) {
    const rows = dailyRows(data);
    const today = rows[0];
    const tomorrow = rows[1];
    lines.push(`・${location.name}`);
    lines.push(`  今日: ${wemojiDesc(today.code)} / 🌡️ 最高${fmt1(today.tmax, '℃')} / 💧 降水${fmt1(today.precip, 'mm')} / 確率${fmt0(today.popMax, '%')} / 🌬️ 風${fmt1(today.windMax, 'm/s')}`);
    lines.push(`  明日: ${wemojiDesc(tomorrow.code)} / 🌡️ 最高${fmt1(tomorrow.tmax, '℃')} / 💧 降水${fmt1(tomorrow.precip, 'mm')} / 確率${fmt0(tomorrow.popMax, '%')}`);
    lines.push('');
  }
  return trimDiscord(lines.join('\n'));
}

function trimDiscord(message) {
  return message.length > 1900 ? `${message.slice(0, 1880)}\n…` : message;
}

async function postToDiscord(content) {
  await fetchJson(CONFIG.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

async function buildFullReports() {
  const today = nowJst().dateString;
  const archiveStart = addDays(today, -7);
  const archiveEnd = addDays(today, -1);

  const tsurumiForecast = await fetchJson(makeForecastUrl(LOCATIONS.tsurumi, 4));
  const reports = [];
  reports.push(buildTsurumi24hReport(tsurumiForecast));

  let archive = null;
  try {
    archive = await fetchJson(makeArchiveUrl(LOCATIONS.tsurumi, archiveStart, archiveEnd));
  } catch (error) {
    console.warn(`Archive API failed: ${error.message}`);
  }

  reports.push(trimDiscord([
    buildNextRainReport(tsurumiForecast),
    '',
    buildTemperatureCompareReport(tsurumiForecast, archive),
    '',
    buildTsurumi4DayReport(tsurumiForecast),
  ].join('\n')));

  const group1Locations = [LOCATIONS.kawasaki, LOCATIONS.yokohama, LOCATIONS.musashiKosugi, LOCATIONS.kamata];
  const group2Locations = [LOCATIONS.futamatagawa, LOCATIONS.higashiTotsuka, LOCATIONS.suidobashi];
  const group1 = await Promise.all(group1Locations.map(async loc => [loc, await fetchJson(makeForecastUrl(loc, 2))]));
  const group2 = await Promise.all(group2Locations.map(async loc => [loc, await fetchJson(makeForecastUrl(loc, 2))]));
  reports.push(buildSimpleAreaReport('③-1 周辺駅 簡易予報｜川崎・横浜・武蔵小杉・蒲田', group1));
  reports.push(buildSimpleAreaReport('③-2 周辺駅 簡易予報｜二俣川・東戸塚・水道橋', group2));

  return reports;
}

async function buildTsurumi24OnlyReports() {
  const tsurumiForecast = await fetchJson(makeForecastUrl(LOCATIONS.tsurumi, 2));
  return [buildTsurumi24hReport(tsurumiForecast)];
}

function resolveMode() {
  if (CONFIG.reportMode === 'full' || CONFIG.reportMode === 'tsurumi24') return CONFIG.reportMode;
  return nowJst().hour === 4 ? 'full' : 'tsurumi24';
}

const mode = resolveMode();
console.log(`Weather report mode: ${mode}`);
const reports = mode === 'full' ? await buildFullReports() : await buildTsurumi24OnlyReports();
for (const report of reports) {
  console.log(report);
  await postToDiscord(report);
}
