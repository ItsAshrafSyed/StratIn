import type { Env } from "./db";

const HELIUS_REGISTRY_RPC_BY_NETWORK = {
  devnet: "https://devnet.helius-rpc.com/",
  "mainnet-beta": "https://mainnet.helius-rpc.com/",
} as const;

export function getRegistryRpcUrl(env: Env) {
  const configuredUrl = env.REGISTRY_SOLANA_RPC_URL?.trim();
  const apiKey =
    env.REGISTRY_HELIUS_API_KEY?.trim() || env.HELIUS_API_KEY?.trim();
  const configuredBaseUrl = env.REGISTRY_HELIUS_RPC_BASE_URL?.trim();
  const defaultBaseUrl =
    HELIUS_REGISTRY_RPC_BY_NETWORK[
      env.REGISTRY_NETWORK === "mainnet-beta" ? "mainnet-beta" : "devnet"
    ];

  if (apiKey && (configuredBaseUrl || isPublicSolanaRpc(configuredUrl))) {
    const endpoint = new URL(configuredBaseUrl || defaultBaseUrl);
    endpoint.searchParams.set("api-key", apiKey);
    return endpoint.toString();
  }

  if (configuredUrl) {
    return configuredUrl;
  }

  if (apiKey) {
    const endpoint = new URL(defaultBaseUrl);
    endpoint.searchParams.set("api-key", apiKey);
    return endpoint.toString();
  }

  throw new Error("REGISTRY_SOLANA_RPC_URL is not configured.");
}

function isPublicSolanaRpc(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "api.devnet.solana.com" ||
      hostname === "api.mainnet-beta.solana.com" ||
      hostname === "api.testnet.solana.com"
    );
  } catch {
    return false;
  }
}
