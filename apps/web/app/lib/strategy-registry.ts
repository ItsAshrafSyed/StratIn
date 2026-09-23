import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  getProgramDerivedAddress,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import { parseLatestBlockhashRpcResult } from "./latest-blockhash";
import { registryRpcRequest as rpcRequest } from "./registry-rpc";
import { STRATIN_TRANSACTION_VERSION } from "./transaction-version";

export const STRATEGY_REGISTRY_PROGRAM_ID =
  "3twgH9P4Knu51EqMZb5Fx2CSX1vUkw5Da4GYSUjiNzNs";

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
const CREATE_STRATEGY_DISCRIMINATOR = Uint8Array.from([
  152, 160, 107, 148, 245, 190, 127, 224,
]);
const PUBLISH_REBALANCE_DISCRIMINATOR = Uint8Array.from([
  183, 39, 115, 91, 18, 29, 160, 71,
]);
const CLOSE_STRATEGY_DISCRIMINATOR = Uint8Array.from([
  56, 247, 170, 246, 89, 221, 134, 200,
]);

export type RegistryCommitmentBuild = {
  transaction: ReturnType<typeof compileTransaction>;
  strategyIdHex?: string;
  allocationHash: string;
  strategyPda: string;
  versionPda: string;
};

export async function buildCreateStrategyCommitmentTransaction({
  creatorWallet,
  allocationHash,
}: {
  creatorWallet: string;
  allocationHash: string;
}): Promise<RegistryCommitmentBuild> {
  const strategyId = crypto.getRandomValues(new Uint8Array(16));
  const creator = address(creatorWallet);
  const strategyPda = await deriveStrategyPda(creator, strategyId);
  const versionPda = await deriveVersionPda(strategyPda, 1);
  const data = concatBytes(
    CREATE_STRATEGY_DISCRIMINATOR,
    strategyId,
    hexToBytes(allocationHash),
  );

  return {
    allocationHash,
    strategyIdHex: bytesToHex(strategyId),
    strategyPda,
    versionPda,
    transaction: await buildRegistryTransaction({
      feePayer: creator,
      instruction: {
        programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
        accounts: [
          { address: creator, role: AccountRole.WRITABLE_SIGNER },
          { address: address(strategyPda), role: AccountRole.WRITABLE },
          { address: address(versionPda), role: AccountRole.WRITABLE },
          { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        ],
        data,
      },
    }),
  };
}

export async function buildPublishRebalanceCommitmentTransaction({
  creatorWallet,
  allocationHash,
  registryStrategyPda,
  nextVersion,
}: {
  creatorWallet: string;
  allocationHash: string;
  registryStrategyPda: string;
  nextVersion: number;
}): Promise<RegistryCommitmentBuild> {
  const creator = address(creatorWallet);
  const strategyPda = address(registryStrategyPda);
  const versionPda = await deriveVersionPda(strategyPda, nextVersion);

  return {
    allocationHash,
    strategyPda: registryStrategyPda,
    versionPda,
    transaction: await buildRegistryTransaction({
      feePayer: creator,
      instruction: {
        programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
        accounts: [
          { address: creator, role: AccountRole.WRITABLE_SIGNER },
          { address: strategyPda, role: AccountRole.WRITABLE },
          { address: address(versionPda), role: AccountRole.WRITABLE },
          { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
        ],
        data: concatBytes(
          PUBLISH_REBALANCE_DISCRIMINATOR,
          hexToBytes(allocationHash),
        ),
      },
    }),
  };
}

export async function buildCloseStrategyCommitmentTransaction({
  creatorWallet,
  registryStrategyPda,
}: {
  creatorWallet: string;
  registryStrategyPda: string;
}) {
  const creator = address(creatorWallet);
  return buildRegistryTransaction({
    feePayer: creator,
    instruction: {
      programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
      accounts: [
        { address: creator, role: AccountRole.READONLY_SIGNER },
        { address: address(registryStrategyPda), role: AccountRole.WRITABLE },
      ],
      data: CLOSE_STRATEGY_DISCRIMINATOR,
    },
  });
}

async function buildRegistryTransaction({
  feePayer,
  instruction,
}: {
  feePayer: Address;
  instruction: Instruction;
}) {
  const latestBlockhashResult = await rpcRequest<{
    value: {
      blockhash: string;
      lastValidBlockHeight: number;
    };
  }>("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const latestBlockhash = parseLatestBlockhashRpcResult(latestBlockhashResult);
  const message = appendTransactionMessageInstruction(
    instruction,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayer(
        feePayer,
        createTransactionMessage({ version: STRATIN_TRANSACTION_VERSION }),
      ),
    ),
  );
  return compileTransaction(message);
}

export async function deriveStrategyPda(
  creator: Address,
  strategyId: Uint8Array,
) {
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("strategy"),
      encoder.encode(creator),
      strategyId,
    ],
  });
  return pda;
}

export async function deriveVersionPda(strategyPda: Address, version: number) {
  const encoder = getAddressEncoder();
  const versionBytes = new Uint8Array(4);
  new DataView(versionBytes.buffer).setUint32(0, version, true);
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(STRATEGY_REGISTRY_PROGRAM_ID),
    seeds: [
      new TextEncoder().encode("version"),
      encoder.encode(strategyPda),
      versionBytes,
    ],
  });
  return pda;
}

function concatBytes(...chunks: readonly Uint8Array[]) {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have an even length.");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
