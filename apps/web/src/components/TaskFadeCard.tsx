"use client";

import type { CSSProperties, ReactNode } from "react";
import clsx from "clsx";
import { resolveMediaUrl } from "@/lib/sync-api";

export function TaskFadeCard({
  headerImageUrl,
  fadeColor,
  className,
  style,
  children,
}: {
  headerImageUrl?: string | null;
  fadeColor?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const mediaSrc = headerImageUrl ? resolveMediaUrl(headerImageUrl) : null;
  return (
    <div
      className={clsx("card task-fade-card", className)}
      data-has-header={mediaSrc ? "true" : undefined}
      style={
        {
          ...style,
          ["--fade-color" as string]: fadeColor,
        } as CSSProperties
      }
    >
      {mediaSrc ? (
        <div className="task-fade-photo" aria-hidden>
          <img src={mediaSrc} alt="" />
        </div>
      ) : null}
      <div className="task-fade-body">{children}</div>
    </div>
  );
}
