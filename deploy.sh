#!/bin/bash

# The Basement Deployment Script
# This script helps deploy the entire yield farming system
# Usage: ./deploy.sh [devnet|mainnet] [--create-test-token]

set -e # Exit on error

# Default to devnet if no argument provided
NETWORK=${1:-devnet}
CREATE_TEST_TOKEN=false

# Check for create-test-token flag
if [[ "$2" == "--create-test-token" ]]; then
  CREATE_TEST_TOKEN=true
fi

echo "🚀 Deploying The Basement Yield Farming System to $NETWORK..."

# Validate network
if [[ "$NETWORK" != "devnet" && "$NETWORK" != "mainnet" ]]; then
  echo "❌ Error: Network must be either 'devnet' or 'mainnet'"
  exit 1
fi

# Check for required tools
command -v solana >/dev/null 2>&1 || { echo "❌ Error: Solana CLI is required but not installed"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "❌ Error: Anchor is required but not installed"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Error: Node.js is required but not installed"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ Error: Python 3 is required but not installed"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "❌ Error: jq is required but not installed"; exit 1; }

# Check if wallet exists
if ! solana config get keypair; then
  echo "❌ Error: No Solana wallet configured. Run 'solana-keygen new' to create one."
  exit 1
fi

# Set the network
echo "🌐 Setting network to $NETWORK..."
solana config set --url $(if [[ "$NETWORK" == "devnet" ]]; then echo "https://api.devnet.solana.com"; else echo "https://api.mainnet-beta.solana.com"; fi)

# Build and deploy smart contract
echo "📦 Building smart contract..."
cd the-basement/the_basement
anchor build

# Get program ID
PROGRAM_ID=$(solana address -k target/deploy/the_basement-keypair.json)
echo "✅ Program ID: $PROGRAM_ID"

# Update Anchor.toml with program ID
sed -i.bak "s/the_basement = \".*\"/the_basement = \"$PROGRAM_ID\"/g" Anchor.toml
rm Anchor.toml.bak

# Update lib.rs with program ID
sed -i.bak "s/declare_id!(\".*\")/declare_id!(\"$PROGRAM_ID\")/g" programs/the_basement/src/lib.rs
rm programs/the_basement/src/lib.rs.bak

# Build again with updated program ID
echo "📦 Rebuilding with updated program ID..."
anchor build

# Update IDL
echo "📝 Updating IDL..."
mkdir -p ../frontend/src
cp target/idl/the_basement.json ../frontend/src/idl.json

# Update frontend with program ID
sed -i.bak "s/const programId = new PublicKey(\".*\")/const programId = new PublicKey(\"$PROGRAM_ID\")/g" ../frontend/src/App.js
rm ../frontend/src/App.js.bak

# Deploy program
echo "🚀 Deploying smart contract to $NETWORK..."
anchor deploy --provider.cluster $NETWORK

# Create test token if requested
if [[ "$CREATE_TEST_TOKEN" == "true" && "$NETWORK" == "devnet" ]]; then
  echo "💰 Creating test token..."
  anchor run create-test-token
  
  # Extract token mint address
  TOKEN_MINT=$(jq -r .tokenMint target/deploy/test-token.json)
  echo "✅ Test token created with mint: $TOKEN_MINT"
else
  # Ask for token mint
  echo "Enter the token mint address:"
  read TOKEN_MINT
  if [[ -z "$TOKEN_MINT" ]]; then
    echo "❌ Error: Token mint address is required"
    exit 1
  fi
fi

# Initialize keeper bot config
echo "🤖 Setting up keeper bot..."
cd ../keeper-bot
cp .env.example .env
sed -i.bak "s/PROGRAM_ID=.*/PROGRAM_ID=$PROGRAM_ID/g" .env
rm .env.bak

# Update token mint in config
sed -i.bak "s/TOKEN_MINT=.*/TOKEN_MINT=$TOKEN_MINT/g" .env
rm .env.bak

# Update frontend with token mint
cd ../frontend
sed -i.bak "s/const tokenMint = new PublicKey(\"YOUR_TOKEN_MINT\")/const tokenMint = new PublicKey(\"$TOKEN_MINT\")/g" src/App.js
rm src/App.js.bak

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
npm install

# Build frontend
echo "🏗️ Building frontend..."
npm run build

# Initialize the yield farm
echo "🌱 Initializing yield farm..."
cd ../the_basement
# Use token mint to create a yield farm
anchor run initialize -- --token-mint $TOKEN_MINT

# Get yield farm address via PDA
YIELD_FARM_ADDRESS=$(jq -r .address target/deploy/yield_farm_pda.json)
echo "✅ Yield Farm Address: $YIELD_FARM_ADDRESS"

# Update keeper bot with yield farm address
cd ../keeper-bot
sed -i.bak "s/YIELD_FARM_ADDRESS=.*/YIELD_FARM_ADDRESS=$YIELD_FARM_ADDRESS/g" .env
rm .env.bak

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

echo "✅ Deployment completed successfully!"
echo "------------------------------------"
echo "Next steps:"
echo "1. Run the keeper bot: cd keeper-bot/src && python main.py"
echo "2. Serve the frontend: cd frontend && npm start"
echo "3. Monitor your yield farm at: $YIELD_FARM_ADDRESS"
echo "------------------------------------"

# Open instructions for further steps
echo "📖 For detailed deployment instructions, see DEPLOYMENT.md" 