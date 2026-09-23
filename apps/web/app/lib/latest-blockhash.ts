import type { Blockhash } from "@solana/kit";

type LatestBlockhashRpcResult = {
  value?: {
    blockhash?: unknown;
    lastValidBlockHeight?: unknown;
  };
};

export function parseLatestBlockhashRpcResult(
  result: LatestBlockhashRpcResult,
) {
  const blockhash = result.value?.blockhash;
  const lastValidBlockHeight = result.value?.lastValidBlockHeight;

  if (typeof blockhash !== "string" || blockhash.length === 0) {
    throw new Error("Solana RPC returned an invalid latest blockhash.");
  }

  if (
    typeof lastValidBlockHeight !== "number" ||
    !Number.isSafeInteger(lastValidBlockHeight) ||
    lastValidBlockHeight < 0
  ) {
    throw new Error("Solana RPC returned an invalid last valid block height.");
  }

  return {
    blockhash: blockhash as Blockhash,
    lastValidBlockHeight: BigInt(lastValidBlockHeight),
  };
}
