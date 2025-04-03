import React, { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, Provider, web3 } from '@coral-xyz/anchor';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { WalletProvider, ConnectionProvider } from '@solana/wallet-adapter-react';
import YieldFarmUI from './components/YieldFarmUI';

// Import styles
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

// Import the IDL
import idl from './idl.json';

// Set up the network and endpoint
const network = WalletAdapterNetwork.Devnet;
const endpoint = 'https://api.devnet.solana.com';

// Create a wallet adapter array
const wallets = [new PhantomWalletAdapter()];

// Set up the program ID from the IDL
const programId = new PublicKey(idl.metadata.address);

function App() {
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <div className="App">
          <header className="App-header">
            <h1>The Basement Yield Farm</h1>
            <WalletMultiButton />
          </header>
          <main>
            <BasementContent />
          </main>
          <footer>
            <p>© 2023 The Basement - Advanced Yield Farming System</p>
          </footer>
        </div>
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

  // Initialize the program when wallet is connected
  useEffect(() => {
    if (wallet.connected) {
      initializeProgram();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.connected]);

  // Load data when program is initialized
  useEffect(() => {
    if (program) {
      loadYieldFarmData(program);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program]);

  // Initialize Anchor program
  const initializeProgram = async () => {
    try {
      // Create a connection to the Solana network
      const connection = new Connection(endpoint, 'confirmed');
      
      // Create an Anchor provider
      const provider = new Provider(
        connection,
        wallet,
        { commitment: 'confirmed', preflightCommitment: 'confirmed' }
      );
      
      // Create the program interface
      const program = new Program(idl, programId, provider);
      setProgram(program);
    } catch (error) {
      console.error("Error initializing program:", error);
    }
  };

  // Load yield farm data
  const loadYieldFarmData = async (program) => {
    setLoading(true);
    try {
      // Load token mint address (this would be configured as a constant in a real app)
      // For now, we'll use a placeholder
      const tokenMint = new PublicKey("BFZpksditzAhQbZ3xsdDvJjbXy5VZ2DkYZ7KxPPySEve");
      
      // Get the yield farm account PDA
      const [yieldFarmAddress] = await PublicKey.findProgramAddressSync(
        [Buffer.from("yield_farm"), tokenMint.toBuffer()],
        program.programId
      );
      
      // Fetch the yield farm account data
      const yieldFarmAccount = await program.account.yieldFarm.fetch(yieldFarmAddress);
      setYieldFarmData(yieldFarmAccount);
      
      // If wallet is connected, load user deposit data
      if (wallet.connected) {
        // Get user deposit account PDA
        const [userDepositAddress] = await PublicKey.findProgramAddressSync(
          [Buffer.from("user_deposit"), wallet.publicKey.toBuffer(), yieldFarmAddress.toBuffer()],
          program.programId
        );
        
        // Try to fetch user deposit data (might not exist yet)
        try {
          const userDepositAccount = await program.account.userDeposit.fetch(userDepositAddress);
          setUserDeposit(userDepositAccount);
        } catch (error) {
          console.log("User has no deposit yet:", error);
          setUserDeposit(null);
        }
      }
    } catch (error) {
      console.error("Error loading yield farm data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="not-connected">
        <p>Please connect your wallet to interact with The Basement Yield Farm.</p>
        <WalletMultiButton />
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