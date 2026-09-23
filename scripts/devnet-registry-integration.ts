import * as anchor from "@coral-xyz/anchor";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../apps/api/src/index";
import { getDb } from "../apps/api/src/db";
import {
  createStrategy,
  getStrategy,
  publishRebalance,
} from "../apps/api/src/repository";
import {
  hashStrategyAllocation,
  SUPPORTED_TOKENIZED_EQUITIES,
  USDC_MINT,
  type StrategyAllocationDto,
} from "../packages/shared/src";
import type { PriceProvider } from "../packages/strategy-engine/src";

const PROGRAM_ID = new anchor.web3.PublicKey(
  "2zDw6KYfMJRMVfNvShy5XHM1t6tvvTYEoDeLZ87VTEFX",
);
const DEVNET_RPC_URL = "https://api.devnet.solana.com";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const priceProvider: PriceProvider = {
  async getUsdValue(_assetMint, quantityAtomic) {
    return quantityAtomic;
  },
  async getQuantityForUsdValue(_assetMint, usdcAmountAtomic) {
    return usdcAmountAtomic;
  },
};

function assetMint(symbol: string) {
  const asset = SUPPORTED_TOKENIZED_EQUITIES.find(
    (item) => item.symbol === symbol,
  );
  if (!asset) {
    throw new Error(`Missing supported asset ${symbol}`);
  }
  return asset.mint;
}

function hexToBytes(hex: string) {
  const bytes = new Array<number>();
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(Number.parseInt(hex.slice(index, index + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: ArrayLike<number>) {
  return [...Array.from(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function strategyPda(creator: anchor.web3.PublicKey, strategyId: number[]) {
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("strategy"), creator.toBuffer(), Buffer.from(strategyId)],
    PROGRAM_ID,
  )[0];
}

function versionPda(strategy: anchor.web3.PublicKey, version: number) {
  const versionBytes = Buffer.alloc(4);
  versionBytes.writeUInt32LE(version, 0);
  return anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("version"), strategy.toBuffer(), versionBytes],
    PROGRAM_ID,
  )[0];
}

function resolveSignerPath() {
  const configuredPath = process.env.STRATIN_REGISTRY_SIGNER_PATH?.trim();
  if (configuredPath) {
    return configuredPath.startsWith("~/")
      ? resolve(homedir(), configuredPath.slice(2))
      : configuredPath;
  }

  try {
    const output = execFileSync("solana", ["config", "get", "keypair"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/^Keypair Path:\s*(.+)$/m);
    if (match?.[1]) {
      const cliPath = match[1].trim();
      return cliPath.startsWith("~/")
        ? resolve(homedir(), cliPath.slice(2))
        : cliPath;
    }
  } catch {
    // The configuration error below explains both supported options.
  }

  throw new Error(
    "Registry signer path is unavailable. Set STRATIN_REGISTRY_SIGNER_PATH or configure the Solana CLI keypair path.",
  );
}

function loadProgram() {
  const signerPath = resolveSignerPath();
  const secret = JSON.parse(readFileSync(signerPath, "utf8")) as number[];
  const creator = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new anchor.web3.Connection(DEVNET_RPC_URL, "confirmed");
  const wallet = new anchor.Wallet(creator);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  const idl = JSON.parse(
    readFileSync(
      resolve(REPO_ROOT, "target/idl/strategy_registry.json"),
      "utf8",
    ),
  ) as anchor.Idl;
  return {
    creator,
    connection,
    program: new anchor.Program(idl, provider),
  };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const { creator, program } = loadProgram();
  const db = getDb({ DATABASE_URL: databaseUrl });

  const allocationV1: StrategyAllocationDto[] = [
    { assetMint: assetMint("GOOGLx"), weightBps: 3000 },
    { assetMint: assetMint("TSLAx"), weightBps: 2500 },
    { assetMint: assetMint("AAPLx"), weightBps: 2000 },
    { assetMint: assetMint("METAx"), weightBps: 1500 },
    { assetMint: USDC_MINT, weightBps: 1000 },
  ];
  const allocationV2: StrategyAllocationDto[] = [
    { assetMint: assetMint("GOOGLx"), weightBps: 2000 },
    { assetMint: assetMint("TSLAx"), weightBps: 2000 },
    { assetMint: assetMint("AAPLx"), weightBps: 3000 },
    { assetMint: assetMint("METAx"), weightBps: 2000 },
    { assetMint: USDC_MINT, weightBps: 1000 },
  ];

  const strategyId = [
    ...anchor.web3.Keypair.generate().publicKey.toBytes(),
  ].slice(0, 16);
  const registryStrategyPda = strategyPda(creator.publicKey, strategyId);
  const registryVersionOnePda = versionPda(registryStrategyPda, 1);
  const hashV1 = await hashStrategyAllocation(allocationV1);

  const createTx = await program.methods
    .createStrategy(strategyId, hexToBytes(hashV1))
    .accounts({
      creator: creator.publicKey,
      strategy: registryStrategyPda,
      version: registryVersionOnePda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  const strategy = await createStrategy(
    db,
    {
      creatorWallet: creator.publicKey.toBase58(),
      name: `Devnet Registry Test ${new Date().toISOString()}`,
      description: "Devnet registry integration test strategy.",
      allocations: allocationV1,
      registryCommitment: {
        strategyIdHex: bytesToHex(strategyId),
        allocationHash: hashV1,
        transactionSignature: createTx,
        strategyPda: registryStrategyPda.toBase58(),
        versionPda: registryVersionOnePda.toBase58(),
      },
    },
    priceProvider,
  );

  const hashV2 = await hashStrategyAllocation(allocationV2);
  const registryVersionTwoPda = versionPda(registryStrategyPda, 2);
  const rebalanceTx = await program.methods
    .publishRebalance(hexToBytes(hashV2))
    .accounts({
      creator: creator.publicKey,
      strategy: registryStrategyPda,
      version: registryVersionTwoPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  const updatedStrategy = await publishRebalance(
    db,
    strategy.id,
    {
      creatorWallet: creator.publicKey.toBase58(),
      allocations: allocationV2,
      registryCommitment: {
        allocationHash: hashV2,
        transactionSignature: rebalanceTx,
        strategyPda: registryStrategyPda.toBase58(),
        versionPda: registryVersionTwoPda.toBase58(),
      },
    },
    priceProvider,
  );

  const chainStrategy =
    await program.account.strategyAccount.fetch(registryStrategyPda);
  const chainVersionOne = await program.account.strategyVersionAccount.fetch(
    registryVersionOnePda,
  );
  const chainVersionTwo = await program.account.strategyVersionAccount.fetch(
    registryVersionTwoPda,
  );
  const dbStrategy = await getStrategy(db, strategy.id);
  const verificationResponse = await app.request(
    `/strategies/${strategy.id}/registry/verify`,
    {},
    {
      DATABASE_URL: databaseUrl,
      REGISTRY_SOLANA_RPC_URL: DEVNET_RPC_URL,
    },
  );
  const endpointVerification = await verificationResponse.json();
  const stranger = anchor.web3.Keypair.generate();
  const fundStrangerTx = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: creator.publicKey,
      toPubkey: stranger.publicKey,
      lamports: 50_000_000,
    }),
  );
  await program.provider.sendAndConfirm?.(fundStrangerTx, [creator]);

  let unauthorizedResult: { rejected: boolean; message: string };
  try {
    await program.methods
      .publishRebalance(hexToBytes(hashV2))
      .accounts({
        creator: stranger.publicKey,
        strategy: registryStrategyPda,
        version: versionPda(registryStrategyPda, 3),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([stranger])
      .rpc();
    unauthorizedResult = {
      rejected: false,
      message: "Unexpectedly accepted unauthorized rebalance.",
    };
  } catch (error) {
    unauthorizedResult = {
      rejected: true,
      message: String(error).slice(0, 500),
    };
  }
  const chainStrategyAfterUnauthorized =
    await program.account.strategyAccount.fetch(registryStrategyPda);

  const chainHashV1 = bytesToHex(chainVersionOne.allocationHash);
  const chainHashV2 = bytesToHex(chainVersionTwo.allocationHash);

  console.log(
    JSON.stringify(
      {
        network: "devnet",
        programId: PROGRAM_ID.toBase58(),
        creator: creator.publicKey.toBase58(),
        strategyId: strategy.id,
        registryStrategyIdHex: bytesToHex(strategyId),
        registryStrategyPda: registryStrategyPda.toBase58(),
        currentVersion: updatedStrategy.currentVersion,
        onChainCurrentVersion: chainStrategy.currentVersion,
        currentAllocationHash: bytesToHex(chainStrategy.currentAllocationHash),
        version1: {
          allocation: allocationV1,
          hash: hashV1,
          transaction: createTx,
          pda: registryVersionOnePda.toBase58(),
          chainHash: chainHashV1,
          verified: hashV1 === chainHashV1,
        },
        version2: {
          allocation: allocationV2,
          hash: hashV2,
          transaction: rebalanceTx,
          pda: registryVersionTwoPda.toBase58(),
          chainHash: chainHashV2,
          verified: hashV2 === chainHashV2,
        },
        dbVersions: dbStrategy?.versions?.map((version) => ({
          version: version.version,
          hash: version.allocationHash,
          transaction: version.solanaTransactionSignature,
          pda: version.registryVersionPda,
          status: version.verificationStatus,
        })),
        endpointVerification,
        unauthorizedResult,
        onChainCurrentVersionAfterUnauthorized:
          chainStrategyAfterUnauthorized.currentVersion,
        v1StillVerifiesAfterV2: hashV1 === chainHashV1,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
