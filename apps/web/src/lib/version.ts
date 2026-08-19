/**
 * App version + in-app changelog.
 *
 * On every user-facing ship: prepend a new entry here (bump version), then
 * rebuild/deploy. APP_VERSION is always the latest entry's version.
 */

export type ChangelogEntry = {
  version: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  changes: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.3.9",
    date: "2026-08-19",
    changes: [
      "Create no longer waits on cloud sync — tasks go to the list, events to the calendar",
      "Recurring events now appear on every matching day in the planning window",
      "Event time is labeled as the event, not a due date; past events stay on their original time",
    ],
  },
  {
    version: "0.3.8",
    date: "2026-08-19",
    changes: [
      "Checklists are their own section, with a Focus button for a full-screen editor",
      "Focus mode still lets you change bucket, priority, due date, and assignee",
      "Checklist grows as you add items; Enter on the last row adds another",
    ],
  },
  {
    version: "0.3.7",
    date: "2026-08-19",
    changes: [
      "Unsaved edits and theme/schedule prefs are no longer overwritten by a cloud pull",
      "New tasks open the right record after sync (no more matching by title)",
      "Dark theme now drives the Android status bar",
      "File uploads and prefs refresh use the phone’s signed sync API",
    ],
  },
  {
    version: "0.3.6",
    date: "2026-07-30",
    changes: [
      "Fixed Sync issue patch 403 loop — leftover edits for tasks you can’t access are dropped instead of blocking sync forever",
      "Re-linking / signing in clears the stuck sync queue first",
      "Tap Sync issue on a 403 to clear the queue and retry",
    ],
  },
  {
    version: "0.3.5",
    date: "2026-07-30",
    changes: [
      "Fixed Sync issue delete 500 — task delete now clears related schedule/comments/etc. before removing the task",
    ],
  },
  {
    version: "0.3.4",
    date: "2026-07-30",
    changes: [
      "Fixed Sync issue 403 Forbidden — offline local-workspace ids now remap to your real workspace before upload",
      "Pending buckets/tasks created before linking survive the first sync",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-07-30",
    changes: [
      "Fixed Sync issue create 400 — new tasks were rejected when recurrence weekdays were null",
      "Create sync ignores temporary local bucket/assignee ids so tasks still upload",
      "Sync issue dialog now includes the server’s error detail",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-07-30",
    changes: [
      "Tap Sync issue to see the exact error message (helps diagnose on the go)",
      "Calendar no longer shows blocks for tasks that aren’t in your open list",
      "Clears leftover tasks from old/offline workspaces that caused ghost entries",
      "Pending edits to already-deleted tasks no longer keep ghosts alive",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-07-30",
    changes: [
      "Fixed buckets disappearing after sync (Worker errors no longer wipe the list to None)",
      "New buckets sync reliably on phone and web; assigning a task to a bucket sticks",
      "Stopped calling the remote schedule packer on every edit (Worker Error 1101)",
      "Safer task sync: failed pulls no longer delete local tasks; pending edits are kept",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-29",
    changes: [
      "Tap the version number in Settings to open this changelog",
      "Version number now bumps with every shipped update",
      "Deleted tasks no longer linger on the calendar",
      "Create, edit, complete, and delete always sync between phone and web",
      "Weekly recurring tasks can pick which days they repeat on",
      "Buckets and schedule prefs support different hours per day (e.g. weekends)",
      "Events can be recurring",
      "Sign out shows the account email",
      "Google sign-in on mobile via browser + deep link",
      "Fixed empty white scroll band on Calendar and Settings",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-28",
    changes: [
      "Google login on the web app",
      "Device code linking for the Android app",
      "Calendar and settings layout polish",
      "Notifications scaffolding for web and app",
    ],
  },
];

export const APP_VERSION = CHANGELOG[0]?.version ?? "0.0.0";
