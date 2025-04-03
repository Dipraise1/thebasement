// Script to create a test token for the yield farm
const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair, Connection } = require("@solana/web3.js");
const {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} = require("@solana/spl-token");
const fs = require("fs");
const path = require("path");

async function main() {
  // Configure the client to devnet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Use the default Solana wallet
  const wallet = anchor.Wallet.local();
  
  console.log("Using wallet:", wallet.publicKey.toString());
  
  // Check wallet SOL balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Wallet balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);
  
  if (balance < anchor.web3.LAMPORTS_PER_SOL) {
    console.warn("Warning: Wallet balance is low, you might need to airdrop SOL");
    console.log("You can use: solana airdrop 2 <your-wallet-address> --url devnet");
  }
  
  try {
    // Create a new token mint
    console.log("Creating token mint...");
    const tokenMint = await createMint(
      connection,
      wallet.payer, // payer
      wallet.publicKey, // mint authority
      wallet.publicKey, // freeze authority (you can use null to disable)
      9 // decimals (similar to SOL)
    );
    
    console.log(`Token mint created: ${tokenMint.toString()}`);
    
    // Create a token account for the wallet
    console.log("Creating token account...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      tokenMint,
      wallet.publicKey
    );
    
    console.log(`Token account created: ${tokenAccount.address.toString()}`);
    
    // Mint some tokens to the wallet
    console.log("Minting tokens...");
    const mintAmount = 1000000000000; // 1000 tokens (with 9 decimals)
    await mintTo(
      connection,
      wallet.payer,
      tokenMint,
      tokenAccount.address,
      wallet.publicKey,
      mintAmount
    );
    
    console.log(`Minted ${mintAmount / 1e9} tokens to ${tokenAccount.address.toString()}`);
    
    // Save token mint address to a file
    const outputPath = path.resolve(__dirname, "../target/deploy/test-token.json");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    
    fs.writeFileSync(
      outputPath,
      JSON.stringify({
        tokenMint: tokenMint.toString(),
        tokenAccount: tokenAccount.address.toString(),
        owner: wallet.publicKey.toString(),
        amount: mintAmount,
      }, null, 2)
    );
    
    console.log(`Token information saved to: ${outputPath}`);
    console.log("\nYou can now use this token for initializing the yield farm:");
    console.log(`anchor run initialize -- --token-mint ${tokenMint.toString()}`);
    
  } catch (error) {
    console.error("Error creating test token:", error);
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