## DailySummary: a daily briefing for Shortcuts and Siri

A Scriptable script you run from the Shortcuts app. It returns a summary of your day: weather, calendar events, reminders due (including overdue ones), open tasks from [TaskWidget](../TaskWidget) and battery level.

### Install
1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188).
2. Create a new script in Scriptable, name it `DailySummary`, and paste in `DailySummary.js`.
3. Run it once inside Scriptable and allow access to Location, Calendars and Reminders. You'll see a preview.

### Build the shortcut
1. Open **Shortcuts**, tap **+**, add the **Run Script** action (Scriptable) and choose **DailySummary**.
2. Turn **Run In App** off.
3. Set **Parameter** if you want something other than the full text:

| Parameter | Result |
|---|---|
| *(empty)* | Full summary with emoji and bullet lists |
| `short` | One spoken-style paragraph, good for Siri |
| `json` | Dictionary with `weather`, `events`, `reminders`, `tasks`, `battery`, `text`, `spoken` |

4. Add **Speak Text** (for `short`) or **Show Result** / **Quick Look** (for the full text) and pass in **Script Result**.
5. Name the shortcut, e.g. "My day", and say *"Hey Siri, my day"*.

Tip: in **Automation**, run it every morning at a set time, or when your alarm is stopped.

### Example
```
Good morning! It's Wednesday 25 November.
🌤 It's 7°C and light rain in London. Today: rain, high 9°C, low 3°C, 70% chance of rain.
📅 2 events today:
   • All day  Payday
   • 09:00  Ward round (Ward 4)
✅ 2 reminders due:
   • Pay bill (overdue)
   • Call GP
🔋 Battery at 64%.
```

### Settings
Edit the `CONFIG` block at the top: your name for the greeting, `celsius`/`fahrenheit`, a fallback location if Location is off, how many items to list, and whether to include all-day events and TaskWidget tasks.

Weather comes from [Open-Meteo](https://open-meteo.com), which is free and needs no API key.
