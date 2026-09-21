import { describe, expect, it } from "vitest";
import { USDC_MINT } from "@stratin/shared";
import { calculateNav, initializeModelPositions, rebalanceModelPositions, type PriceProvider } from "./nav";

const ASSET_A = "AssetA111111111111111111111111111111111111";
const ASSET_B = "AssetB111111111111111111111111111111111111";

class FixedPriceProvider implements PriceProvider {
  prices = new Map<string, bigint>([
    [ASSET_A, 2_000_000n],
    [ASSET_B, 5_000_000n]
  ]);

  async getUsdValue(assetMint: string, quantityAtomic: bigint) {
    const price = this.prices.get(assetMint);
    if (!price) {
      throw new Error(`Missing price for ${assetMint}.`);
    }
    return (quantityAtomic * price) / 100_000_000n;
  }

  async getQuantityForUsdValue(assetMint: string, usdcAmountAtomic: bigint) {
    const price = this.prices.get(assetMint);
    if (!price) {
      throw new Error(`Missing price for ${assetMint}.`);
    }
    return (usdcAmountAtomic * 100_000_000n) / price;
  }
}

describe("canonical NAV", () => {
  it("initializes model positions at NAV 100", async () => {
    const provider = new FixedPriceProvider();
    const positions = await initializeModelPositions(
      [
        { assetMint: ASSET_A, weightBps: 5000 },
        { assetMint: USDC_MINT, weightBps: 5000 }
      ],
      provider
    );
    const nav = await calculateNav({ positions, priceProvider: provider });

    expect(nav.navUsdcAtomic).toBe(100_000_000n);
  });

  it("investor deposits do not affect canonical NAV", async () => {
    const provider = new FixedPriceProvider();
    const positions = await initializeModelPositions(
      [
        { assetMint: ASSET_A, weightBps: 5000 },
        { assetMint: USDC_MINT, weightBps: 5000 }
      ],
      provider
    );
    const before = await calculateNav({ positions, priceProvider: provider });
    const afterInvestorDeposit = await calculateNav({ positions, priceProvider: provider });

    expect(afterInvestorDeposit.navUsdcAtomic).toBe(before.navUsdcAtomic);
  });

  it("asset price movement changes NAV without reapplying target weights", async () => {
    const provider = new FixedPriceProvider();
    const positions = await initializeModelPositions(
      [
        { assetMint: ASSET_A, weightBps: 5000 },
        { assetMint: USDC_MINT, weightBps: 5000 }
      ],
      provider
    );
    provider.prices.set(ASSET_A, 3_000_000n);
    const nav = await calculateNav({ positions, priceProvider: provider });

    expect(nav.navUsdcAtomic).toBe(125_000_000n);
    expect(nav.valuedPositions.find((position) => position.assetMint === ASSET_A)?.valueUsdcAtomic).toBe(75_000_000n);
  });

  it("missing price fails safely", async () => {
    const provider = new FixedPriceProvider();
    await expect(
      calculateNav({
        positions: [{ assetMint: "MissingMint", quantityAtomic: 1n }],
        priceProvider: provider
      })
    ).rejects.toThrow("Missing price");
  });

  it("canonical rebalance does not reset NAV", async () => {
    const provider = new FixedPriceProvider();
    const positions = await initializeModelPositions(
      [
        { assetMint: ASSET_A, weightBps: 5000 },
        { assetMint: USDC_MINT, weightBps: 5000 }
      ],
      provider
    );
    provider.prices.set(ASSET_A, 3_000_000n);

    const rebalanced = await rebalanceModelPositions({
      currentPositions: positions,
      newAllocations: [
        { assetMint: ASSET_A, weightBps: 3000 },
        { assetMint: ASSET_B, weightBps: 3000 },
        { assetMint: USDC_MINT, weightBps: 4000 }
      ],
      priceProvider: provider
    });

    expect(rebalanced.beforeNavUsdcAtomic).toBe(125_000_000n);
    expect(rebalanced.afterNavUsdcAtomic).toBe(125_000_000n);
  });
});
