# CalCascade

A Google Apps Script project that automatically blocks personal calendar events on your work calendar as **Out of Office** events.

## Overview

- Automatically sync personal calendar events to your work account's primary calendar as "Private Block"
- Others see you as "Out of Office"
- Real-time sync on calendar changes (EventUpdated trigger + Sync Token)

## Features

- **Real-time sync**: Fires immediately on calendar changes
- **Incremental sync**: Fetches only changed events using Sync Token
- **Out of Office events**: Automatically declines new conflicting invitations
- **Multiple calendars**: Supports syncing from multiple source calendars
- **Attendance filter**: Only events you have accepted (or your own events without invitees) are synced

## Architecture

```
+------------------+      Share       +------------------+
|  Personal Acct   | --------------> |   Work Account   |
|                  |   (read access)  |                  |
|  Personal Cal    |                  |  GAS Execution   |
+------------------+                  |       |          |
                                      |       v          |
                                      |  Work Primary    |
                                      |  (OOO events)    |
                                      +------------------+
```

**Important**: GAS must run on the **work account**. Out of Office events can only be created on your own primary calendar.

## Setup

### Step 1: Share Personal Calendar with Work Account

**On your personal account:**

1. Open [Google Calendar](https://calendar.google.com) with your **personal account**
2. Click "..." next to the calendar name -> "Settings and sharing"
3. "Share with specific people or groups" -> "Add people or groups"
4. Enter your work account email address
5. Select "See all event details" or higher permission
6. Click "Send"

**On your work account:**

7. Open the invitation email sent to your work account
8. Click "Add this calendar" link in the email
9. The shared calendar will appear under "Other calendars" in Google Calendar

### Step 2: Find Calendar ID

How to find Calendar ID:

1. Open [Google Calendar](https://calendar.google.com)
2. Click "..." next to the calendar name -> "Settings and sharing"
3. Scroll down to "Integrate calendar" section
4. Copy "Calendar ID"

| Calendar | Example ID |
|----------|------------|
| Gmail primary | `yourname@gmail.com` or `primary` |
| Google Workspace primary | `yourname@company.com` or `primary` |
| Additional calendar | `xxx@group.calendar.google.com` |

### Step 3: Create GAS Project (on Work Account)

```bash
# Clone repository
git clone https://github.com/mekajiki/calendar-cascade.git
cd calendar-cascade
npm install

# Login to clasp with work account
npx clasp login

# Create new GAS project
npx clasp create --title "CalCascade" --rootDir src

# Move .clasp.json to project root (if created in src/)
mv src/.clasp.json .clasp.json 2>/dev/null || true

# Push
npm run push
```

### Step 4: Set Script Properties

1. Open GAS Editor with `npm run open`
2. Click "Project Settings" (gear icon) on the left
3. Scroll down to "Script Properties"
4. Click "Add script property" and set:

| Property | Value | Description |
|----------|-------|-------------|
| `SOURCE_CALENDAR_IDS` | `personal@gmail.com` | Personal calendar ID (comma-separated for multiple) |
| `TARGET_CALENDAR_ID` | `primary` | Work calendar ID (usually `primary`) |

### Step 5: Verify Setup

In GAS Editor:

1. Run `testCalendarAccess` -> Verify calendar access
2. Run `setupTriggers` -> Set up EventUpdated triggers
3. Run `showStatus` -> Check configuration status

### Step 6: Test

1. Add an event to your personal calendar
2. Verify "Private Block" OOO event is created on work calendar
3. Edit/delete the event -> Verify changes are synced

## Usage

After setup, it works automatically.

- **Add event to personal calendar** -> "Private Block" is created on work calendar
- **Edit/delete event** -> Automatically synced

### Manual Operations

| Function | Description |
|----------|-------------|
| `fullSync()` | Full sync from all calendars |
| `resetSyncTokens()` | Reset Sync Tokens (forces full sync) |
| `showStatus()` | Display current configuration status |
| `removeTriggers()` | Remove all triggers |

## GitHub Actions Auto Deploy

Automatically pushes when `src/` changes on `main` branch.

### Required Secrets

| Secret Name | Content |
|-------------|---------|
| `CLASPRC_JSON` | Contents of `~/.clasprc.json` |
| `CLASP_JSON` | Contents of `.clasp.json` |

```bash
# Get ~/.clasprc.json contents
cat ~/.clasprc.json
```

## Troubleshooting

### Cannot access calendar

- Verify personal calendar is shared with work account
- Check sharing permission is "See all event details" or higher
- Check error messages in `testCalendarAccess`

### OOO events not created

- Verify GAS is running on work account
- Check `TARGET_CALENDAR_ID` is `primary` or your own calendar
- Check execution logs (GAS Editor -> Executions)

### Sync is delayed

- EventUpdated trigger may have up to a few minutes delay
- Use `fullSync()` for manual sync

## Directory Structure

```
calendar-cascade/
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions deploy
├── src/
│   ├── appsscript.json     # GAS manifest
│   ├── Config.gs           # Configuration module
│   ├── Main.gs             # Entry point
│   ├── CalendarSync.gs     # Core sync logic
│   └── Utils.gs            # Utilities
├── .clasp.json             # clasp config (gitignore)
├── .claspignore            # clasp exclude config
├── .gitignore
├── package.json
└── README.md
```

## License

MIT
