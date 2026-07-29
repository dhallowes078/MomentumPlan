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
