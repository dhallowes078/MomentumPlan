"use client";

import { useCallback, useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { localDb, type LocalPrefs, type LocalScheduleBlock, type LocalTask, type LocalWorkspace } from "./db";
import * as repo from "./repo";
import { bootLocalSync, saveAndSync, subscribeSync, todayWindow } from "./sync";

function useLiveQuery<T>(querier: () => Promise<T>, initial: T, deps: unknown[] = []): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const obs = liveQuery(querier);
    const sub = obs.subscribe({
      next: (v) => setValue(v),
      error: () => undefined,
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useSyncIndicator() {
  const [state, setState] = useState({
    status: "idle" as "idle" | "syncing" | "offline" | "error",
    pending: 0,
    lastError: undefined as string | undefined,
  });
  useEffect(() => {
    return subscribeSync((s) => {
      setState({
        status: s.status,
        pending: s.pending,
        lastError: s.lastError,
      });
    });
  }, []);
  const refresh = useCallback(async () => {
    await saveAndSync();
  }, []);
  return { ...state, refresh };
}

export function useLocalBoot() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void bootLocalSync().finally(() => {
      if (!cancelled) setReady(true);
    });
    const onOnline = () => {
      void saveAndSync();
    };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return ready;
}

export function useLocalWorkspaces() {
  return useLiveQuery(() => repo.listWorkspaces(), [] as LocalWorkspace[], []);
}

export function useLocalTasks(workspaceId: string) {
  return useLiveQuery(
    () => (workspaceId ? repo.listTasks(workspaceId) : Promise.resolve([] as LocalTask[])),
    [] as LocalTask[],
    [workspaceId]
  );
}

export function useLocalToday() {
  const { from, to } = todayWindow();
  const blocks = useLiveQuery(
    () => repo.listTodayBlocks(from, to),
    [] as LocalScheduleBlock[],
    [from.toISOString()]
  );
  const backlog = useLiveQuery(() => repo.listBacklog(), [] as LocalTask[], []);
  const atRisk = useLiveQuery(() => repo.listAtRisk(), [] as LocalTask[], []);
  return { blocks, backlog, atRisk };
}

export function useLocalPrefs() {
  return useLiveQuery(() => repo.getPrefs(), null as LocalPrefs | null, []);
}

export function useLocalMeetings() {
  return useLiveQuery(() => localDb.meetings.orderBy("start").toArray(), [], []);
}

export function useLocalScheduleBlocks() {
  return useLiveQuery(() => repo.listScheduleBlocks(), [] as LocalScheduleBlock[], []);
}

/** All tasks across workspaces — used by calendar to filter orphan/ghost blocks. */
export function useLocalAllTasks() {
  return useLiveQuery(() => localDb.tasks.toArray(), [] as LocalTask[], []);
}

export function useLocalTask(id: string) {
  return useLiveQuery(() => repo.getTask(id), undefined as LocalTask | undefined, [id]);
}
