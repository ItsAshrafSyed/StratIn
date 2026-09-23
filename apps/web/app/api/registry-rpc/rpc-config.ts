const SOLANA_PUBLIC_MAINNET_RPC_URL = "https://api.mainnet-beta.solana.com";

export function getServerRegistryRpcUrl() {
  return (
    process.env.REGISTRY_SOLANA_RPC_URL ||
    process.env.SOLANA_RPC_URL ||
    SOLANA_PUBLIC_MAINNET_RPC_URL
  );
}
