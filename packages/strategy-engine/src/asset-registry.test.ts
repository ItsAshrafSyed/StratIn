import { describe, expect, it } from "vitest";
import {
  ASSET_PROVIDER_GROUPS,
  STRATEGY_SELECTABLE_ASSETS,
  SUPPORTED_TOKENIZED_EQUITIES,
  getSupportedAssetByMint,
} from "@stratin/shared";

describe("supported asset registry", () => {
  it("keeps every supported mint unique and assigned to a visible provider group", () => {
    const mints = SUPPORTED_TOKENIZED_EQUITIES.map((asset) => asset.mint);
    const providerIds = new Set(ASSET_PROVIDER_GROUPS.map((group) => group.id));

    expect(new Set(mints).size).toBe(mints.length);
    expect(
      SUPPORTED_TOKENIZED_EQUITIES.every((asset) =>
        providerIds.has(asset.providerId),
      ),
    ).toBe(true);
  });

  it("includes the reviewed PreStocks Token-2022 mints", () => {
    const privateCompanyAssets = SUPPORTED_TOKENIZED_EQUITIES.filter(
      (asset) => asset.providerId === "prestocks",
    );

    expect(privateCompanyAssets).toHaveLength(8);
    expect(
      privateCompanyAssets.every(
        (asset) =>
          asset.marketSegment === "private-company" &&
          asset.tokenProgram === "token-2022" &&
          asset.decimals === 9 &&
          getSupportedAssetByMint(asset.mint)?.mint === asset.mint,
      ),
    ).toBe(true);
  });

  it("includes the reviewed Jupiter-discovered public-stock mints", () => {
    const publicStocks = STRATEGY_SELECTABLE_ASSETS.filter(
      (asset) => asset.providerId === "public-stocks",
    );

    expect(publicStocks).toHaveLength(43);
    expect(
      publicStocks.every(
        (asset) =>
          asset.marketSegment === "public-equity" &&
          asset.tokenProgram === "token-2022" &&
          (asset.decimals === 6 || asset.decimals === 8) &&
          asset.metadataSource?.includes("api.jup.ag"),
      ),
    ).toBe(true);
    expect(
      publicStocks.every(
        (asset) =>
          asset.liquidityReview?.provider === "jupiter-platform" &&
          asset.liquidityReview.status === "quoted",
      ),
    ).toBe(true);
  });

  it("keeps USDC available for settlement but out of new strategy choices", () => {
    expect(
      SUPPORTED_TOKENIZED_EQUITIES.some((asset) => asset.symbol === "USDC"),
    ).toBe(true);
    expect(
      STRATEGY_SELECTABLE_ASSETS.some((asset) => asset.symbol === "USDC"),
    ).toBe(false);
  });
});
