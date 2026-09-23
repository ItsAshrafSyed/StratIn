export function navIntervalStart(date: Date) {
  const intervalMs = 15 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}

export async function processNavCron(
  strategyIds: readonly string[],
  refresh: (strategyId: string) => Promise<void>,
): Promise<{ strategyId: string; ok: boolean; error?: string }[]> {
  const results: { strategyId: string; ok: boolean; error?: string }[] = [];

  for (const strategyId of strategyIds) {
    try {
      await refresh(strategyId);
      results.push({ strategyId, ok: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown NAV refresh error.";
      console.error(
        JSON.stringify({
          event: "nav_cron_strategy_failed",
          strategyId,
          message,
        }),
      );
      results.push({ strategyId, ok: false, error: message });
    }
  }

  return results;
}
