import { appConfig } from "../config";

type JsonRpcResponse<T> = {
  result?: T;
  error?: { message: string };
};

export async function registryRpcRequest<T>(method: string, params: unknown[]) {
  const response = await fetch(appConfig.registryRpcProxyUrl, {
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
      `Registry RPC ${method} expected JSON from ${appConfig.registryRpcProxyUrl}, got ${response.status} ${
        response.statusText || "response"
      } (${contentType || "no content-type"}). Preview: ${body.slice(0, 120)}`
    );
  }

  const payload = (await response.json()) as JsonRpcResponse<T>;

  if (!response.ok || payload.error) {
    throw new Error(`Registry RPC ${method} failed: ${payload.error?.message ?? response.statusText}`);
  }

  if (payload.result === undefined) {
    throw new Error(`Registry RPC ${method} returned no result.`);
  }

  return payload.result;
}

export async function confirmRegistrySignature(signature: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await registryRpcRequest<{
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

  throw new Error("Timed out waiting for registry transaction confirmation.");
}
