import { appConfig } from "../config";
import { formatAtomic } from "./format";
import { jsonRpcRequest } from "./json-rpc";

export type TokenBalance = {
  mint: string;
  amountAtomic: bigint;
  decimals: number;
  uiAmountString: string;
};

const TOKEN_PROGRAM_ADDRESSES = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
] as const;

type ParsedTokenAccount = {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            amount: string;
            decimals: number;
            uiAmountString: string;
          };
        };
      };
    };
  };
};

export async function rpcRequest<T>(method: string, params: unknown[]) {
  return jsonRpcRequest<T>({
    url: appConfig.solanaRpcProxyUrl,
    label: "RPC",
    method,
    params,
  });
}

export async function fetchSolBalanceLamports(owner: string) {
  const result = await rpcRequest<{ value: number }>("getBalance", [
    owner,
    { commitment: "confirmed" },
  ]);
  return BigInt(result.value);
}

export async function fetchTokenBalances(
  owner: string,
  mints: readonly string[],
) {
  const balances = new Map<string, TokenBalance>();
  const requestedMints = new Set(mints);

  for (const programId of TOKEN_PROGRAM_ADDRESSES) {
    const result = await rpcRequest<{
      value: ParsedTokenAccount[];
    }>("getTokenAccountsByOwner", [
      owner,
      { programId },
      { encoding: "jsonParsed", commitment: "confirmed" },
    ]);

    for (const account of result.value) {
      const { mint, tokenAmount } = account.account.data.parsed.info;

      if (!requestedMints.has(mint)) {
        continue;
      }

      const existing = balances.get(mint)?.amountAtomic ?? 0n;
      const amountAtomic = existing + BigInt(tokenAmount.amount);
      balances.set(mint, {
        mint,
        amountAtomic,
        decimals: tokenAmount.decimals,
        uiAmountString: formatAtomic(amountAtomic, tokenAmount.decimals),
      });
    }
  }

  return balances;
}

export async function confirmSignature(signature: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await rpcRequest<{
      value: ({ confirmationStatus?: string; err: unknown } | null)[];
    }>("getSignatureStatuses", [
      [signature],
      { searchTransactionHistory: true },
    ]);
    const status = result.value[0];

    if (status?.err) {
      throw new Error(JSON.stringify(status.err));
    }

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Timed out waiting for transaction confirmation.");
}
