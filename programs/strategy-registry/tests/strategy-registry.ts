import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import { assert } from "chai";

describe("strategy-registry", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.strategyRegistry as Program;
  const creator = anchor.web3.Keypair.generate();
  const stranger = anchor.web3.Keypair.generate();
  const strategyId = [
    ...anchor.web3.Keypair.generate().publicKey.toBytes(),
  ].slice(0, 16);
  const hashV1 = new Array(32).fill(1);
  const hashV2 = new Array(32).fill(2);

  function strategyPda() {
    return anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("strategy"),
        creator.publicKey.toBuffer(),
        Buffer.from(strategyId),
      ],
      program.programId,
    )[0];
  }

  function versionPda(version: number) {
    const versionBytes = Buffer.alloc(4);
    versionBytes.writeUInt32LE(version, 0);
    return anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("version"), strategyPda().toBuffer(), versionBytes],
      program.programId,
    )[0];
  }

  before(async () => {
    const connection = anchor.getProvider().connection;
    for (const wallet of [creator, stranger]) {
      const sig = await connection.requestAirdrop(
        wallet.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("strategist creates strategy version 1", async () => {
    await program.methods
      .createStrategy(strategyId, hashV1)
      .accounts({
        creator: creator.publicKey,
        strategy: strategyPda(),
        version: versionPda(1),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const strategy = await program.account.strategyAccount.fetch(strategyPda());
    const version = await program.account.strategyVersionAccount.fetch(
      versionPda(1),
    );

    assert.strictEqual(strategy.currentVersion, 1);
    assert.deepStrictEqual([...strategy.currentAllocationHash], hashV1);
    assert.deepStrictEqual([...version.allocationHash], hashV1);
  });

  it("rejects unauthorized rebalance", async () => {
    try {
      await program.methods
        .publishRebalance(hashV2)
        .accounts({
          creator: stranger.publicKey,
          strategy: strategyPda(),
          version: versionPda(2),
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected unauthorized rebalance to fail");
    } catch (error) {
      assert.include(String(error), "Unauthorized");
    }
  });

  it("strategist publishes version 2 and leaves version 1 verifiable", async () => {
    await program.methods
      .publishRebalance(hashV2)
      .accounts({
        creator: creator.publicKey,
        strategy: strategyPda(),
        version: versionPda(2),
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const strategy = await program.account.strategyAccount.fetch(strategyPda());
    const versionOne = await program.account.strategyVersionAccount.fetch(
      versionPda(1),
    );
    const versionTwo = await program.account.strategyVersionAccount.fetch(
      versionPda(2),
    );

    assert.strictEqual(strategy.currentVersion, 2);
    assert.deepStrictEqual([...versionOne.allocationHash], hashV1);
    assert.deepStrictEqual([...versionTwo.allocationHash], hashV2);
  });

  it("rejects unauthorized close", async () => {
    try {
      await program.methods
        .closeStrategy()
        .accounts({
          creator: stranger.publicKey,
          strategy: strategyPda(),
        })
        .signers([stranger])
        .rpc();
      assert.fail("Expected unauthorized close to fail");
    } catch (error) {
      assert.include(String(error), "Unauthorized");
    }
  });

  it("strategist can close strategy", async () => {
    await program.methods
      .closeStrategy()
      .accounts({
        creator: creator.publicKey,
        strategy: strategyPda(),
      })
      .signers([creator])
      .rpc();

    const strategy = await program.account.strategyAccount.fetch(strategyPda());
    assert.isDefined(strategy.status.closed);
  });
});
