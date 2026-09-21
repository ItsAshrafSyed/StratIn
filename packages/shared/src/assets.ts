export type TokenProgram = "spl-token" | "token-2022";

export type StratInAssetClass = "cash" | "tokenized-equity";

export interface TokenizedEquityAsset {
  mint: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  issuer: string;
  tokenProgram: TokenProgram;
  decimals: number;
  assetClass: StratInAssetClass;
  priceSource?: string;
  multiplier?: number;
  liquidityReview?: {
    provider: string;
    checkedAt: string;
    inputMint: string;
    inputAmountAtomic: string;
    outAmountAtomic?: string;
    priceImpactPct?: string;
    routeLabels?: string[];
    status: "quoted" | "cash" | "needs-review";
  };
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const SUPPORTED_TOKENIZED_EQUITIES = [
  {
    mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    symbol: "NVDAx",
    underlyingSymbol: "NVDA",
    name: "NVIDIA xStock",
    issuer: "Backed Finance",
    tokenProgram: "token-2022",
    decimals: 8,
    assetClass: "tokenized-equity",
    priceSource: "issuer-metadata+jupiter-quote-review",
    liquidityReview: {
      provider: "jupiter-lite",
      checkedAt: "2026-09-15T00:06:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "10000000",
      outAmountAtomic: "4705170",
      priceImpactPct: "0.0003122344570105684944220468",
      routeLabels: ["Riptide"],
      status: "quoted"
    }
  },
  {
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    symbol: "AAPLx",
    underlyingSymbol: "AAPL",
    name: "Apple xStock",
    issuer: "Backed Finance",
    tokenProgram: "token-2022",
    decimals: 8,
    assetClass: "tokenized-equity",
    priceSource: "issuer-metadata+jupiter-quote-review",
    liquidityReview: {
      provider: "jupiter-lite",
      checkedAt: "2026-09-15T00:08:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "10000000",
      outAmountAtomic: "2996037",
      priceImpactPct: "0.0018706156691716459250330669",
      routeLabels: ["Byreal", "Flux", "PancakeSwap"],
      status: "quoted"
    }
  },
  {
    mint: "Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu",
    symbol: "METAx",
    underlyingSymbol: "META",
    name: "Meta xStock",
    issuer: "Backed Finance",
    tokenProgram: "token-2022",
    decimals: 8,
    assetClass: "tokenized-equity",
    priceSource: "issuer-metadata+jupiter-quote-review",
    liquidityReview: {
      provider: "jupiter-lite",
      checkedAt: "2026-09-15T00:08:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "10000000",
      outAmountAtomic: "1500769",
      priceImpactPct: "0.0015931862644325237928228696",
      routeLabels: ["SolFi V2", "Flux", "Meteora DLMM"],
      status: "quoted"
    }
  },
  {
    mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    symbol: "TSLAx",
    underlyingSymbol: "TSLA",
    name: "Tesla xStock",
    issuer: "Backed Finance",
    tokenProgram: "token-2022",
    decimals: 8,
    assetClass: "tokenized-equity",
    priceSource: "issuer-metadata+jupiter-quote-review",
    liquidityReview: {
      provider: "jupiter-lite",
      checkedAt: "2026-09-15T00:08:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "10000000",
      outAmountAtomic: "2782753",
      priceImpactPct: "0.000167191563958949705759396",
      routeLabels: ["Flux", "PancakeSwap"],
      status: "quoted"
    }
  },
  {
    mint: "XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN",
    symbol: "GOOGLx",
    underlyingSymbol: "GOOGL",
    name: "Alphabet xStock",
    issuer: "Backed Finance",
    tokenProgram: "token-2022",
    decimals: 8,
    assetClass: "tokenized-equity",
    priceSource: "issuer-metadata+jupiter-quote-review",
    liquidityReview: {
      provider: "jupiter-lite",
      checkedAt: "2026-09-15T00:08:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "10000000",
      outAmountAtomic: "2876280",
      priceImpactPct: "0.0018527129204458540585405198",
      routeLabels: ["Quantum", "Whirlpool"],
      status: "quoted"
    }
  },
  {
    mint: USDC_MINT,
    symbol: "USDC",
    underlyingSymbol: "USD",
    name: "USD Coin",
    issuer: "Circle",
    tokenProgram: "spl-token",
    decimals: 6,
    assetClass: "cash",
    priceSource: "stablecoin-parity",
    liquidityReview: {
      provider: "native-cash-leg",
      checkedAt: "2026-09-15T00:08:00Z",
      inputMint: USDC_MINT,
      inputAmountAtomic: "0",
      status: "cash"
    }
  }
] as const satisfies readonly TokenizedEquityAsset[];

export type SupportedAssetMint = (typeof SUPPORTED_TOKENIZED_EQUITIES)[number]["mint"];

export function getSupportedAssetByMint(mint: string): TokenizedEquityAsset | undefined {
  return SUPPORTED_TOKENIZED_EQUITIES.find((asset) => asset.mint === mint);
}
