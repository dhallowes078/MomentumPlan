"use client";

import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/ThemeProvider";

/**
 * Keep mouse-wheel on number fields from scrolling the page.
 * The field value still changes via the browser's native spinner behaviour
 * when we adjust it manually after preventDefault.
 */
function NumberInputWheelGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "number") return;
      // Stop the page from scrolling under the field.
      event.preventDefault();
      if (target.disabled || target.readOnly) return;

      const step = Number(target.step) || 1;
      const min = target.min === "" ? Number.NEGATIVE_INFINITY : Number(target.min);
      const max = target.max === "" ? Number.POSITIVE_INFINITY : Number(target.max);
      const current = target.value === "" ? 0 : Number(target.value);
      if (Number.isNaN(current)) return;

      const next = Math.min(
        max,
        Math.max(min, current + (event.deltaY > 0 ? -step : step))
      );
      if (next === current) return;

      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(target, String(next));
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    };

    document.addEventListener("wheel", onWheel, { passive: false });
    return () => document.removeEventListener("wheel", onWheel);
  }, []);

  return children;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <NumberInputWheelGuard>{children}</NumberInputWheelGuard>
      </ThemeProvider>
    </SessionProvider>
  );
}
