import { describe, expect, it } from "vitest";
import { calculatePerformance, calculateReturnBps } from "./performance";

describe("performance", () => {
  it("calculates since-inception return", () => {
    expect(calculateReturnBps(101_420_000n, 100_000_000n)).toBe(142n);
  });

  it("returns null for unavailable 1W/1M/3M periods", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    const result = calculatePerformance(
      [
        { timestamp: new Date("2026-09-20T00:00:00Z"), navUsdcAtomic: 100_000_000n },
        { timestamp: now, navUsdcAtomic: 101_000_000n }
      ],
      now
    );

    expect(result.oneWeek).toBeNull();
    expect(result.oneMonth).toBeNull();
    expect(result.threeMonths).toBeNull();
    expect(result.sinceInception).toBe(100n);
  });

  it("uses the latest historical snapshot at or before the requested period", () => {
    const now = new Date("2026-09-21T00:00:00Z");
    const result = calculatePerformance(
      [
        { timestamp: new Date("2026-09-01T00:00:00Z"), navUsdcAtomic: 100_000_000n },
        { timestamp: new Date("2026-09-13T00:00:00Z"), navUsdcAtomic: 102_000_000n },
        { timestamp: now, navUsdcAtomic: 104_040_000n }
      ],
      now
    );

    expect(result.oneWeek).toBe(200n);
  });
});
