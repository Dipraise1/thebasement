import React, { useState, useEffect } from 'react';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import { useWallet, WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletModalProvider, WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import YieldFarmUI from './components/YieldFarmUI';
import idl from './idl.json';

// Import wallet adapter styles
import '@solana/wallet-adapter-react-ui/styles.css';

// Set up the network and wallet configuration
const network = WalletAdapterNetwork.Devnet;
const endpoint = clusterApiUrl(network);
const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
];

// The program ID from your deployed contract
const programId = new PublicKey("GUrBCCME6Cmp9NA4yNSYy1BvKczYPwnqdXSVFAd21sAA");

function App() {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className="App">
            <header className="App-header">
              <h1>The Basement Yield Farming</h1>
              <WalletMultiButton />
            </header>
            <main>
              <BasementContent />
            </main>
            <footer>
              <p>© 2023 The Basement - Efficient Yield Farming on Solana</p>
            </footer>
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function BasementContent() {
  const wallet = useWallet();
  const [program, setProgram] = useState(null);
  const [yieldFarmData, setYieldFarmData] = useState(null);
  const [userDeposit, setUserDeposit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Initialize the program when wallet is connected
    if (wallet.publicKey) {
      initializeProgram();
    }
  }, [wallet.publicKey]);

  const initializeProgram = async () => {
    try {
      // Create the provider
      const provider = new AnchorProvider(
        new Connection(endpoint),
        wallet,
        { preflightCommitment: 'processed' }
      );

      // Create the program
      const program = new Program(idl, programId, provider);
      setProgram(program);

      // Load data if program is successfully created
      await loadYieldFarmData(program);
    } catch (error) {
      console.error("Error initializing program:", error);
    }
  };

  const loadYieldFarmData = async (programInstance) => {
    try {
      setLoading(true);

      // Derive the yield farm address PDA
      const tokenMint = new PublicKey("YOUR_TOKEN_MINT"); // Replace with your token mint
      const [yieldFarmAddress] = await PublicKey.findProgramAddressSync(
        [Buffer.from("yield_farm"), tokenMint.toBuffer()],
        programId
      );

      // Fetch the yield farm account data
      const yieldFarmAccount = await programInstance.account.yieldFarm.fetch(yieldFarmAddress);
      setYieldFarmData(yieldFarmAccount);

      // If wallet is connected, get user's deposit
      if (wallet.publicKey) {
        // Derive the user deposit address PDA
        const [userDepositAddress] = await PublicKey.findProgramAddressSync(
          [
            Buffer.from("user_deposit"),
            wallet.publicKey.toBuffer(),
            yieldFarmAddress.toBuffer(),
          ],
          programId
        );

        try {
          // Fetch the user deposit account data
          const userDepositAccount = await programInstance.account.userDeposit.fetch(userDepositAddress);
          setUserDeposit(userDepositAccount);
        } catch (error) {
          // User might not have a deposit yet
          console.log("No deposit found for user");
          setUserDeposit(null);
        }
      }
    } catch (error) {
      console.error("Error loading yield farm data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Return loading state or component based on wallet connection
  if (!wallet.connected) {
    return (
      <div className="not-connected">
        <p>Connect your wallet to use The Basement Yield Farming</p>
      </div>
    );
  }

  if (loading) {
    return <div className="loading">Loading yield farm data...</div>;
  }

  return (
    <YieldFarmUI 
      program={program}
      yieldFarmData={yieldFarmData}
      userDeposit={userDeposit}
      wallet={wallet}
      refreshData={() => loadYieldFarmData(program)}
    />
  );
}

export default App; 