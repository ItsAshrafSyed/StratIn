export type PerformancePeriod =
  "oneWeek" | "oneMonth" | "threeMonths" | "sinceInception";

export type NavPoint = Readonly<{
  timestamp: Date;
  navUsdcAtomic: bigint;
}>;

export type PerformanceResult = Record<PerformancePeriod, bigint | null>;

const PERIODS: Record<Exclude<PerformancePeriod, "sinceInception">, number> = {
  oneWeek: 7 * 24 * 60 * 60 * 1000,
  oneMonth: 30 * 24 * 60 * 60 * 1000,
  threeMonths: 90 * 24 * 60 * 60 * 1000,
};

export function calculateReturnBps(
  currentNav: bigint,
  historicalNav: bigint,
): bigint {
  if (historicalNav <= 0n) {
    throw new Error("Historical NAV must be greater than zero.");
  }

  return ((currentNav - historicalNav) * 10_000n) / historicalNav;
}

export function calculatePerformance(
  points: readonly NavPoint[],
  now = new Date(),
): PerformanceResult {
  if (points.length === 0) {
    return {
      oneWeek: null,
      oneMonth: null,
      threeMonths: null,
      sinceInception: null,
    };
  }

  const sorted = [...points].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const current = sorted[sorted.length - 1];
  const inception = sorted[0];
  const result: PerformanceResult = {
    oneWeek: null,
    oneMonth: null,
    threeMonths: null,
    sinceInception: calculateReturnBps(
      current.navUsdcAtomic,
      inception.navUsdcAtomic,
    ),
  };

  for (const [period, durationMs] of Object.entries(PERIODS) as [
    keyof typeof PERIODS,
    number,
  ][]) {
    const targetTime = now.getTime() - durationMs;
    const historical = sorted
      .filter((point) => point.timestamp.getTime() <= targetTime)
      .at(-1);
    result[period] = historical
      ? calculateReturnBps(current.navUsdcAtomic, historical.navUsdcAtomic)
      : null;
  }

  return result;
}
