const HELIUS_MAINNET_RPC_URL = "https://mainnet.helius-rpc.com/";
const SOLANA_PUBLIC_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

function withApiKey(url: string, apiKey: string) {
  const endpoint = new URL(url);
  endpoint.searchParams.set("api-key", apiKey);
  return endpoint.toString();
}

export function getServerSolanaRpcUrl() {
  if (process.env.SOLANA_RPC_URL) {
    return process.env.SOLANA_RPC_URL;
  }

  if (process.env.HELIUS_API_KEY) {
    return withApiKey(
      process.env.HELIUS_RPC_BASE_URL ?? HELIUS_MAINNET_RPC_URL,
      process.env.HELIUS_API_KEY,
    );
  }

  return SOLANA_PUBLIC_MAINNET_RPC_URL;
}
