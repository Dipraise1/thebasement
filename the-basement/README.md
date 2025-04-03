# The Basement: Solana Yield Farming System

A Solana-based yield farming system that efficiently distributes user deposits into liquidity pools (BINS) based on a predefined allocation strategy. The system uses a smart contract and an off-chain keeper bot for automation, ensuring minimal complexity and high efficiency.

## System Architecture

![System Architecture](https://i.imgur.com/WR40xDY.png)

### Smart Contract (Rust + Anchor)

- Manages deposits, withdrawals, and yield distribution into different BIN pools
- Allocates deposits based on volatility:
  - 80% to 20 BIN Step (-6.57% to +7.03%) for higher volatility, wider range
  - 10% to 4 BIN Step (-1.35% to +1.37%) for medium volatility
  - 10% to 1 BIN Step (-0.34% to +0.34%) for lower volatility, narrower range
- Stores and auto-compounds rewards when triggered

### Off-Chain Keeper Bot (Python)

- Monitors SOL price movements using multiple oracles (Pyth, Switchboard) with fallbacks
- Checks yield in each BIN and auto-compounds rewards hourly
- Rebalances deposits dynamically based on yield efficiency and price movements
- Uses sophisticated algorithms to detect significant market changes

### Frontend (React)

- User-friendly interface for interacting with the yield farming system
- Displays current allocations, yields, and user deposits
- Allows for deposit and withdrawal operations
- Real-time statistics and allocation visualization

### Oracle Integration

- Primary: Pyth Network for SOL price tracking
- Secondary: Switchboard as fallback
- Tertiary: CEX APIs as last resort
- Enhanced monitoring for the narrow 1 BIN Step due to high volatility

## Project Structure

```
the-basement/
├── contracts/          # Anchor smart contract
│   ├── programs/       # Rust program code (yield farming logic)
│   └── tests/          # Smart contract tests
├── keeper-bot/         # Off-chain Python keeper bot
│   ├── src/            # Keeper bot source code
│   └── tests/          # Keeper bot tests
├── frontend/           # React frontend interface
│   ├── public/         # Static files
│   └── src/            # React components and logic
└── README.md           # This file
```

## Technical Features

- **Smart Contract**
  - Efficient PDA-based account structure
  - Safe token handling with SPL Token integration
  - Optimized storage and computation for gas efficiency
  - Robust security measures for deposit management

- **Keeper Bot**
  - Multi-source price feed with fallbacks
  - Historical price tracking for trend analysis
  - Yield optimization algorithms
  - Automatic rebalancing based on market conditions
  - Extensive logging and error handling

- **Frontend**
  - Modern React interface with responsive design
  - Solana wallet integration (Phantom, Solflare)
  - Real-time feedback on transactions
  - Detailed visualization of allocation strategy

## Requirements

### Smart Contract

- Rust 1.68.0 or later
- Solana CLI 1.16.0 or later
- Anchor 0.28.0 or later

### Keeper Bot

- Python 3.9 or later
- Required Python packages (see `keeper-bot/requirements.txt`)

### Frontend

- Node.js 16.0 or later
- npm or yarn
- Modern web browser with Solana wallet extension

## Setup Instructions

### Smart Contract Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd the-basement
   ```

2. Install dependencies:
   ```bash
   cd contracts
   yarn install
   ```

3. Build the smart contract:
   ```bash
   anchor build
   ```

4. Deploy to a Solana cluster:
   ```bash
   anchor deploy --provider.cluster devnet  # or mainnet
   ```

5. Run tests:
   ```bash
   anchor test
   ```

### Keeper Bot Setup

1. Install Python dependencies:
   ```bash
   cd keeper-bot
   pip install -r requirements.txt
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` with your specific configuration.

3. Run the keeper bot:
   ```bash
   cd src
   python main.py
   ```

### Frontend Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Configure environment:
   - Update the token mint address in `src/App.js`
   - Ensure the program ID is correctly set

3. Start the development server:
   ```bash
   npm start
   ```

4. Build for production:
   ```bash
   npm run build
   ```

## Deployment Options

### Smart Contract
- Solana Devnet (for testing)
- Solana Mainnet (for production)

### Keeper Bot
- VPS / Dedicated Server with process manager (systemd, PM2)
- AWS Lambda + CloudWatch scheduled events
- Railway.app or Heroku for managed hosting

### Frontend
- Vercel
- Netlify
- AWS Amplify
- GitHub Pages

## Security Considerations

- The keeper wallet should have enough SOL for transaction fees
- Use a dedicated wallet for the keeper bot, not your main wallet
- Regular monitoring of the keeper bot's operations
- Consider a multi-signature setup for the yield farm authority
- Implement circuit breakers for extreme market conditions

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 