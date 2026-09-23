import { CASH_ASSETS } from "./asset-providers/cash";
import { JUPITER_STOCK_ASSETS } from "./asset-providers/jupiter-stocks";
import { PRESTOCKS_ASSETS } from "./asset-providers/prestocks";

export {
  ASSET_PROVIDER_GROUPS,
  USDC_MINT,
  type AssetMarketSegment,
  type AssetProviderId,
  type StratInAssetClass,
  type TokenProgram,
  type TokenizedEquityAsset,
} from "./asset-providers/types";

import type { TokenizedEquityAsset } from "./asset-providers/types";

/**
 * Curated execution allowlist.
 *
 * Provider APIs supply discovery metadata, but assets only enter this list after
 * their mint owner, token program, decimals, and Jupiter routing are reviewed.
 * This prevents a remote API change from silently enabling a new executable mint.
 */
export const SUPPORTED_TOKENIZED_EQUITIES = [
  ...JUPITER_STOCK_ASSETS,
  ...PRESTOCKS_ASSETS,
  ...CASH_ASSETS,
] as const satisfies readonly TokenizedEquityAsset[];

/** Assets available when publishing a new strategy or rebalance. */
export const STRATEGY_SELECTABLE_ASSETS: readonly TokenizedEquityAsset[] =
  SUPPORTED_TOKENIZED_EQUITIES.filter(
    (asset) => asset.assetClass === "tokenized-equity",
  );

export type SupportedAssetMint =
  (typeof SUPPORTED_TOKENIZED_EQUITIES)[number]["mint"];

export function getSupportedAssetByMint(
  mint: string,
): TokenizedEquityAsset | undefined {
  return SUPPORTED_TOKENIZED_EQUITIES.find((asset) => asset.mint === mint);
}
