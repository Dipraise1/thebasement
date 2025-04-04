# The Basement Deployment Guide

This guide provides detailed step-by-step instructions for deploying The Basement yield farming system on Solana. Follow these instructions to set up the complete system including smart contract, keeper bot, and frontend interface.

## Prerequisites

Make sure you have the following tools installed:

- Solana CLI (v1.16.0 or later)
- Anchor (v0.28.0 or later)
- Node.js (v16.0 or later) and npm/yarn
- Python 3.9 or later (for the keeper bot)
- Git

## Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/the-basement.git
cd the-basement
```

## Step 2: Install Dependencies

```bash
# Install smart contract dependencies
cd the_basement
yarn install

# Install frontend dependencies
cd ../frontend
npm install

# Install keeper bot dependencies
cd ../keeper-bot
pip install -r requirements.txt
cd ..
```

## Step 3: Setup Solana Wallet

If you don't already have a Solana wallet, create one:

```bash
solana-keygen new
```

Set up your Solana CLI to use the new wallet:

```bash
solana config set --keypair ~/.config/solana/id.json
```

## Step 4: Configure Network

Choose whether to deploy to devnet (for testing) or mainnet:

```bash
# For devnet (testing)
solana config set --url https://api.devnet.solana.com

# For mainnet
# solana config set --url https://api.mainnet-beta.solana.com
```

If using devnet, fund your wallet with SOL:

```bash
solana airdrop 2
```

## Step 5: Build and Deploy the Smart Contract

```bash
cd the_basement
anchor build
```

This generates your program keypair at `target/deploy/the_basement-keypair.json`.

Now get your program ID:

```bash
solana address -k target/deploy/the_basement-keypair.json
```

Update the program ID in `Anchor.toml` and `programs/the_basement/src/lib.rs`:

```bash
# In Anchor.toml, update these lines:
[programs.localnet]
the_basement = "YOUR_PROGRAM_ID"

[programs.devnet]
the_basement = "YOUR_PROGRAM_ID"

[programs.mainnet]
the_basement = "YOUR_PROGRAM_ID"
```

```rust
// In programs/the_basement/src/lib.rs, update:
declare_id!("YOUR_PROGRAM_ID");
```

Build again after updating the program ID:

```bash
anchor build
```

Now deploy to your chosen network:

```bash
# For devnet
anchor deploy --provider.cluster devnet

# For mainnet
# anchor deploy --provider.cluster mainnet
```

## Step 6: Create a Test Token (for devnet only)

For testing on devnet, create a test token:

```bash
anchor run create-test-token
```

This will create a new SPL token and save the details to `target/deploy/test-token.json`.

## Step 7: Initialize the Yield Farm

Initialize the yield farm with your token mint:

```bash
# If you created a test token
TOKEN_MINT=$(cat target/deploy/test-token.json | jq -r .tokenMint)
anchor run initialize -- --token-mint $TOKEN_MINT

# Or if you're using an existing token
# anchor run initialize -- --token-mint YOUR_TOKEN_MINT_ADDRESS
```

This will create your yield farm and save its address to `target/deploy/yield_farm_pda.json`.

## Step 8: Configure the Keeper Bot

```bash
cd ../keeper-bot
cp .env.example .env
```

Edit the `.env` file and update:
- `PROGRAM_ID` with your program ID
- `YIELD_FARM_ADDRESS` with the address from `target/deploy/yield_farm_pda.json`
- `TOKEN_MINT` with your token mint address
- Other configurations as needed

## Step 9: Configure the Frontend

```bash
cd ../frontend/src
```

Update `App.js` with your:
- Program ID
- Token mint address

Create a production build of the frontend:

```bash
npm run build
```

## Step 10: Start the System

1. Start the keeper bot:
```bash
cd keeper-bot/src
python main.py
```

2. Serve the frontend (for development):
```bash
cd frontend
npm start
```

Or deploy the frontend to a hosting service like Vercel, Netlify, etc.

## Step 11: Monitoring and Management

- Check the keeper-bot logs regularly
- Monitor your yield farm through the frontend
- Use the Solana Explorer to view on-chain activity

## Deployment Options

### Keeper Bot Deployment

For production, consider deploying the keeper bot using:

1. **VPS/Dedicated Server**:
   ```bash
   # Create a systemd service
   sudo nano /etc/systemd/system/basement-keeper.service
   
   # Add the following content
   [Unit]
   Description=The Basement Keeper Bot
   After=network.target
   
   [Service]
   User=YOUR_USER
   WorkingDirectory=/path/to/the-basement/keeper-bot/src
   ExecStart=/usr/bin/python3 main.py
   Restart=always
   RestartSec=5
   
   [Install]
   WantedBy=multi-user.target
   
   # Enable and start the service
   sudo systemctl enable basement-keeper
   sudo systemctl start basement-keeper
   ```

2. **AWS Lambda**:
   - Package the keeper bot code
   - Create a Lambda function with appropriate permissions
   - Set up CloudWatch Events to trigger the function on a schedule

### Frontend Deployment

1. **Vercel**:
   ```bash
   cd frontend
   npm install -g vercel
   vercel login
   vercel
   ```

2. **Netlify**:
   ```bash
   cd frontend
   npm install -g netlify-cli
   netlify login
   netlify deploy
   ```

## Troubleshooting

### Common Issues

1. **Deployment fails with "Error: Blockhash not found"**:
   - Network congestion, try again
   - Check your Solana RPC connection

2. **Keeper bot fails to connect**:
   - Ensure environment variables are set correctly
   - Check RPC URL
   - Verify wallet has SOL for transactions

3. **Frontend not connecting to wallet**:
   - Ensure wallet extension is installed
   - Check network matches deployment network
   - Verify program ID is correct

For additional help, please file an issue in the GitHub repository.

## Meteora Integration Setup

For proper integration with Meteora's concentrated liquidity pools, follow these additional steps:

### 1. Create Meteora Pool Position (Optional)

If you want to create positions in Meteora pools directly from your contract:

```bash
# Install Meteora SDK
npm install @meteora-ag/concentrated-liquidity
```

### 2. Configure Keeper Bot for Meteora

In your keeper bot's `.env` file, ensure Meteora API is properly configured:

```
# Ensure Meteora is included in DEX_API_URLS
DEX_API_URLS={"orca": "https://api.orca.so/v1/pools", "raydium": "https://api.raydium.io/v2/main/pools", "meteora": "https://api.meteora.ag/v1/pools"}
```

### 3. Verify BIN Settings

Ensure your yield farm's bin settings align with Meteora's bin steps:

- Large BIN: 20 Step (~6.57%) - Corresponds to Meteora pools with bin_step > 500
- Medium BIN: 4 Step (~1.35%) - Corresponds to Meteora pools with bin_step > 100
- Small BIN: 1 Step (~0.34%) - Corresponds to Meteora pools with bin_step <= 100

These BIN settings are automatically configured during initialization, but can be verified in the contract. 