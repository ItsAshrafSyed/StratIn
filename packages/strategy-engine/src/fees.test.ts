import { describe, expect, it } from "vitest";
import { calculateFeeBreakdown, calculateRebalanceFeeBasis, parseFeeConfig } from "@stratin/shared";

describe("fee calculation", () => {
  const config = {
    entryFeeBps: 25,
    rebalanceFeeBps: 10,
    protocolFeeShareBps: 2_000
  };

  it("calculates entry fees and strategist/protocol split", () => {
    const fee = calculateFeeBreakdown("INVEST", 10_000_000n, config);

    expect(fee.totalFeeAtomic).toBe(25_000n);
    expect(fee.strategistFeeAtomic).toBe(20_000n);
    expect(fee.protocolFeeAtomic).toBe(5_000n);
  });

  it("calculates rebalance fees from rebalance action value", () => {
    const fee = calculateFeeBreakdown("REBALANCE", 2_500_000n, config);

    expect(fee.totalFeeAtomic).toBe(2_500n);
    expect(fee.strategistFeeAtomic).toBe(2_000n);
    expect(fee.protocolFeeAtomic).toBe(500n);
  });

  it("uses traded rebalance notional instead of full portfolio value or double-counted turnover", () => {
    const basis = calculateRebalanceFeeBasis([
      { side: "SELL", valueUsdcAtomic: 120_000_000n },
      { side: "SELL", valueUsdcAtomic: 80_000_000n },
      { side: "BUY", valueUsdcAtomic: 200_000_000n }
    ]);
    const fee = calculateFeeBreakdown("REBALANCE", basis, config);

    expect(basis).toBe(200_000_000n);
    expect(fee.totalFeeAtomic).toBe(200_000n);
  });

  it("rounds total fees up and protocol share down deterministically", () => {
    const fee = calculateFeeBreakdown("INVEST", 1n, {
      entryFeeBps: 1,
      rebalanceFeeBps: 1,
      protocolFeeShareBps: 3_333
    });

    expect(fee.totalFeeAtomic).toBe(1n);
    expect(fee.protocolFeeAtomic).toBe(0n);
    expect(fee.strategistFeeAtomic).toBe(1n);
  });

  it("allows zero configured fees for local demos", () => {
    const fee = calculateFeeBreakdown("INVEST", 100_000n, {
      entryFeeBps: 0,
      rebalanceFeeBps: 0,
      protocolFeeShareBps: 0
    });

    expect(fee.totalFeeAtomic).toBe(0n);
  });

  it("parses fee config from environment-like input", () => {
    const parsed = parseFeeConfig({
      ENTRY_FEE_BPS: "30",
      REBALANCE_FEE_BPS: "12",
      PROTOCOL_FEE_SHARE_BPS: "2500",
      PROTOCOL_TREASURY: "treasury"
    });

    expect(parsed).toMatchObject({
      entryFeeBps: 30,
      rebalanceFeeBps: 12,
      protocolFeeShareBps: 2500,
      protocolTreasury: "treasury"
    });
  });
});
