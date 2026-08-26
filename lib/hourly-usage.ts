/** Demo hourly usage — resets on the clock hour. */
export type HourlyUsage = {
  /** 0–100 share of the current hour's allowance used. */
  percent: number;
};

/** On new chat, hide the usage bar until this threshold is reached. */
export const LANDING_USAGE_THRESHOLD = 90;

function seededPercent(hourKey: number) {
  const n = Math.abs(Math.sin(hourKey * 12.9898) * 43758.5453);
  return Math.round(22 + (n - Math.floor(n)) * 58);
}

export function hourlyUsage(now = Date.now()): HourlyUsage {
  const startOfHour = Math.floor(now / 3_600_000) * 3_600_000;
  const percent = seededPercent(startOfHour / 3_600_000);
  return { percent };
}
