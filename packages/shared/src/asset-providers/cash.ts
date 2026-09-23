import { USDC_MINT, type TokenizedEquityAsset } from "./types";

export const CASH_ASSETS = [
  {
    mint: USDC_MINT,
    symbol: "USDC",
    underlyingSymbol: "USD",
    name: "USD Coin",
    issuer: "Circle",
    providerId: "circle",
    marketSegment: "cash",
    metadataSource: "https://www.circle.com/usdc",
    tokenProgram: "spl-token",
    decimals: 6,
    assetClass: "cash",
    priceSource: "stablecoin-parity",
    liquidityReview: {
      provider: "native-cash-leg",
      checkedAt: "2026-09-15T00:08:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "0",
      status: "cash",
    },
  },
] as const satisfies readonly TokenizedEquityAsset[];
