// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: tasks;

/*
 * TaskWidget — a to-do list widget whose tasks can be ticked off from the home screen.
 *
 * HOW IT WORKS
 *  - Run the script inside Scriptable to manage tasks: add, edit, delete,
 *    tick/untick, pick a list, clear completed ones.
 *  - Medium / large widget: tap a task row to tick it off (or untick it).
 *    Tap "+" in the header to add a new task.
 *  - Small widget: tap the widget to open a picker, select the task to tick off.
 *
 *  iOS widgets cannot run code in place, so a tap briefly opens Scriptable,
 *  toggles the task, and closes again. The widget redraws when iOS refreshes it
 *  (usually as soon as you're back on the home screen).
 *
 * WIDGET PARAMETER (optional, long-press widget > Edit Widget > Parameter)
 *  - A list name, e.g.  Work      -> only shows tasks from the "Work" list
 *  - Add ";hide" to hide completed tasks, e.g.  Work;hide   or   ;hide
 *  - Leave empty to show every task.
 *
 * IMPORTANT: if you rename this script, the widget tap links still work,
 * because they are built from Script.name() at render time.
 */

// ---------------------------------------------------------------- config ----
const CONFIG = {
  title: "Tasks",
  defaultList: "Inbox",
  // Delete completed tasks automatically after this many days (0 = never).
  autoRemoveDoneAfterDays: 0,
  // Show completed tasks in the widget (can be overridden with ";hide").
  showCompletedInWidget: true,
  accent: new Color("#34C759"),
  background: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
  text: Color.dynamic(new Color("#1C1C1E"), new Color("#F2F2F7")),
  subtle: Color.dynamic(new Color("#8E8E93"), new Color("#8E8E93")),
  rowsPerFamily: { small: 4, medium: 4, large: 11, extraLarge: 11 },
};

// --------------------------------------------------------------- storage ----
const fm = (() => {
  try {
    const icloud = FileManager.iCloud();
    icloud.documentsDirectory(); // throws if iCloud is unavailable
    return icloud;
  } catch (e) {
    return FileManager.local();
  }
})();
const DIR = fm.joinPath(fm.documentsDirectory(), "TaskWidget");
const FILE = fm.joinPath(DIR, "tasks.json");

async function loadTasks() {
  if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
  if (!fm.fileExists(FILE)) return [];
  if (fm.isFileStoredIniCloud && fm.isFileStoredIniCloud(FILE)) {
    await fm.downloadFileFromiCloud(FILE);
  }
  try {
    const data = JSON.parse(fm.readString(FILE));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveTasks(tasks) {
  if (!fm.fileExists(DIR)) fm.createDirectory(DIR, true);
  fm.writeString(FILE, JSON.stringify(tasks, null, 2));
}

function pruneOld(tasks) {
  const days = CONFIG.autoRemoveDoneAfterDays;
  if (!days) return tasks;
  const cutoff = Date.now() - days * 86400000;
  return tasks.filter((t) => !(t.done && t.doneAt && t.doneAt < cutoff));
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function toggle(tasks, id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return null;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  return t;
}

function listsOf(tasks) {
  const set = new Set([CONFIG.defaultList]);
  tasks.forEach((t) => set.add(t.list || CONFIG.defaultList));
  return [...set];
}

// Open tasks first (oldest first), then completed ones (most recent first).
function sorted(tasks) {
  const open = tasks.filter((t) => !t.done).sort((a, b) => a.createdAt - b.createdAt);
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return open.concat(done);
}

// ------------------------------------------------------------ parameters ----
function parseWidgetParam(raw) {
  const parts = (raw || "").split(";").map((s) => s.trim());
  const list = parts[0] && parts[0].toLowerCase() !== "all" ? parts[0] : null;
  const hide = parts.slice(1).some((p) => p.toLowerCase() === "hide");
  return { list, showDone: hide ? false : CONFIG.showCompletedInWidget };
}

function runUrl(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `scriptable:///run/${encodeURIComponent(Script.name())}${q ? "?" + q : ""}`;
}

// ---------------------------------------------------------------- widget ----
function buildWidget(tasks, opts, family) {
  const w = new ListWidget();
  w.backgroundColor = CONFIG.background;
  w.setPadding(14, 14, 12, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const scoped = opts.list ? tasks.filter((t) => (t.list || CONFIG.defaultList) === opts.list) : tasks;
  const openCount = scoped.filter((t) => !t.done).length;
  const visible = sorted(scoped).filter((t) => opts.showDone || !t.done);
  const isSmall = family === "small";
  const maxRows = CONFIG.rowsPerFamily[family] || 4;

  // Header
  const header = w.addStack();
  header.centerAlignContent();
  const title = header.addText(opts.list || CONFIG.title);
  title.font = Font.boldSystemFont(isSmall ? 15 : 16);
  title.textColor = CONFIG.text;
  title.lineLimit = 1;
  header.addSpacer();
  const count = header.addText(openCount ? `${openCount} left` : "All done");
  count.font = Font.mediumSystemFont(12);
  count.textColor = openCount ? CONFIG.accent : CONFIG.subtle;

  if (!isSmall) {
    header.addSpacer(10);
    const add = header.addImage(SFSymbol.named("plus.circle.fill").image);
    add.imageSize = new Size(20, 20);
    add.tintColor = CONFIG.accent;
    add.url = runUrl({ action: "add", list: opts.list });
  }

  w.addSpacer(8);

  if (visible.length === 0) {
    w.addSpacer();
    const empty = w.addText(scoped.length ? "Everything ticked off 🎉" : "No tasks yet.\nTap to add one.");
    empty.font = Font.systemFont(13);
    empty.textColor = CONFIG.subtle;
    empty.centerAlignText();
    w.addSpacer();
  } else {
    visible.slice(0, maxRows).forEach((t, i) => {
      if (i > 0) w.addSpacer(isSmall ? 5 : 6);
      const row = w.addStack();
      row.centerAlignContent();
      // Per-row tap targets only work on medium/large widgets.
      if (!isSmall) row.url = runUrl({ action: "toggle", id: t.id });

      const icon = row.addImage(SFSymbol.named(t.done ? "checkmark.circle.fill" : "circle").image);
      icon.imageSize = new Size(isSmall ? 15 : 18, isSmall ? 15 : 18);
      icon.tintColor = t.done ? CONFIG.accent : CONFIG.subtle;
      row.addSpacer(8);

      const txt = row.addText(t.title);
      txt.font = t.done ? Font.systemFont(isSmall ? 12 : 14) : Font.mediumSystemFont(isSmall ? 12 : 14);
      txt.textColor = t.done ? CONFIG.subtle : CONFIG.text;
      txt.lineLimit = 1;
      row.addSpacer();
    });
    const hidden = visible.length - maxRows;
    if (hidden > 0) {
      w.addSpacer(4);
      const more = w.addText(`+${hidden} more`);
      more.font = Font.systemFont(11);
      more.textColor = CONFIG.subtle;
    }
    w.addSpacer();
  }

  // Tapping the background (or the whole small widget) opens the task picker.
  w.url = runUrl({ action: "pick", list: opts.list });
  return w;
}

// --------------------------------------------------------------- dialogs ----
async function promptTask(existing, lists, presetList) {
  const a = new Alert();
  a.title = existing ? "Edit task" : "New task";
  a.addTextField("Task", existing ? existing.title : "");
  a.addTextField("List", existing ? existing.list || CONFIG.defaultList : presetList || CONFIG.defaultList);
  a.message = `Lists: ${lists.join(", ")}`;
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if ((await a.presentAlert()) === -1) return null;
  const title = a.textFieldValue(0).trim();
  if (!title) return null;
  return { title, list: a.textFieldValue(1).trim() || CONFIG.defaultList };
}

async function addTask(tasks, presetList) {
  const res = await promptTask(null, listsOf(tasks), presetList);
  if (!res) return false;
  tasks.push({ id: newId(), title: res.title, list: res.list, done: false, createdAt: Date.now(), doneAt: null });
  saveTasks(tasks);
  return true;
}

async function editTask(tasks, t) {
  const a = new Alert();
  a.title = t.title;
  a.addAction(t.done ? "Mark as not done" : "Tick off");
  a.addAction("Edit");
  a.addDestructiveAction("Delete");
  a.addCancelAction("Cancel");
  const choice = await a.presentSheet();
  if (choice === 0) toggle(tasks, t.id);
  else if (choice === 1) {
    const res = await promptTask(t, listsOf(tasks));
    if (!res) return;
    t.title = res.title;
    t.list = res.list;
  } else if (choice === 2) {
    tasks.splice(tasks.indexOf(t), 1);
  } else return;
  saveTasks(tasks);
}

async function chooseList(tasks, current) {
  const lists = listsOf(tasks);
  const a = new Alert();
  a.title = "Show list";
  a.addAction(current === null ? "✓ All lists" : "All lists");
  lists.forEach((l) => a.addAction(l === current ? `✓ ${l}` : l));
  a.addCancelAction("Cancel");
  const i = await a.presentSheet();
  if (i === -1) return current;
  return i === 0 ? null : lists[i - 1];
}

// ------------------------------------------------------------ task table ----
// Tap a task to tick it off; tap ✎ to edit or delete it.
async function showTaskTable(tasks, startList) {
  let filter = startList || null;
  const table = new UITable();
  table.showSeparators = true;

  const render = () => {
    table.removeAllRows();
    const scoped = filter ? tasks.filter((t) => (t.list || CONFIG.defaultList) === filter) : tasks;
    const openCount = scoped.filter((t) => !t.done).length;

    const head = new UITableRow();
    head.isHeader = true;
    head.height = 60;
    const h = head.addText(filter || "All tasks", `${openCount} open · ${scoped.length - openCount} done — tap a task to tick it off`);
    h.titleFont = Font.boldSystemFont(22);
    h.subtitleColor = Color.gray();
    table.addRow(head);

    const actions = new UITableRow();
    actions.height = 48;
    const addBtn = actions.addButton("＋ Add task");
    addBtn.leftAligned();
    addBtn.onTap = async () => {
      if (await addTask(tasks, filter)) render();
    };
    const listBtn = actions.addButton("☰ List");
    listBtn.centerAligned();
    listBtn.onTap = async () => {
      filter = await chooseList(tasks, filter);
      render();
    };
    const clearBtn = actions.addButton("Clear done");
    clearBtn.rightAligned();
    clearBtn.onTap = async () => {
      const doneIds = new Set(scoped.filter((t) => t.done).map((t) => t.id));
      if (!doneIds.size) return;
      const a = new Alert();
      a.title = `Remove ${doneIds.size} completed task${doneIds.size > 1 ? "s" : ""}?`;
      a.addDestructiveAction("Remove");
      a.addCancelAction("Cancel");
      if ((await a.presentAlert()) === -1) return;
      for (let i = tasks.length - 1; i >= 0; i--) if (doneIds.has(tasks[i].id)) tasks.splice(i, 1);
      saveTasks(tasks);
      render();
    };
    table.addRow(actions);

    if (!scoped.length) {
      const r = new UITableRow();
      r.height = 80;
      const c = r.addText("No tasks yet", "Tap “＋ Add task” to create one");
      c.centerAligned();
      c.titleColor = Color.gray();
      table.addRow(r);
    }

    sorted(scoped).forEach((t) => {
      const r = new UITableRow();
      r.height = 54;
      r.dismissOnSelect = false;
      const check = r.addText(t.done ? "✅" : "⚪️");
      check.widthWeight = 10;
      check.centerAligned();
      const label = r.addText(t.title, filter ? null : t.list || CONFIG.defaultList);
      label.widthWeight = 75;
      label.titleColor = t.done ? Color.gray() : CONFIG.text;
      label.subtitleColor = Color.gray();
      const edit = r.addButton("✎");
      edit.widthWeight = 15;
      edit.rightAligned();
      edit.onTap = async () => {
        await editTask(tasks, t);
        render();
      };
      r.onSelect = () => {
        toggle(tasks, t.id);
        saveTasks(tasks);
        render();
      };
      table.addRow(r);
    });

    const preview = new UITableRow();
    preview.height = 50;
    const p = preview.addButton("Preview widget (medium)");
    p.centerAligned();
    p.onTap = async () => {
      await buildWidget(tasks, { list: filter, showDone: CONFIG.showCompletedInWidget }, "medium").presentMedium();
    };
    table.addRow(preview);

    table.reload();
  };

  render();
  await table.present(false);
}

function closeApp() {
  try {
    if (typeof App !== "undefined" && App.close) App.close();
  } catch (e) {}
}

// ------------------------------------------------------------------ main ----
async function main() {
  let tasks = pruneOld(await loadTasks());
  const q = args.queryParameters || {};

  if (config.runsInWidget) {
    const opts = parseWidgetParam(args.widgetParameter);
    Script.setWidget(buildWidget(tasks, opts, config.widgetFamily));
    return;
  }

  switch (q.action) {
    case "toggle": {
      // Tapped a task row on the widget: tick it off and go straight back.
      const t = toggle(tasks, q.id);
      if (t) saveTasks(tasks);
      closeApp();
      return;
    }
    case "add": {
      await addTask(tasks, q.list);
      closeApp();
      return;
    }
    case "pick":
    default:
      // Small-widget tap, or running the script in the app.
      await showTaskTable(tasks, q.list);
  }
}

await main();
Script.complete();
