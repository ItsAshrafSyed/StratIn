import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

export const STRATEGY_REGISTRY_PROGRAM_ID =
  "3twgH9P4Knu51EqMZb5Fx2CSX1vUkw5Da4GYSUjiNzNs";

export type RegistryNetwork =
  "devnet" | "mainnet-beta" | "testnet" | "localnet";

const GENESIS_HASHES: Partial<Record<RegistryNetwork, readonly string[]>> = {
  devnet: [
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
  ],
  "mainnet-beta": ["5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"],
  testnet: ["4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2Ns"],
};

const STRATEGY_ACCOUNT_LENGTH = 110;
const VERSION_ACCOUNT_LENGTH = 117;

type RpcAccount = {
  data?: [string, string];
  executable?: boolean;
  owner?: string;
};

export type RegistryVerificationInput = {
  rpcUrl: string;
  network: RegistryNetwork;
  creatorWallet: string;
  strategyIdHex: string;
  strategyPda: string;
  versionPda: string;
  expectedVersion: number;
  expectedAllocationHash: string;
  expectedCurrentVersion: number;
  expectedCurrentAllocationHash: string;
};

export type RegistryVerificationResult = {
  network: RegistryNetwork;
  strategyPda: string;
  versionPda: string;
  version: number;
  allocationHash: string;
};

export async function verifyRegistryCommitment(
  input: RegistryVerificationInput,
): Promise<RegistryVerificationResult> {
  assertHex(input.strategyIdHex, 16, "strategy ID");
  assertHex(input.expectedAllocationHash, 32, "allocation hash");
  assertHex(input.expectedCurrentAllocationHash, 32, "current allocation hash");
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("Expected registry version must be a positive integer.");
  }
  if (
    !Number.isInteger(input.expectedCurrentVersion) ||
    input.expectedCurrentVersion < input.expectedVersion
  ) {
    throw new Error("Expected current registry version is invalid.");
  }

  await assertRegistryNetwork(input.rpcUrl, input.network);
  const accounts = await rpcRequest<{ value?: (RpcAccount | null)[] }>(
    input.rpcUrl,
    "getMultipleAccounts",
    [
      [input.strategyPda, input.versionPda],
      { encoding: "base64", commitment: "confirmed" },
    ],
  );
  const [strategyAccount, versionAccount] = accounts.value ?? [];

  const strategyBytes = validateAccountEnvelope(
    strategyAccount,
    STRATEGY_ACCOUNT_LENGTH,
    "StrategyAccount",
  );
  const versionBytes = validateAccountEnvelope(
    versionAccount,
    VERSION_ACCOUNT_LENGTH,
    "StrategyVersionAccount",
  );

  await assertDiscriminator(strategyBytes, "StrategyAccount");
  await assertDiscriminator(versionBytes, "StrategyVersionAccount");

  const creator = address(input.creatorWallet);
  const strategyPda = address(input.strategyPda);
  const versionPda = address(input.versionPda);
  const addressEncoder = getAddressEncoder();
  const creatorBytes = addressEncoder.encode(creator);
  const strategyPdaBytes = addressEncoder.encode(strategyPda);
  const [derivedStrategyPda] = await getProgramDerivedAddress({
    programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("strategy"),
      creatorBytes,
      hexToBytes(input.strategyIdHex),
    ],
  });
  if (derivedStrategyPda !== strategyPda) {
    throw new Error(
      "Strategy PDA does not match the expected creator and strategy ID.",
    );
  }
  const versionBytesLe = new Uint8Array(4);
  new DataView(versionBytesLe.buffer).setUint32(0, input.expectedVersion, true);
  const [derivedVersionPda] = await getProgramDerivedAddress({
    programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("version"),
      strategyPdaBytes,
      versionBytesLe,
    ],
  });
  if (derivedVersionPda !== versionPda) {
    throw new Error(
      "Version PDA does not match the expected strategy and version.",
    );
  }

  assertBytesEqual(
    strategyBytes.slice(8, 40),
    creatorBytes,
    "Strategy creator does not match.",
  );
  assertBytesEqual(
    strategyBytes.slice(40, 56),
    hexToBytes(input.strategyIdHex),
    "Strategy ID does not match.",
  );
  const strategyView = new DataView(
    strategyBytes.buffer,
    strategyBytes.byteOffset,
    strategyBytes.byteLength,
  );
  if (strategyView.getUint32(56, true) !== input.expectedCurrentVersion) {
    throw new Error(
      "On-chain current strategy version does not match the database.",
    );
  }
  assertBytesEqual(
    strategyBytes.slice(60, 92),
    hexToBytes(input.expectedCurrentAllocationHash),
    "On-chain current allocation hash does not match the database.",
  );
  if (strategyBytes[92] > 1) {
    throw new Error("Strategy account contains an invalid status value.");
  }

  assertBytesEqual(
    versionBytes.slice(8, 40),
    strategyPdaBytes,
    "Version strategy identity does not match.",
  );
  assertBytesEqual(
    versionBytes.slice(40, 72),
    creatorBytes,
    "Version creator does not match.",
  );
  const versionView = new DataView(
    versionBytes.buffer,
    versionBytes.byteOffset,
    versionBytes.byteLength,
  );
  if (versionView.getUint32(72, true) !== input.expectedVersion) {
    throw new Error("On-chain strategy version number does not match.");
  }
  assertBytesEqual(
    versionBytes.slice(76, 108),
    hexToBytes(input.expectedAllocationHash),
    "On-chain version allocation hash does not match the database.",
  );

  return {
    network: input.network,
    strategyPda: input.strategyPda,
    versionPda: input.versionPda,
    version: input.expectedVersion,
    allocationHash: input.expectedAllocationHash,
  };
}

async function assertRegistryNetwork(rpcUrl: string, network: RegistryNetwork) {
  const expectedGenesisHashes = GENESIS_HASHES[network];
  const actualGenesisHash = await rpcRequest<string>(
    rpcUrl,
    "getGenesisHash",
    [],
  );
  if (
    expectedGenesisHashes &&
    !expectedGenesisHashes.includes(actualGenesisHash)
  ) {
    throw new Error(`Registry RPC is not connected to configured ${network}.`);
  }
  if (
    network === "localnet" &&
    Object.values(GENESIS_HASHES).some((hashes) =>
      hashes?.includes(actualGenesisHash),
    )
  ) {
    throw new Error(
      "Registry RPC configured as localnet points to a public Solana cluster.",
    );
  }
}

function validateAccountEnvelope(
  account: RpcAccount | null | undefined,
  exactLength: number,
  type: string,
) {
  if (!account) {
    throw new Error(
      `${type} does not exist on the configured registry cluster.`,
    );
  }
  if (account.owner !== STRATEGY_REGISTRY_PROGRAM_ID) {
    throw new Error(`${type} is not owned by the StratIn registry program.`);
  }
  if (account.executable) {
    throw new Error(`${type} must be a non-executable data account.`);
  }
  if (!account.data || account.data[1] !== "base64") {
    throw new Error(`${type} did not return base64 account data.`);
  }

  const bytes = Uint8Array.from(atob(account.data[0]), (character) =>
    character.charCodeAt(0),
  );
  if (bytes.length !== exactLength) {
    throw new Error(
      `${type} has invalid data length ${bytes.length}; expected ${exactLength}.`,
    );
  }
  return bytes;
}

async function assertDiscriminator(bytes: Uint8Array, accountType: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`account:${accountType}`),
    ),
  );
  assertBytesEqual(
    bytes.slice(0, 8),
    digest.slice(0, 8),
    `${accountType} discriminator does not match.`,
  );
}

async function rpcRequest<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method,
      params,
    }),
  });
  const payload = (await response.json()) as {
    result?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(
      payload.error?.message ??
        `Registry RPC ${method} failed with status ${response.status}.`,
    );
  }
  return payload.result;
}

function assertHex(value: string, bytes: number, label: string) {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(
      `Expected ${label} must be ${bytes} bytes of lowercase hexadecimal.`,
    );
  }
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function assertBytesEqual(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  message: string,
) {
  if (actual.length !== expected.length) {
    throw new Error(message);
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(message);
    }
  }
}
