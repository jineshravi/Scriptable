## TaskWidget: to-do list you can tick off from the widget

A Scriptable home-screen widget that shows your tasks. Tap a task on the widget to tick it off.

### Install
1. Install [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) on iOS 14 or later.
2. Create a new script in Scriptable and paste in the contents of `TaskWidget.js`.
3. Run it once in the app and add a few tasks.
4. Add a Scriptable widget to your home screen and choose this script.

### Using it
| Where | Action |
|---|---|
| Medium/large widget | Tap a task to **tick it off**. Tap it again to untick it. |
| Medium/large widget | Tap **＋** to add a task. |
| Small widget | Tap the widget, then **pick the task** to tick off. |
| In the app | Tap a task to tick it off. **✎** edits or deletes it. **☰ List** switches lists. **Clear done** removes completed tasks. |

A widget tap opens Scriptable for a moment, toggles the task, and closes it again. iOS widgets can't run code in place.

### Widget parameter (optional)
- `Work` shows only the "Work" list
- `Work;hide` shows the "Work" list without completed tasks
- `;hide` shows all lists without completed tasks
- Leave it empty to show everything.

Tasks are stored in `Scriptable/TaskWidget/tasks.json` in iCloud Drive, or locally if iCloud isn't available. Colours, row counts and auto-cleanup of old completed tasks are set in the `CONFIG` block at the top of the script.

### Sizes
Small, medium, large
