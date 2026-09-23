export type TokenProgram = "spl-token" | "token-2022";

export type StratInAssetClass = "cash" | "tokenized-equity";

export type AssetProviderId = "public-stocks" | "prestocks" | "circle";

export type AssetMarketSegment = "public-equity" | "private-company" | "cash";

export interface TokenizedEquityAsset {
  mint: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  issuer: string;
  providerId: AssetProviderId;
  marketSegment: AssetMarketSegment;
  metadataSource?: string;
  iconUrl?: string;
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

export const ASSET_PROVIDER_GROUPS = [
  {
    id: "public-stocks",
    label: "Stocks",
    description: "Tokenized public equities",
  },
  {
    id: "prestocks",
    label: "PreStocks",
    description: "Private-company exposure",
  },
  {
    id: "circle",
    label: "Cash",
    description: "Stablecoin allocation",
  },
] as const satisfies readonly {
  id: AssetProviderId;
  label: string;
  description: string;
}[];
