import { USDC_MINT } from "@stratin/shared";

export type RebalanceSide = "BUY" | "SELL";

export type RebalancePosition = Readonly<{
  assetMint: string;
  quantityAtomic: bigint;
  valueUsdcAtomic: bigint;
}>;

export type RebalanceAllocation = Readonly<{
  assetMint: string;
  weightBps: number;
}>;

export type RebalanceTradeIntent = Readonly<{
  side: RebalanceSide;
  assetMint: string;
  valueUsdcAtomic: bigint;
}>;

export function calculateRebalanceTrades(input: {
  positions: readonly RebalancePosition[];
  targetAllocations: readonly RebalanceAllocation[];
  dustUsdcAtomic?: bigint;
}): {
  totalValueUsdcAtomic: bigint;
  trades: readonly RebalanceTradeIntent[];
} {
  const dust = input.dustUsdcAtomic ?? 1n;
  const seen = new Set<string>();
  let totalWeight = 0;

  for (const allocation of input.targetAllocations) {
    if (!Number.isInteger(allocation.weightBps) || allocation.weightBps <= 0) {
      throw new Error(`Invalid target weight for ${allocation.assetMint}.`);
    }

    if (seen.has(allocation.assetMint)) {
      throw new Error(`Duplicate target allocation: ${allocation.assetMint}`);
    }

    seen.add(allocation.assetMint);
    totalWeight += allocation.weightBps;
  }

  if (totalWeight !== 10_000) {
    throw new Error("Target allocation weights must total 10000 bps.");
  }

  const totalValueUsdcAtomic = input.positions.reduce((sum, position) => sum + position.valueUsdcAtomic, 0n);
  const currentByMint = new Map(input.positions.map((position) => [position.assetMint, position.valueUsdcAtomic]));
  const targetMints = new Set(input.targetAllocations.map((allocation) => allocation.assetMint));
  const trades: RebalanceTradeIntent[] = [];
  let allocated = 0n;

  input.targetAllocations.forEach((allocation, index) => {
    const targetValue =
      index === input.targetAllocations.length - 1
        ? totalValueUsdcAtomic - allocated
        : (totalValueUsdcAtomic * BigInt(allocation.weightBps)) / 10_000n;
    allocated += targetValue;

    const currentValue = currentByMint.get(allocation.assetMint) ?? 0n;
    const delta = targetValue - currentValue;

    if (delta > dust && allocation.assetMint !== USDC_MINT) {
      trades.push({ side: "BUY", assetMint: allocation.assetMint, valueUsdcAtomic: delta });
    } else if (delta < -dust && allocation.assetMint !== USDC_MINT) {
      trades.push({ side: "SELL", assetMint: allocation.assetMint, valueUsdcAtomic: -delta });
    }
  });

  for (const position of input.positions) {
    if (!targetMints.has(position.assetMint) && position.assetMint !== USDC_MINT && position.valueUsdcAtomic > dust) {
      trades.push({ side: "SELL", assetMint: position.assetMint, valueUsdcAtomic: position.valueUsdcAtomic });
    }
  }

  return { totalValueUsdcAtomic, trades };
}
