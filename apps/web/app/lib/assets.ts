import { SUPPORTED_TOKENIZED_EQUITIES } from "@stratin/shared";

export function getAsset(mint: string) {
  return SUPPORTED_TOKENIZED_EQUITIES.find((asset) => asset.mint === mint);
}

export function allocationSymbols(
  allocations: readonly { assetMint: string }[],
) {
  const symbols = allocations.map(
    (allocation) => getAsset(allocation.assetMint)?.symbol ?? "Unknown",
  );
  return symbols.length > 3
    ? `${symbols.slice(0, 3).join(" • ")} • +${symbols.length - 3}`
    : symbols.join(" • ");
}
