import { describe, expect, it, vi } from "vitest";
import { navIntervalStart, processNavCron } from "./nav-cron";

describe("NAV cron", () => {
  it("rounds scheduled time down to the hourly bucket", () => {
    expect(
      navIntervalStart(new Date("2026-09-21T10:37:42.000Z")).toISOString(),
    ).toBe("2026-09-21T10:00:00.000Z");
  });

  it("processes active strategy ids", async () => {
    const refresh = vi.fn(async () => undefined);

    const results = await processNavCron(["strategy-a", "strategy-b"], refresh);

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { strategyId: "strategy-a", ok: true },
      { strategyId: "strategy-b", ok: true },
    ]);
  });

  it("isolates one strategy failure from the rest", async () => {
    const refresh = vi.fn(async (strategyId: string) => {
      if (strategyId === "strategy-b") {
        throw new Error("missing price");
      }
    });

    const results = await processNavCron(
      ["strategy-a", "strategy-b", "strategy-c"],
      refresh,
    );

    expect(refresh).toHaveBeenCalledTimes(3);
    expect(results).toEqual([
      { strategyId: "strategy-a", ok: true },
      { strategyId: "strategy-b", ok: false, error: "missing price" },
      { strategyId: "strategy-c", ok: true },
    ]);
  });

  it("ignores inactive strategies when caller only passes active ids", async () => {
    const refresh = vi.fn(async () => undefined);

    await processNavCron(["active-strategy"], refresh);

    expect(refresh).toHaveBeenCalledWith("active-strategy");
    expect(refresh).not.toHaveBeenCalledWith("closed-strategy");
  });
});
