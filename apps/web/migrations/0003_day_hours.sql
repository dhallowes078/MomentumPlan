-- Per-day schedule hour overrides (weekends vs weekdays, etc.)
ALTER TABLE "Bucket" ADD COLUMN "dayHours" TEXT;
ALTER TABLE "SchedulePrefs" ADD COLUMN "dayHours" TEXT;
