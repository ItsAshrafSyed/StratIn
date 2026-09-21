import { USDC_MINT } from "@stratin/shared";

export const NAV_BASE_USDC_ATOMIC = 100_000_000n;

export type ModelPosition = Readonly<{
  assetMint: string;
  quantityAtomic: bigint;
}>;

export type ValuedModelPosition = ModelPosition &
  Readonly<{
    valueUsdcAtomic: bigint;
  }>;

export type PriceProvider = Readonly<{
  getUsdValue(assetMint: string, quantityAtomic: bigint): Promise<bigint>;
  getQuantityForUsdValue(assetMint: string, usdcAmountAtomic: bigint): Promise<bigint>;
}>;

export type NavSnapshotInput = Readonly<{
  positions: readonly ModelPosition[];
  priceProvider: PriceProvider;
}>;

export type NavSnapshotResult = Readonly<{
  navUsdcAtomic: bigint;
  valuedPositions: readonly ValuedModelPosition[];
}>;

export async function calculateNav({ positions, priceProvider }: NavSnapshotInput): Promise<NavSnapshotResult> {
  if (positions.length === 0) {
    throw new Error("Cannot calculate NAV without model positions.");
  }

  const valuedPositions: ValuedModelPosition[] = [];
  let navUsdcAtomic = 0n;

  for (const position of positions) {
    if (position.quantityAtomic < 0n) {
      throw new Error(`Negative model quantity for ${position.assetMint}.`);
    }

    const valueUsdcAtomic =
      position.assetMint === USDC_MINT
        ? position.quantityAtomic
        : await priceProvider.getUsdValue(position.assetMint, position.quantityAtomic);

    navUsdcAtomic += valueUsdcAtomic;
    valuedPositions.push({ ...position, valueUsdcAtomic });
  }

  return { navUsdcAtomic, valuedPositions };
}

export async function initializeModelPositions(
  allocations: readonly { assetMint: string; weightBps: number }[],
  priceProvider: PriceProvider
): Promise<ModelPosition[]> {
  let allocated = 0n;
  const positions: ModelPosition[] = [];

  for (const [index, allocation] of allocations.entries()) {
    const isLast = index === allocations.length - 1;
    const targetUsdcAtomic = isLast
      ? NAV_BASE_USDC_ATOMIC - allocated
      : (NAV_BASE_USDC_ATOMIC * BigInt(allocation.weightBps)) / 10_000n;
    allocated += targetUsdcAtomic;

    const quantityAtomic =
      allocation.assetMint === USDC_MINT
        ? targetUsdcAtomic
        : await priceProvider.getQuantityForUsdValue(allocation.assetMint, targetUsdcAtomic);

    positions.push({ assetMint: allocation.assetMint, quantityAtomic });
  }

  return positions;
}

export async function rebalanceModelPositions(input: {
  currentPositions: readonly ModelPosition[];
  newAllocations: readonly { assetMint: string; weightBps: number }[];
  priceProvider: PriceProvider;
}): Promise<{
  beforeNavUsdcAtomic: bigint;
  afterNavUsdcAtomic: bigint;
  costUsdcAtomic: bigint;
  positions: readonly ModelPosition[];
}> {
  const before = await calculateNav({ positions: input.currentPositions, priceProvider: input.priceProvider });
  let allocated = 0n;
  const positions: ModelPosition[] = [];

  for (const [index, allocation] of input.newAllocations.entries()) {
    const isLast = index === input.newAllocations.length - 1;
    const targetUsdcAtomic = isLast
      ? before.navUsdcAtomic - allocated
      : (before.navUsdcAtomic * BigInt(allocation.weightBps)) / 10_000n;
    allocated += targetUsdcAtomic;

    const quantityAtomic =
      allocation.assetMint === USDC_MINT
        ? targetUsdcAtomic
        : await input.priceProvider.getQuantityForUsdValue(allocation.assetMint, targetUsdcAtomic);

    positions.push({ assetMint: allocation.assetMint, quantityAtomic });
  }

  const after = await calculateNav({ positions, priceProvider: input.priceProvider });

  return {
    beforeNavUsdcAtomic: before.navUsdcAtomic,
    afterNavUsdcAtomic: after.navUsdcAtomic,
    costUsdcAtomic: before.navUsdcAtomic > after.navUsdcAtomic ? before.navUsdcAtomic - after.navUsdcAtomic : 0n,
    positions
  };
}
