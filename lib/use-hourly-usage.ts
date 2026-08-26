"use client";

import { useEffect, useState } from "react";
import { hourlyUsage } from "@/lib/hourly-usage";

export function useHourlyUsagePercent() {
  const [percent, setPercent] = useState(() => hourlyUsage().percent);

  useEffect(() => {
    const tick = () => setPercent(hourlyUsage().percent);
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return percent;
}
