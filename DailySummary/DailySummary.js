// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: sun;

/*
 * DailySummary: a short briefing for your day, built to be run from the
 * Shortcuts app (or Siri).
 *
 * WHAT IT RETURNS
 *  A greeting, today's weather, your calendar events, reminders due today,
 *  open tasks from TaskWidget (if you use it) and your battery level.
 *
 * USING IT FROM SHORTCUTS
 *  1. Add the "Run Script" action (from Scriptable) and pick DailySummary.
 *  2. Optionally set "Parameter" to one of:
 *       (empty)  full summary as text
 *       short    one or two sentences, good for Siri to read out
 *       json     a dictionary (weather, events, reminders, ...) for later actions
 *  3. Add "Speak Text" or "Show Result" after it and pass in the "Script Result".
 *  Turn OFF "Run In App" on the action so it runs in the background.
 *
 * Run it inside Scriptable to preview the summary.
 */

// ---------------------------------------------------------------- config ----
const CONFIG = {
  name: "",                 // your name for the greeting, e.g. "Jinesh". Empty = no name.
  units: "celsius",         // "celsius" or "fahrenheit"
  // Used when Location isn't available (e.g. permission denied). null = skip weather.
  fallbackLocation: null,   // e.g. { latitude: 51.5072, longitude: -0.1276, name: "London" }
  maxEvents: 6,
  maxReminders: 5,
  maxTasks: 5,
  includeAllDayEvents: true,
  includeTaskWidget: true,  // reads Scriptable/TaskWidget/tasks.json if it exists
};

// ----------------------------------------------------------------- helpers ----
const timeFmt = new DateFormatter();
timeFmt.useNoDateStyle();
timeFmt.useShortTimeStyle();

const dateFmt = new DateFormatter();
dateFmt.dateFormat = "EEEE d MMMM";

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function listJoin(items) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

function greeting(now) {
  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return CONFIG.name ? `${part}, ${CONFIG.name}` : part;
}

// WMO weather codes used by Open-Meteo.
function describeWeather(code) {
  const map = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "foggy", 48: "foggy",
    51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain",
    71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
    80: "light showers", 81: "showers", 82: "heavy showers",
    85: "snow showers", 86: "heavy snow showers",
    95: "thunderstorms", 96: "thunderstorms with hail", 99: "thunderstorms with hail",
  };
  return map[code] || "mixed conditions";
}

// ------------------------------------------------------------------ data ----
async function getLocation() {
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    let name = null;
    try {
      const geo = await Location.reverseGeocode(loc.latitude, loc.longitude);
      if (geo && geo.length) name = geo[0].locality || geo[0].subAdministrativeArea || null;
    } catch (e) { /* name is optional */ }
    return { latitude: loc.latitude, longitude: loc.longitude, name };
  } catch (e) {
    return CONFIG.fallbackLocation;
  }
}

async function getWeather() {
  const loc = await getLocation();
  if (!loc) return null;
  const unit = CONFIG.units === "fahrenheit" ? "fahrenheit" : "celsius";
  const url = "https://api.open-meteo.com/v1/forecast"
    + `?latitude=${loc.latitude}&longitude=${loc.longitude}`
    + "&current=temperature_2m,weather_code"
    + "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code"
    + `&temperature_unit=${unit}&timezone=auto&forecast_days=1`;
  const req = new Request(url);
  req.timeoutInterval = 10;
  const d = await req.loadJSON();
  return {
    place: loc.name,
    unit: unit === "fahrenheit" ? "°F" : "°C",
    now: Math.round(d.current.temperature_2m),
    nowDescription: describeWeather(d.current.weather_code),
    high: Math.round(d.daily.temperature_2m_max[0]),
    low: Math.round(d.daily.temperature_2m_min[0]),
    dayDescription: describeWeather(d.daily.weather_code[0]),
    rainChance: d.daily.precipitation_probability_max[0],
  };
}

async function getEvents(now) {
  const events = await CalendarEvent.today([]);
  return events
    .filter((e) => CONFIG.includeAllDayEvents || !e.isAllDay)
    .filter((e) => e.isAllDay || e.endDate > now) // skip ones already finished
    .sort((a, b) => a.startDate - b.startDate)
    .map((e) => ({
      title: e.title,
      allDay: e.isAllDay,
      start: e.isAllDay ? "All day" : timeFmt.string(e.startDate),
      location: e.location || null,
    }));
}

async function getReminders() {
  const due = await Reminder.incompleteDueToday([]);
  // Also include overdue reminders, which "due today" leaves out.
  let overdue = [];
  try {
    const all = await Reminder.allIncomplete([]);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    overdue = all.filter((r) => r.dueDate && r.dueDate < startOfDay);
  } catch (e) { /* optional */ }
  return overdue.map((r) => ({ title: r.title, overdue: true }))
    .concat(due.map((r) => ({ title: r.title, overdue: false })));
}

function getTaskWidgetTasks() {
  if (!CONFIG.includeTaskWidget) return null;
  const managers = [];
  try { managers.push(FileManager.iCloud()); } catch (e) {}
  managers.push(FileManager.local());
  for (const fm of managers) {
    try {
      const file = fm.joinPath(fm.documentsDirectory(), "TaskWidget/tasks.json");
      if (!fm.fileExists(file)) continue;
      // Can't await a download in a sync function; isFileDownloaded is a cheap check.
      if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(file) && !fm.isFileDownloaded(file)) continue;
      const tasks = JSON.parse(fm.readString(file));
      return tasks.filter((t) => !t.done).map((t) => t.title);
    } catch (e) { /* try the next one */ }
  }
  return null;
}

function getBattery() {
  return { level: Math.round(Device.batteryLevel() * 100), charging: Device.isCharging() };
}

// Run one data source, but never let a failure stop the whole summary.
async function safe(fn) {
  try { return await fn(); } catch (e) { console.warn(String(e)); return null; }
}

// ------------------------------------------------------------- formatting ----
function buildFull(s) {
  const lines = [`${greeting(s.now)}! It's ${dateFmt.string(s.now)}.`];

  if (s.weather) {
    const w = s.weather;
    const where = w.place ? ` in ${w.place}` : "";
    let line = `🌤 It's ${w.now}${w.unit} and ${w.nowDescription}${where}. `
      + `Today: ${w.dayDescription}, high ${w.high}${w.unit}, low ${w.low}${w.unit}`;
    if (w.rainChance != null) line += `, ${w.rainChance}% chance of rain`;
    lines.push(line + ".");
  }

  if (s.events) {
    if (!s.events.length) {
      lines.push("📅 Nothing else on your calendar today.");
    } else {
      lines.push(`📅 ${plural(s.events.length, "event")} today:`);
      for (const e of s.events.slice(0, CONFIG.maxEvents)) {
        lines.push(`   • ${e.start}  ${e.title}${e.location ? ` (${e.location})` : ""}`);
      }
      if (s.events.length > CONFIG.maxEvents) lines.push(`   • …and ${s.events.length - CONFIG.maxEvents} more`);
    }
  }

  if (s.reminders && s.reminders.length) {
    lines.push(`✅ ${plural(s.reminders.length, "reminder")} due:`);
    for (const r of s.reminders.slice(0, CONFIG.maxReminders)) {
      lines.push(`   • ${r.title}${r.overdue ? " (overdue)" : ""}`);
    }
    if (s.reminders.length > CONFIG.maxReminders) lines.push(`   • …and ${s.reminders.length - CONFIG.maxReminders} more`);
  }

  if (s.tasks && s.tasks.length) {
    lines.push(`📝 ${plural(s.tasks.length, "open task")}:`);
    for (const t of s.tasks.slice(0, CONFIG.maxTasks)) lines.push(`   • ${t}`);
    if (s.tasks.length > CONFIG.maxTasks) lines.push(`   • …and ${s.tasks.length - CONFIG.maxTasks} more`);
  }

  if (s.battery) {
    lines.push(`🔋 Battery at ${s.battery.level}%${s.battery.charging ? " and charging" : ""}.`);
  }
  return lines.join("\n");
}

// Spoken-friendly version: no emoji, no bullet lists.
function buildShort(s) {
  const parts = [`${greeting(s.now)}.`];
  if (s.weather) {
    const w = s.weather;
    parts.push(`It's ${w.now} degrees and ${w.nowDescription}, with a high of ${w.high}`
      + (w.rainChance >= 40 ? ` and a ${w.rainChance}% chance of rain.` : "."));
  }
  if (s.events) {
    const timed = s.events.filter((e) => !e.allDay);
    if (!s.events.length) parts.push("Your calendar is clear.");
    else if (timed.length) parts.push(`You have ${plural(s.events.length, "event")}; the next is ${timed[0].title} at ${timed[0].start}.`);
    else parts.push(`You have ${plural(s.events.length, "all-day event")}: ${listJoin(s.events.map((e) => e.title))}.`);
  }
  const todo = (s.reminders ? s.reminders.length : 0) + (s.tasks ? s.tasks.length : 0);
  if (todo) parts.push(`You've got ${plural(todo, "thing")} to do.`);
  if (s.battery && s.battery.level <= 20 && !s.battery.charging) parts.push(`Battery is low at ${s.battery.level}%.`);
  return parts.join(" ");
}

function buildDictionary(s) {
  return {
    date: dateFmt.string(s.now),
    greeting: greeting(s.now),
    weather: s.weather,
    events: s.events || [],
    reminders: s.reminders || [],
    tasks: s.tasks || [],
    battery: s.battery,
    text: buildFull(s),
    spoken: buildShort(s),
  };
}

// ------------------------------------------------------------------ main ----
const now = new Date();
const [weather, events, reminders] = await Promise.all([
  safe(getWeather),
  safe(() => getEvents(now)),
  safe(getReminders),
]);
const summary = {
  now,
  weather,
  events,
  reminders,
  tasks: (await safe(getTaskWidgetTasks)),
  battery: (await safe(getBattery)),
};

const mode = String(args.shortcutParameter || args.queryParameters.mode || "").trim().toLowerCase();
let output;
if (mode === "json" || mode === "dictionary") output = buildDictionary(summary);
else if (mode === "short" || mode === "speak") output = buildShort(summary);
else output = buildFull(summary);

if (config.runsInApp) {
  // Preview inside Scriptable.
  const a = new Alert();
  a.title = "Daily Summary";
  a.message = buildFull(summary) + "\n\n— Spoken version —\n" + buildShort(summary);
  a.addAction("Read it out");
  a.addCancelAction("Close");
  if ((await a.presentSheet()) === 0) await Speech.speak(buildShort(summary));
}

Script.setShortcutOutput(output);
Script.complete();
