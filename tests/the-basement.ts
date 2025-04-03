import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TheBasement } from "../target/types/the_basement";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

describe("The Basement Yield Farm", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TheBasement as Program<TheBasement>;
  const wallet = provider.wallet as anchor.Wallet;

  let tokenMint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let yieldFarmAddress: anchor.web3.PublicKey;
  let yieldFarmVault: anchor.web3.PublicKey;
  let userDepositAddress: anchor.web3.PublicKey;

  const binsCount = 3; // Number of bin types (large, medium, small)

  before(async () => {
    // Create a new token mint
    tokenMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      null,
      9 // 9 decimals like SOL
    );

    // Create a token account for the user
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      tokenMint,
      wallet.publicKey
    );

    // Mint some tokens to the user
    await mintTo(
      provider.connection,
      wallet.payer,
      tokenMint,
      userTokenAccount,
      wallet.publicKey,
      1000000000000 // 1000 tokens with 9 decimals
    );

    // Find PDA for the yield farm
    [yieldFarmAddress] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("yield_farm"), tokenMint.toBuffer()],
      program.programId
    );

    // Find PDA for the yield farm vault
    [yieldFarmVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), yieldFarmAddress.toBuffer()],
      program.programId
    );

    // Find PDA for the user deposit
    [userDepositAddress] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_deposit"),
        wallet.publicKey.toBuffer(),
        yieldFarmAddress.toBuffer(),
      ],
      program.programId
    );
  });

  it("Initialize the yield farm", async () => {
    try {
      await program.methods
        .initialize(binsCount)
        .accounts({
          authority: wallet.publicKey,
          tokenMint: tokenMint,
          yieldFarm: yieldFarmAddress,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Fetch the account details
      const yieldFarmAccount = await program.account.yieldFarm.fetch(
        yieldFarmAddress
      );

      // Verify the account data
      expect(yieldFarmAccount.authority.toString()).to.equal(
        wallet.publicKey.toString()
      );
      expect(yieldFarmAccount.tokenMint.toString()).to.equal(
        tokenMint.toString()
      );
      expect(yieldFarmAccount.totalDeposits.toString()).to.equal("0");
      expect(yieldFarmAccount.binsCount).to.equal(binsCount);
      
      // Check bin allocations
      expect(yieldFarmAccount.binAllocations.length).to.equal(3);
      expect(yieldFarmAccount.binAllocations[0].allocationPercentage).to.equal(80);
      expect(yieldFarmAccount.binAllocations[1].allocationPercentage).to.equal(10);
      expect(yieldFarmAccount.binAllocations[2].allocationPercentage).to.equal(10);
      
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });

  it("Deposit tokens into the yield farm", async () => {
    const depositAmount = new anchor.BN(100000000000); // 100 tokens with 9 decimals

    try {
      // Create the vault if it doesn't exist
      try {
        await program.methods
          .createVault()
          .accounts({
            authority: wallet.publicKey,
            yieldFarm: yieldFarmAddress,
            yieldFarmVault: yieldFarmVault,
            tokenMint: tokenMint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .rpc();
      } catch (e) {
        // If vault already exists, ignore error
        console.log("Vault may already exist:", e);
      }

      // Deposit tokens
      await program.methods
        .deposit(depositAmount)
        .accounts({
          user: wallet.publicKey,
          userTokenAccount: userTokenAccount,
          yieldFarm: yieldFarmAddress,
          yieldFarmVault: yieldFarmVault,
          userDeposit: userDepositAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      // Fetch the user deposit account
      const userDeposit = await program.account.userDeposit.fetch(
        userDepositAddress
      );

      // Verify the deposit
      expect(userDeposit.amount.toString()).to.equal(depositAmount.toString());
      expect(userDeposit.user.toString()).to.equal(wallet.publicKey.toString());

      // Fetch the yield farm account
      const yieldFarmAccount = await program.account.yieldFarm.fetch(
        yieldFarmAddress
      );

      // Verify total deposits
      expect(yieldFarmAccount.totalDeposits.toString()).to.equal(
        depositAmount.toString()
      );
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });

  it("Withdraw tokens from the yield farm", async () => {
    const withdrawAmount = new anchor.BN(50000000000); // 50 tokens with 9 decimals

    try {
      await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          user: wallet.publicKey,
          userTokenAccount: userTokenAccount,
          yieldFarm: yieldFarmAddress,
          yieldFarmVault: yieldFarmVault,
          userDeposit: userDepositAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Fetch the user deposit account
      const userDeposit = await program.account.userDeposit.fetch(
        userDepositAddress
      );

      // Verify the withdrawal
      expect(userDeposit.amount.toString()).to.equal("50000000000"); // 50 tokens remain
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });

  it("Rebalance the yield farm allocations", async () => {
    try {
      await program.methods
        .rebalance()
        .accounts({
          keeper: wallet.publicKey,
          yieldFarm: yieldFarmAddress,
        })
        .rpc();

      // Success if no error is thrown
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });

  it("Compound rewards", async () => {
    try {
      await program.methods
        .compoundRewards()
        .accounts({
          keeper: wallet.publicKey,
          yieldFarm: yieldFarmAddress,
        })
        .rpc();

      // Success if no error is thrown
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  });
}); 