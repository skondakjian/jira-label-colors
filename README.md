# Stephenie's Jira Setup

A personal Jira (Cloud) instance used to manage life across multiple domains — health, job search, relocation, web projects, and meal planning. This README documents how the space is organized and how to navigate it.

---

## Getting Around

### Home: "For you"
The **"For you"** page is the main entry point. From there you can see all recent spaces, quick links to open work items, and access the Command Board.

**Navigation path:** Sidebar → *For you*

### Command Board
The **Command Board** is the personal sprint board — this is where active weekly work lives. It runs time-boxed sprints (e.g., `CSprint26-03-07`) that span a week and pull tasks from all projects.

**Navigation path:** *For you* → Command Board card → *Active Sprints* tab

The board has three columns:
- **To Do** — queued for this sprint
- **In Progress** — actively being worked on
- **Done** — completed this sprint

---

## Projects (Spaces)

Each project maps to a domain of life. Each has its own board and issue key prefix.

| Project | Key | Description |
|---|---|---|
| Relocation to Louisville | `RELO` | Tasks related to moving |
| Health | `HLTH` | Medical appointments, actions, records |
| 2026 Job Search | `JOB26` | Job search tracking and weekly logging |
| Websites | `WEB` | Personal website and web-related projects |
| Meal Planner App | `MEAL` | Meal planning app development |

Each project has its own board accessible from the *For you* page or via the Boards list.

---

## Labels

Labels are used to categorize issues cross-project. They show up as colored chips on cards (via the Tampermonkey script — see below).

### Category Labels (visible on board cards)
These are the **epic-style grouping labels** that appear prominently on Command Board cards:

| Label | Purpose |
|---|---|
| `STEPHKONDAK - PLANNING` | Personal planning and organizational tasks |
| `HEALTH ACTIONS` | Health-related action items (appointments, follow-ups) |
| `SK-LEADERSHIP ARTICLES` | Articles and writing related to leadership |
| `WEEKLY JOB SEARCH & LOGGING` | Weekly job search activity logging |
| `JIRA WORK` | Work on the Jira setup itself |

### AI Tool Labels
Labels used to track which AI tools are involved in a task. Colored by the script:

| Label | Color | Tool |
|---|---|---|
| `ai-claude` | Orange / Purple | Claude (general) |
| `ai-claude-code` | Purple / Peach | Claude Code |
| `ai-claude-cowork` | Orange / Black | Claude Cowork |
| `ai-gemini` | Light Blue | Gemini |
| `ai-gemini-autobrowse` | Blue / Yellow | Gemini autobrowse |
| `ai-gemini-vertex` | Cream / Blue | Gemini Vertex |
| `ai-chatgpt` | Gray | ChatGPT |
| `ai-chatgpt-copilot` | Dark Gray / White | ChatGPT / Copilot |

### Issue Status Labels

| Label | Color | Meaning |
|---|---|---|
| `feature` | Teal | New feature work |
| `bug` | Red | Bug or error to fix |
| `tech-debt` | Yellow | Technical debt or cleanup |
| `blocked` | Red | Blocked, cannot proceed |

---

## Filters

Filters are saved JQL queries. Access them via **Sidebar → Filters → View all filters**.

| Filter | Purpose |
|---|---|
| **SK Filter** | General personal view across all projects (shared with Health, All roles) |
| **Epics Filter** | Shows all active epics across projects |
| **Main Project Filter** | Filters for core project work |
| **Weekly Focus Filter** | Shows the 5 current weekly focus items used in the dashboard |

---

## Dashboards

Dashboards are accessed via **Sidebar → Dashboards**.

### Default Dashboard
An at-a-glance sprint overview. Contains:
- **Sprint Health Gadget** — shows sprint progress, % time elapsed vs. % work complete
- **Sprint Burndown Gadget** — visual burndown chart for the current sprint
- **Workload Pie: Weekly Focus Filter** — pie chart of time estimate by status for weekly focus items
- **Filter Results: Weekly Focus Filter** — table of the 5 current weekly focus issues

### Weekly Focus
A focused personal dashboard showing:
- **Filter Results: Weekly Focus Filter** — the 5 issues in focus this week
- **Filter Results: Epics Filter** — all epics and their status
- **Issues Calendar: Weekly Focus Filter** — calendar view of due dates
- **Sprint Health Gadget** — Command Board sprint health

---

## Tampermonkey Script: Jira Label Colors

A custom browser script that adds **persistent color coding to Jira label chips** across boards, issue views, and lists.

### Files
| File | Description |
|---|---|
| `jira-label-colors-tampermonkey.js` | The Tampermonkey userscript to install in the browser |
| `jira-label-colors-YYYY-MM-DD.json` | Exported color configuration (dated snapshot) |

### How It Works
The script runs on `*.atlassian.net` and detects label chip elements in the DOM. It applies custom background and text colors based on a stored mapping, and watches for Jira's dynamic rendering via a MutationObserver so colors stay applied as pages load.

### Using the Script
1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Create a new script and paste the contents of `jira-label-colors-tampermonkey.js`
3. A **"Label Colors"** button will appear in the bottom-right corner of any Jira page
4. Click it to open the color manager UI

### UI Features
- **Add** a label name with custom background and text colors
- **Scan page** to auto-detect all label chips currently visible and assign deterministic colors
- **Delete** any mapping to remove it
- **Auto-assign** toggle: automatically color any unmapped labels using a hash-based algorithm
- **Export** — downloads current config as a dated JSON file (use this to back up your color map)
- **Import** — loads a previously exported JSON file to restore or merge a color map

**Keyboard shortcut:** `Cmd+Shift+L` (Mac) / `Ctrl+Shift+L` (Windows/Linux) opens the color manager

### Config Format
The exported JSON uses this structure:
```json
{
  "version": 1,
  "autoAssignUnmapped": false,
  "map": {
    "label-name": {
      "bg": "#RRGGBB",
      "fg": "#RRGGBB"
    }
  }
}
```

---

## Sprint Naming Convention

Sprints follow the pattern: `CSprint{YY}-{MM}-{DD}` where the date is the sprint end date.

Example: `CSprint26-03-07` = sprint ending March 7, 2026.

---

*Last updated: March 2026*
