import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  getProgramDerivedAddress,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction
} from "@solana/kit";
import { USDC_MINT } from "@stratin/shared";
import { rpcRequest } from "./solana-rpc";

const SPL_TOKEN_PROGRAM_ADDRESS = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
const USDC_DECIMALS = 6;

type LatestBlockhashResult = {
  value: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
};

export type FeeTransferTarget = {
  recipientWallet: string;
  amountAtomic: bigint;
};

export async function buildUsdcFeeTransferTransaction({
  payerWallet,
  targets
}: {
  payerWallet: string;
  targets: readonly FeeTransferTarget[];
}) {
  const payer = address(payerWallet);
  const positiveTargets = targets.filter((target) => target.amountAtomic > 0n);

  if (positiveTargets.length === 0) {
    return null;
  }

  const sourceAta = await getAssociatedTokenAddress(payer, address(USDC_MINT));
  const instructions: Instruction[] = [];

  for (const target of positiveTargets) {
    const owner = address(target.recipientWallet);
    const destinationAta = await getAssociatedTokenAddress(owner, address(USDC_MINT));
    instructions.push(getCreateAssociatedTokenAccountIdempotentInstruction({ payer, owner, mint: address(USDC_MINT), ata: destinationAta }));
    instructions.push(
      getTransferCheckedInstruction({
        source: sourceAta,
        mint: address(USDC_MINT),
        destination: destinationAta,
        owner: payer,
        amount: target.amountAtomic,
        decimals: USDC_DECIMALS
      })
    );
  }

  const latestBlockhash = await rpcRequest<LatestBlockhashResult["value"]>("getLatestBlockhash", [
    { commitment: "confirmed" }
  ]);
  const message = appendTransactionMessageInstructions(
    instructions,
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: latestBlockhash.blockhash as Blockhash,
        lastValidBlockHeight: BigInt(latestBlockhash.lastValidBlockHeight)
      },
      setTransactionMessageFeePayer(payer, createTransactionMessage({ version: 0 }))
    )
  );

  return compileTransaction(message);
}

async function getAssociatedTokenAddress(owner: Address, mint: Address) {
  const addressEncoder = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [addressEncoder.encode(owner), addressEncoder.encode(SPL_TOKEN_PROGRAM_ADDRESS), addressEncoder.encode(mint)]
  });
  return ata;
}

function getCreateAssociatedTokenAccountIdempotentInstruction({
  payer,
  ata,
  owner,
  mint
}: {
  payer: Address;
  ata: Address;
  owner: Address;
  mint: Address;
}): Instruction {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: ata, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: SPL_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY }
    ],
    data: new Uint8Array([1])
  };
}

function getTransferCheckedInstruction({
  source,
  mint,
  destination,
  owner,
  amount,
  decimals
}: {
  source: Address;
  mint: Address;
  destination: Address;
  owner: Address;
  amount: bigint;
  decimals: number;
}): Instruction {
  const data = new Uint8Array(10);
  data[0] = 12;
  const view = new DataView(data.buffer);
  view.setBigUint64(1, amount, true);
  data[9] = decimals;

  return {
    programAddress: SPL_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: source, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: destination, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY_SIGNER }
    ],
    data
  };
}
