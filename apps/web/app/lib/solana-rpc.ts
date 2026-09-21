import { appConfig } from "../config";
import { formatAtomic } from "./format";

export type TokenBalance = {
  mint: string;
  amountAtomic: bigint;
  decimals: number;
  uiAmountString: string;
};

type JsonRpcResponse<T> = {
  result?: T;
  error?: { message: string };
};

export async function rpcRequest<T>(method: string, params: unknown[]) {
  const response = await fetch(appConfig.solanaRpcProxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params
    })
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    const body = await response.text();
    throw new Error(
      `RPC ${method} expected JSON from ${appConfig.solanaRpcProxyUrl}, got ${response.status} ${
        response.statusText || "response"
      } (${contentType || "no content-type"}). Preview: ${body.slice(0, 120)}`
    );
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;

  if (!response.ok || payload.error) {
    throw new Error(`RPC ${method} failed: ${payload.error?.message ?? response.statusText}`);
  }

  if (payload.result === undefined) {
    throw new Error(`RPC ${method} returned no result.`);
  }

  return payload.result;
}

export async function fetchSolBalanceLamports(owner: string) {
  const result = await rpcRequest<{ value: number }>("getBalance", [owner, { commitment: "confirmed" }]);
  return BigInt(result.value);
}

export async function fetchTokenBalances(owner: string, mints: readonly string[]) {
  const balances = new Map<string, TokenBalance>();

  for (const requestedMint of mints) {
    const result = await rpcRequest<{
      value: {
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
      }[];
    }>("getTokenAccountsByOwner", [
      owner,
      { mint: requestedMint },
      { encoding: "jsonParsed", commitment: "confirmed" }
    ]);

    for (const account of result.value) {
      const { mint, tokenAmount } = account.account.data.parsed.info;

      if (mint !== requestedMint) {
        continue;
      }

      const existing = balances.get(mint)?.amountAtomic ?? 0n;
      const amountAtomic = existing + BigInt(tokenAmount.amount);
      balances.set(mint, {
        mint,
        amountAtomic,
        decimals: tokenAmount.decimals,
        uiAmountString: formatAtomic(amountAtomic, tokenAmount.decimals)
      });
    }
  }

  return balances;
}

export async function confirmSignature(signature: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await rpcRequest<{
      value: ({ confirmationStatus?: string; err: unknown } | null)[];
    }>("getSignatureStatuses", [[signature], { searchTransactionHistory: true }]);
    const status = result.value[0];

    if (status?.err) {
      throw new Error(JSON.stringify(status.err));
    }

    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Timed out waiting for transaction confirmation.");
}
