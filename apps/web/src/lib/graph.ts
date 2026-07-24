import { prisma } from "@/lib/db";

const GRAPH = "https://graph.microsoft.com/v1.0";
export const MOMENTUM_CATEGORY = "Momentum";

async function refreshAccessToken(userId: string): Promise<string | null> {
  const conn = await prisma.calendarConnection.findUnique({ where: { userId } });
  if (!conn?.refreshToken) {
    // Fall back to Account table from Auth.js
    const account = await prisma.account.findFirst({
      where: { userId, provider: "microsoft-entra-id" },
    });
    if (!account?.refresh_token) return account?.access_token ?? null;

    const refreshed = await doRefresh(account.refresh_token);
    if (!refreshed) return account.access_token ?? null;

    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? account.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      },
    });

    await prisma.calendarConnection.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? account.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
      update: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? account.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });

    return refreshed.access_token;
  }

  if (conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000 && conn.accessToken) {
    return conn.accessToken;
  }

  const refreshed = await doRefresh(conn.refreshToken);
  if (!refreshed) return conn.accessToken;

  await prisma.calendarConnection.update({
    where: { userId },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? conn.refreshToken,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });

  return refreshed.access_token;
}

async function doRefresh(refreshToken: string) {
  const tenant = "common";
  const body = new URLSearchParams({
    client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
    client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "openid profile email offline_access User.Read Calendars.ReadWrite",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    console.error("Token refresh failed", await res.text());
    return null;
  }

  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

export async function getGraphToken(userId: string): Promise<string | null> {
  return refreshAccessToken(userId);
}

async function graphFetch(userId: string, path: string, init?: RequestInit) {
  const token = await getGraphToken(userId);
  if (!token) throw new Error("NO_GRAPH_TOKEN");

  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.timezone="UTC"',
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export type GraphEvent = {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  categories?: string[];
  isAllDay?: boolean;
  showAs?: string;
};

export async function listCalendarEvents(
  userId: string,
  start: Date,
  end: Date
): Promise<GraphEvent[]> {
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: "id,subject,start,end,categories,isAllDay,showAs",
    $orderby: "start/dateTime",
    $top: "250",
  });

  const data = await graphFetch(
    userId,
    `/me/calendarView?${params.toString()}`
  );
  return (data?.value ?? []) as GraphEvent[];
}

export async function ensureMomentumCategory(userId: string) {
  try {
    const data = await graphFetch(userId, "/me/outlook/masterCategories");
    const existing = (data?.value ?? []).find(
      (c: { displayName: string }) => c.displayName === MOMENTUM_CATEGORY
    );
    if (!existing) {
      await graphFetch(userId, "/me/outlook/masterCategories", {
        method: "POST",
        body: JSON.stringify({
          displayName: MOMENTUM_CATEGORY,
          color: "preset5",
        }),
      });
    }
  } catch (e) {
    console.warn("Could not ensure Momentum category", e);
  }
}

export async function upsertTaskEvent(
  userId: string,
  opts: {
    eventId?: string | null;
    title: string;
    start: Date;
    end: Date;
    body?: string;
  }
): Promise<string> {
  await ensureMomentumCategory(userId);

  const payload = {
    subject: `⚡ ${opts.title}`,
    body: {
      contentType: "text",
      content: opts.body ?? "Scheduled by Momentum",
    },
    start: { dateTime: opts.start.toISOString().replace(/\.\d{3}Z$/, ""), timeZone: "UTC" },
    end: { dateTime: opts.end.toISOString().replace(/\.\d{3}Z$/, ""), timeZone: "UTC" },
    categories: [MOMENTUM_CATEGORY],
    showAs: "busy",
    isReminderOn: false,
  };

  if (opts.eventId) {
    try {
      await graphFetch(userId, `/me/events/${opts.eventId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      return opts.eventId;
    } catch {
      // recreate if missing
    }
  }

  const created = await graphFetch(userId, "/me/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return created.id as string;
}

export async function deleteTaskEvent(userId: string, eventId: string) {
  try {
    await graphFetch(userId, `/me/events/${eventId}`, { method: "DELETE" });
  } catch (e) {
    console.warn("Failed to delete Outlook event", eventId, e);
  }
}

export function isMomentumEvent(ev: GraphEvent): boolean {
  return (
    (ev.categories ?? []).includes(MOMENTUM_CATEGORY) ||
    (ev.subject ?? "").startsWith("⚡ ")
  );
}
