import { afterEach, describe, expect, it, vi } from "vitest";
import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import {
  STRATEGY_REGISTRY_PROGRAM_ID,
  verifyRegistryCommitment,
} from "./registry-verification";

const CREATOR = "11111111111111111111111111111111";
const STRATEGY_ID_HEX = "000102030405060708090a0b0c0d0e0f";
const HASH = "11".repeat(32);

afterEach(() => vi.restoreAllMocks());

describe("registry verification", () => {
  it("validates cluster, ownership, account types, identities, versions, and hashes", async () => {
    const fixture = await buildFixture();
    mockRpc(fixture.accounts);

    await expect(verify(fixture)).resolves.toMatchObject({
      network: "devnet",
      strategyPda: fixture.strategyPda,
      versionPda: fixture.versionPda,
      version: 1,
      allocationHash: HASH,
    });
  });

  it("accepts the current devnet genesis hash", async () => {
    const fixture = await buildFixture();
    mockRpc(fixture.accounts, "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG");

    await expect(verify(fixture)).resolves.toMatchObject({
      network: "devnet",
      version: 1,
    });
  });

  it("rejects an account not owned by the registry program", async () => {
    const fixture = await buildFixture();
    fixture.accounts[1] = { ...fixture.accounts[1], owner: CREATOR };
    mockRpc(fixture.accounts);

    await expect(verify(fixture)).rejects.toThrow(
      "not owned by the StratIn registry program",
    );
  });

  it("rejects structurally invalid data before reading fields", async () => {
    const fixture = await buildFixture();
    fixture.accounts[0] = {
      ...fixture.accounts[0],
      data: [toBase64(new Uint8Array(12)), "base64"],
    };
    mockRpc(fixture.accounts);

    await expect(verify(fixture)).rejects.toThrow("invalid data length");
  });
});

function verify(fixture: Awaited<ReturnType<typeof buildFixture>>) {
  return verifyRegistryCommitment({
    rpcUrl: "https://registry.example",
    network: "devnet",
    creatorWallet: CREATOR,
    strategyIdHex: STRATEGY_ID_HEX,
    strategyPda: fixture.strategyPda,
    versionPda: fixture.versionPda,
    expectedVersion: 1,
    expectedAllocationHash: HASH,
    expectedCurrentVersion: 1,
    expectedCurrentAllocationHash: HASH,
  });
}

async function buildFixture() {
  const encoder = getAddressEncoder();
  const [strategyPda] = await getProgramDerivedAddress({
    programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("strategy"),
      encoder.encode(address(CREATOR)),
      hexToBytes(STRATEGY_ID_HEX),
    ],
  });
  const versionBytesLe = new Uint8Array(4);
  new DataView(versionBytesLe.buffer).setUint32(0, 1, true);
  const [versionPda] = await getProgramDerivedAddress({
    programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("version"),
      encoder.encode(strategyPda),
      versionBytesLe,
    ],
  });
  const strategy = new Uint8Array(110);
  strategy.set(await discriminator("StrategyAccount"), 0);
  strategy.set(hexToBytes(STRATEGY_ID_HEX), 40);
  new DataView(strategy.buffer).setUint32(56, 1, true);
  strategy.set(hexToBytes(HASH), 60);

  const version = new Uint8Array(117);
  version.set(await discriminator("StrategyVersionAccount"), 0);
  version.set(encoder.encode(strategyPda), 8);
  new DataView(version.buffer).setUint32(72, 1, true);
  version.set(hexToBytes(HASH), 76);

  return {
    strategyPda,
    versionPda,
    accounts: [account(strategy), account(version)],
  };
}

function account(bytes: Uint8Array) {
  return {
    owner: STRATEGY_REGISTRY_PROGRAM_ID,
    executable: false,
    data: [toBase64(bytes), "base64"] as [string, string],
  };
}

function mockRpc(
  accounts: Awaited<ReturnType<typeof buildFixture>>["accounts"],
  genesisHash = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { method: string };
    const result =
      request.method === "getGenesisHash" ? genesisHash : { value: accounts };
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: "test", result }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  });
}

async function discriminator(name: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`account:${name}`),
  );
  return new Uint8Array(digest).slice(0, 8);
}

function hexToBytes(hex: string) {
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
