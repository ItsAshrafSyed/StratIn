import { describe, expect, it } from "vitest";
import { USDC_MINT } from "@stratin/shared";
import { calculateRebalanceTrades } from "./rebalance";

const ASSET_A = "AssetA111111111111111111111111111111111111";
const ASSET_B = "AssetB111111111111111111111111111111111111";

describe("rebalance engine", () => {
  it("overweight asset produces SELL and underweight asset produces BUY", () => {
    const result = calculateRebalanceTrades({
      positions: [
        { assetMint: ASSET_A, quantityAtomic: 1n, valueUsdcAtomic: 70_000_000n },
        { assetMint: ASSET_B, quantityAtomic: 1n, valueUsdcAtomic: 20_000_000n },
        { assetMint: USDC_MINT, quantityAtomic: 10_000_000n, valueUsdcAtomic: 10_000_000n }
      ],
      targetAllocations: [
        { assetMint: ASSET_A, weightBps: 5000 },
        { assetMint: ASSET_B, weightBps: 4000 },
        { assetMint: USDC_MINT, weightBps: 1000 }
      ]
    });

    expect(result.trades).toEqual([
      { side: "SELL", assetMint: ASSET_A, valueUsdcAtomic: 20_000_000n },
      { side: "BUY", assetMint: ASSET_B, valueUsdcAtomic: 20_000_000n }
    ]);
  });

  it("unchanged allocation produces no unnecessary trade", () => {
    const result = calculateRebalanceTrades({
      positions: [
        { assetMint: ASSET_A, quantityAtomic: 1n, valueUsdcAtomic: 50_000_000n },
        { assetMint: USDC_MINT, quantityAtomic: 50_000_000n, valueUsdcAtomic: 50_000_000n }
      ],
      targetAllocations: [
        { assetMint: ASSET_A, weightBps: 5000 },
        { assetMint: USDC_MINT, weightBps: 5000 }
      ]
    });

    expect(result.trades).toHaveLength(0);
  });

  it("validates target weights total 10,000", () => {
    expect(() =>
      calculateRebalanceTrades({
        positions: [{ assetMint: ASSET_A, quantityAtomic: 1n, valueUsdcAtomic: 100_000_000n }],
        targetAllocations: [{ assetMint: ASSET_A, weightBps: 9000 }]
      })
    ).toThrow("Target allocation weights must total 10000 bps.");
  });
});
