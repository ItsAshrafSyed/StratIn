import { describe, expect, it } from "vitest";
import { getRegistryRpcUrl } from "./registry-rpc";

describe("registry RPC selection", () => {
  it("uses a dedicated devnet Helius lane instead of the public endpoint", () => {
    expect(
      getRegistryRpcUrl({
        REGISTRY_NETWORK: "devnet",
        REGISTRY_SOLANA_RPC_URL: "https://api.devnet.solana.com",
        HELIUS_API_KEY: "test-key",
      }),
    ).toBe("https://devnet.helius-rpc.com/?api-key=test-key");
  });

  it("preserves an explicitly configured non-public provider", () => {
    expect(
      getRegistryRpcUrl({
        REGISTRY_NETWORK: "devnet",
        REGISTRY_SOLANA_RPC_URL: "https://rpc.example/devnet",
        HELIUS_API_KEY: "test-key",
      }),
    ).toBe("https://rpc.example/devnet");
  });

  it("fails clearly when no registry provider is configured", () => {
    expect(() => getRegistryRpcUrl({ REGISTRY_NETWORK: "devnet" })).toThrow(
      "REGISTRY_SOLANA_RPC_URL is not configured",
    );
  });
});
