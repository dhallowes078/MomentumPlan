"use client";

import { useEffect } from "react";
import { TodayView } from "@/components/TodayView";

export default function TodayPage() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return <TodayView />;
}
