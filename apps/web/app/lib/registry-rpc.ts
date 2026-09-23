import { appConfig } from "../config";
import { jsonRpcRequest } from "./json-rpc";

export async function registryRpcRequest<T>(method: string, params: unknown[]) {
  return jsonRpcRequest<T>({
    url: appConfig.registryRpcProxyUrl,
    label: "Registry RPC",
    method,
    params,
  });
}

export async function confirmRegistrySignature(signature: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await registryRpcRequest<{
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

  throw new Error("Timed out waiting for registry transaction confirmation.");
}
