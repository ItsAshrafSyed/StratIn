import { describe, expect, it } from "vitest";
import { SUPPORTED_TOKENIZED_EQUITIES, USDC_MINT } from "@stratin/shared";
import { calculateAllocation } from "./allocation";

const [nvda, aapl, meta, tsla] = SUPPORTED_TOKENIZED_EQUITIES;

describe("calculateAllocation", () => {
  it("converts a USDC amount into weighted target amounts", () => {
    const result = calculateAllocation({
      investmentAmountAtomic: 100_000_000n,
      allocations: [
        { mint: nvda.mint, weightBps: 3000 },
        { mint: aapl.mint, weightBps: 2500 },
        { mint: meta.mint, weightBps: 2000 },
        { mint: tsla.mint, weightBps: 1500 },
        { mint: USDC_MINT, weightBps: 1000 },
      ],
    });

    expect(result.inputMint).toBe(USDC_MINT);
    expect(result.investmentAmountAtomic).toBe(100_000_000n);
    expect(result.retainedUsdcAmountAtomic).toBe(10_000_000n);
    expect(result.swapAmountAtomic).toBe(90_000_000n);
    expect(
      result.legs.map((leg) => [leg.symbol, leg.targetAmountAtomic]),
    ).toEqual([
      ["NVDAx", 30_000_000n],
      ["AAPLx", 25_000_000n],
      ["METAx", 20_000_000n],
      ["TSLAx", 15_000_000n],
      ["USDC", 10_000_000n],
    ]);
  });

  it("uses integer-safe remainder handling so all legs sum to the investment", () => {
    const result = calculateAllocation({
      investmentAmountAtomic: 100_000_001n,
      allocations: [
        { mint: nvda.mint, weightBps: 3333 },
        { mint: aapl.mint, weightBps: 3333 },
        { mint: USDC_MINT, weightBps: 3334 },
      ],
    });

    const total = result.legs.reduce(
      (sum, leg) => sum + leg.targetAmountAtomic,
      0n,
    );

    expect(total).toBe(100_000_001n);
  });

  it("rejects zero investment amounts", () => {
    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: 0n,
        allocations: [{ mint: USDC_MINT, weightBps: 10_000 }],
      }),
    ).toThrow("Investment amount must be greater than zero.");
  });

  it("rejects negative investment amounts", () => {
    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: -1n,
        allocations: [{ mint: USDC_MINT, weightBps: 10_000 }],
      }),
    ).toThrow("Investment amount must be greater than zero.");
  });

  it("rejects weights that do not total 10,000 bps", () => {
    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: 100_000_000n,
        allocations: [
          { mint: nvda.mint, weightBps: 3000 },
          { mint: USDC_MINT, weightBps: 6000 },
        ],
      }),
    ).toThrow("Allocation weights must total 10000 bps.");
  });

  it("rejects duplicate mints", () => {
    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: 100_000_000n,
        allocations: [
          { mint: nvda.mint, weightBps: 5000 },
          { mint: nvda.mint, weightBps: 4000 },
          { mint: USDC_MINT, weightBps: 1000 },
        ],
      }),
    ).toThrow(`Duplicate asset allocation: ${nvda.mint}`);
  });

  it("rejects unsupported mints", () => {
    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: 100_000_000n,
        allocations: [
          {
            mint: "UnsupportedMint111111111111111111111111111111",
            weightBps: 9000,
          },
          { mint: USDC_MINT, weightBps: 1000 },
        ],
      }),
    ).toThrow("Unsupported asset allocation");
  });

  it("rejects zero and fractional bps weights", () => {
    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: 100_000_000n,
        allocations: [{ mint: USDC_MINT, weightBps: 0 }],
      }),
    ).toThrow("must be a positive integer bps value");

    expect(() =>
      calculateAllocation({
        investmentAmountAtomic: 100_000_000n,
        allocations: [{ mint: USDC_MINT, weightBps: 9999.5 }],
      }),
    ).toThrow("must be a positive integer bps value");
  });
});
