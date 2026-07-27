import { addDays, format, startOfDay } from "date-fns";
import { useMemo } from "react";
import { formatTime, priorityColor } from "@/lib/format";
import { useLocalPrefs, useLocalScheduleBlocks } from "@/lib/local/hooks";

export function CalendarPage() {
  const blocks = useLocalScheduleBlocks();
  const prefs = useLocalPrefs();
  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(() => {
    const n = prefs?.planningDays ?? 7;
    return Array.from({ length: Math.min(n, 14) }, (_, i) => addDays(today, i));
  }, [today, prefs?.planningDays]);

  return (
    <div className="page">
      <div>
        <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "1.75rem" }}>Calendar</h1>
        <p style={{ margin: "0.3rem 0 0", color: "var(--ink-muted)" }}>
          Local schedule blocks (Outlook meetings sync from the web app later)
        </p>
      </div>

      {days.map((day) => {
        const dayStart = day.getTime();
        const dayEnd = addDays(day, 1).getTime();
        const dayBlocks = blocks.filter((b) => {
          const s = new Date(b.start).getTime();
          return s >= dayStart && s < dayEnd;
        });
        return (
          <section key={day.toISOString()} className="card" style={{ padding: "0.9rem", display: "grid", gap: "0.45rem" }}>
            <strong>{format(day, "EEE d MMM")}</strong>
            {dayBlocks.length === 0 ? (
              <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>Free</p>
            ) : (
              dayBlocks.map((b) => (
                <div key={b.id} style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                  <span className="priority-dot" style={{ background: priorityColor(b.task?.priority ?? 3) }} />
                  <span style={{ color: "var(--ink-muted)", fontSize: "0.8rem", width: 88 }}>
                    {formatTime(b.start)}–{formatTime(b.end)}
                  </span>
                  <span style={{ flex: 1 }}>{b.task?.title ?? "Task"}</span>
                </div>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
