const LABELS: Record<string, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  ASSIGNED: "Assignee changed",
  COMPLETED: "Marked complete",
  REOPENED: "Reopened",
  SCHEDULED: "Scheduled",
  RESCHEDULED: "Rescheduled",
  COMMENTED: "Commented",
  LINK_ADDED: "Link added",
  ATTACHMENT_ADDED: "Attachment added",
  CHECKLIST_UPDATED: "Checklist updated",
  HEADER_UPDATED: "Header image updated",
  MENTIONED: "Members tagged",
  CHUNK_COMPLETED: "Chunk completed",
  CHUNK_REOPENED: "Chunk reopened",
};

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  notes: "notes",
  priority: "priority",
  estimateMinutes: "estimate",
  dueAt: "due date",
  bucketId: "bucket",
  assigneeId: "assignee",
  status: "status",
  locked: "lock",
  allowSplit: "split",
  scheduledStart: "start",
  scheduledEnd: "end",
  headerImageKey: "header image",
  mentionIds: "tagged members",
};

function prettyValue(value: unknown): string {
  if (value == null || value === "") return "none";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return String(value);
}

export function eventLabel(type: string) {
  return LABELS[type] ?? type;
}

export function describeEventPayload(type: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;

  if (type === "SCHEDULED" || type === "RESCHEDULED") {
    if (data.start && data.end) {
      return `${prettyValue(data.start)} → ${prettyValue(data.end)}${
        data.atRisk ? " (at risk)" : ""
      }`;
    }
  }

  if (type === "ASSIGNED" && "assigneeId" in data) {
    return `Assignee set to ${prettyValue(data.assigneeId)}`;
  }

  if (type === "ATTACHMENT_ADDED" && data.fileName) {
    return String(data.fileName);
  }

  if (type === "LINK_ADDED" && data.url) {
    return String(data.url);
  }

  if (type === "CHECKLIST_UPDATED") {
    return data.summary ? String(data.summary) : "Checklist changed";
  }

  const changes = Object.entries(data)
    .filter(([key]) => key in FIELD_LABELS)
    .map(([key, value]) => `${FIELD_LABELS[key]} → ${prettyValue(value)}`);

  return changes.length ? changes.join(" · ") : null;
}
