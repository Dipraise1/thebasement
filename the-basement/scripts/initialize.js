// Script to initialize the yield farm
const anchor = require("@coral-xyz/anchor");
const { PublicKey } = require("@solana/web3.js");
const fs = require("fs");
const path = require("path");
const { program } = require("commander");

program
  .option(
    "--token-mint <address>",
    "Token mint address for the yield farm",
    ""
  )
  .parse(process.argv);

const options = program.opts();

if (!options.tokenMint) {
  console.error("Error: Token mint address is required");
  process.exit(1);
}

async function main() {
  // Configure the client
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load the program
  const idl = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../target/idl/the_basement.json")
    )
  );
  const programId = new PublicKey(idl.metadata.address);
  const program = new anchor.Program(idl, programId, provider);

  console.log(`Using program: ${programId.toString()}`);
  console.log(`Using token mint: ${options.tokenMint}`);

  // Token mint from command line
  const tokenMint = new PublicKey(options.tokenMint);

  // Find the yield farm PDA
  const [yieldFarmAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("yield_farm"), tokenMint.toBuffer()],
    programId
  );

  console.log(`Yield farm will be at: ${yieldFarmAddress.toString()}`);

  try {
    // Initialize the yield farm with 3 bin types
    const tx = await program.methods
      .initialize(3) // 3 bin types: large, medium, small
      .accounts({
        authority: provider.wallet.publicKey,
        tokenMint: tokenMint,
        yieldFarm: yieldFarmAddress,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("Yield farm initialized successfully!");
    console.log(`Transaction: ${tx}`);
    console.log(`Yield Farm Address: ${yieldFarmAddress.toString()}`);

    // Save yield farm address to file for the deployment script
    fs.writeFileSync(
      path.resolve(__dirname, "../target/deploy/yield_farm_pda.json"),
      JSON.stringify({
        address: yieldFarmAddress.toString(),
      })
    );

    // Now create the vault
    const [yieldFarmVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), yieldFarmAddress.toBuffer()],
      programId
    );

    console.log(`Creating vault at: ${yieldFarmVault.toString()}`);

    const vaultTx = await program.methods
      .createVault()
      .accounts({
        authority: provider.wallet.publicKey,
        yieldFarm: yieldFarmAddress,
        yieldFarmVault: yieldFarmVault,
        tokenMint: tokenMint,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Vault created successfully!");
    console.log(`Transaction: ${vaultTx}`);
    console.log(`Vault Address: ${yieldFarmVault.toString()}`);

  } catch (error) {
    console.error("Error initializing yield farm:", error);
    process.exit(1);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
); 