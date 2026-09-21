import { getSupportedAssetByMint, USDC_MINT, type TokenizedEquityAsset } from "@stratin/shared";

export const TOTAL_WEIGHT_BPS = 10_000;

export type StrategyAllocationInput = Readonly<{
  mint: string;
  weightBps: number;
}>;

export type CalculateAllocationInput = Readonly<{
  investmentAmountAtomic: bigint;
  allocations: readonly StrategyAllocationInput[];
  supportedAssets?: readonly TokenizedEquityAsset[];
}>;

export type AllocationLeg = Readonly<{
  mint: string;
  symbol: string;
  weightBps: number;
  targetAmountAtomic: bigint;
  targetAmountUsdAtomic: bigint;
  requiresSwap: boolean;
}>;

export type AllocationResult = Readonly<{
  inputMint: typeof USDC_MINT;
  investmentAmountAtomic: bigint;
  swapAmountAtomic: bigint;
  retainedUsdcAmountAtomic: bigint;
  legs: readonly AllocationLeg[];
}>;

function findSupportedAsset(
  mint: string,
  supportedAssets?: readonly TokenizedEquityAsset[]
): TokenizedEquityAsset | undefined {
  return supportedAssets?.find((asset) => asset.mint === mint) ?? getSupportedAssetByMint(mint);
}

function assertIntegerWeight(weightBps: number, mint: string) {
  if (!Number.isInteger(weightBps) || weightBps <= 0) {
    throw new Error(`Allocation for ${mint} must be a positive integer bps value.`);
  }
}

export function calculateAllocation({
  investmentAmountAtomic,
  allocations,
  supportedAssets
}: CalculateAllocationInput): AllocationResult {
  if (investmentAmountAtomic <= 0n) {
    throw new Error("Investment amount must be greater than zero.");
  }

  if (allocations.length === 0) {
    throw new Error("At least one allocation is required.");
  }

  const seenMints = new Set<string>();
  let totalWeightBps = 0;

  for (const allocation of allocations) {
    assertIntegerWeight(allocation.weightBps, allocation.mint);

    if (seenMints.has(allocation.mint)) {
      throw new Error(`Duplicate asset allocation: ${allocation.mint}`);
    }

    seenMints.add(allocation.mint);
    totalWeightBps += allocation.weightBps;

    if (!findSupportedAsset(allocation.mint, supportedAssets)) {
      throw new Error(`Unsupported asset allocation: ${allocation.mint}`);
    }
  }

  if (totalWeightBps !== TOTAL_WEIGHT_BPS) {
    throw new Error(`Allocation weights must total ${TOTAL_WEIGHT_BPS} bps.`);
  }

  let allocatedAmountAtomic = 0n;
  const sortedAllocations = [...allocations].sort((a, b) => b.weightBps - a.weightBps);
  const legs = sortedAllocations.map((allocation, index) => {
    const asset = findSupportedAsset(allocation.mint, supportedAssets);

    if (!asset) {
      throw new Error(`Unsupported asset allocation: ${allocation.mint}`);
    }

    const isLastLeg = index === sortedAllocations.length - 1;
    const targetAmountAtomic = isLastLeg
      ? investmentAmountAtomic - allocatedAmountAtomic
      : (investmentAmountAtomic * BigInt(allocation.weightBps)) / BigInt(TOTAL_WEIGHT_BPS);

    allocatedAmountAtomic += targetAmountAtomic;

    return {
      mint: allocation.mint,
      symbol: asset.symbol,
      weightBps: allocation.weightBps,
      targetAmountAtomic,
      targetAmountUsdAtomic: targetAmountAtomic,
      requiresSwap: allocation.mint !== USDC_MINT
    };
  });

  const retainedUsdcAmountAtomic = legs
    .filter((leg) => !leg.requiresSwap)
    .reduce((sum, leg) => sum + leg.targetAmountAtomic, 0n);

  return {
    inputMint: USDC_MINT,
    investmentAmountAtomic,
    swapAmountAtomic: investmentAmountAtomic - retainedUsdcAmountAtomic,
    retainedUsdcAmountAtomic,
    legs
  };
}
