export const DEFAULT_ENTRY_FEE_BPS = 25;
export const DEFAULT_REBALANCE_FEE_BPS = 10;
export const DEFAULT_PROTOCOL_FEE_SHARE_BPS = 2_000;
export const DEFAULT_PROTOCOL_TREASURY = "stiFExnwsWbHxrB5CqCSBWMbLjgB8hVLURtUsyAr3RT";

export type FeeEventType = "INVEST" | "REBALANCE";

export type FeeConfig = {
  entryFeeBps: number;
  rebalanceFeeBps: number;
  protocolFeeShareBps: number;
  protocolTreasury: string;
};

export type FeeBreakdown = {
  eventType: FeeEventType;
  actionAmountAtomic: bigint;
  totalFeeAtomic: bigint;
  strategistFeeAtomic: bigint;
  protocolFeeAtomic: bigint;
};

export function parseFeeConfig(input: {
  ENTRY_FEE_BPS?: string | number;
  REBALANCE_FEE_BPS?: string | number;
  PROTOCOL_FEE_SHARE_BPS?: string | number;
  PROTOCOL_TREASURY?: string;
}): FeeConfig {
  return {
    entryFeeBps: parseBps(input.ENTRY_FEE_BPS, DEFAULT_ENTRY_FEE_BPS, "ENTRY_FEE_BPS"),
    rebalanceFeeBps: parseBps(input.REBALANCE_FEE_BPS, DEFAULT_REBALANCE_FEE_BPS, "REBALANCE_FEE_BPS"),
    protocolFeeShareBps: parseBps(
      input.PROTOCOL_FEE_SHARE_BPS,
      DEFAULT_PROTOCOL_FEE_SHARE_BPS,
      "PROTOCOL_FEE_SHARE_BPS"
    ),
    protocolTreasury: input.PROTOCOL_TREASURY?.trim() || DEFAULT_PROTOCOL_TREASURY
  };
}

export function calculateFeeBreakdown(
  eventType: FeeEventType,
  actionAmountAtomic: bigint,
  config: Pick<FeeConfig, "entryFeeBps" | "rebalanceFeeBps" | "protocolFeeShareBps">
): FeeBreakdown {
  if (actionAmountAtomic < 0n) {
    throw new Error("Fee action amount cannot be negative.");
  }

  const feeBps = eventType === "INVEST" ? config.entryFeeBps : config.rebalanceFeeBps;
  assertValidBps(feeBps, `${eventType} fee bps`);
  assertValidBps(config.protocolFeeShareBps, "Protocol fee share bps");

  const totalFeeAtomic = divideRoundUp(actionAmountAtomic * BigInt(feeBps), 10_000n);
  const protocolFeeAtomic = divideRoundDown(totalFeeAtomic * BigInt(config.protocolFeeShareBps), 10_000n);
  const strategistFeeAtomic = totalFeeAtomic - protocolFeeAtomic;

  return {
    eventType,
    actionAmountAtomic,
    totalFeeAtomic,
    strategistFeeAtomic,
    protocolFeeAtomic
  };
}

export function calculateRebalanceFeeBasis(
  trades: readonly { side: "BUY" | "SELL"; valueUsdcAtomic: bigint }[]
) {
  const sellNotional = trades
    .filter((trade) => trade.side === "SELL")
    .reduce((sum, trade) => sum + trade.valueUsdcAtomic, 0n);
  const buyNotional = trades
    .filter((trade) => trade.side === "BUY")
    .reduce((sum, trade) => sum + trade.valueUsdcAtomic, 0n);

  return sellNotional > buyNotional ? sellNotional : buyNotional;
}

function parseBps(value: string | number | undefined, fallback: number, label: string) {
  const parsed = value === undefined || value === "" ? fallback : Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }

  assertValidBps(parsed, label);
  return parsed;
}

function assertValidBps(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} must be between 0 and 10000 bps.`);
  }
}

function divideRoundDown(numerator: bigint, denominator: bigint) {
  return numerator / denominator;
}

function divideRoundUp(numerator: bigint, denominator: bigint) {
  if (numerator === 0n) {
    return 0n;
  }

  return (numerator + denominator - 1n) / denominator;
}
