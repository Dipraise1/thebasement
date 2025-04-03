import React, { useState } from 'react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';

const YieldFarmUI = ({ program, yieldFarmData, userDeposit, wallet, refreshData }) => {
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [txError, setTxError] = useState("");

  // Format token amounts (assuming 9 decimals like SOL)
  const formatTokenAmount = (amount) => {
    if (!amount) return "0";
    const amountInSol = amount.toString() / LAMPORTS_PER_SOL;
    return amountInSol.toFixed(4);
  };

  // Handle deposit function
  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setTxError("Please enter a valid deposit amount");
      return;
    }

    try {
      setTxStatus("Processing deposit...");
      setTxError("");

      // Convert amount to lamports
      const amountLamports = new BN(parseFloat(depositAmount) * LAMPORTS_PER_SOL);

      // Get token mint from yield farm data
      const tokenMint = new PublicKey(yieldFarmData.tokenMint);

      // Derive the yield farm address
      const [yieldFarmAddress] = await PublicKey.findProgramAddressSync(
        [Buffer.from("yield_farm"), tokenMint.toBuffer()],
        program.programId
      );

      // Derive the yield farm vault address
      const [yieldFarmVault] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), yieldFarmAddress.toBuffer()],
        program.programId
      );

      // Derive user deposit address
      const [userDepositAddress] = await PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_deposit"),
          wallet.publicKey.toBuffer(),
          yieldFarmAddress.toBuffer(),
        ],
        program.programId
      );

      // Get the user's token account for this mint
      const userTokenAccount = await Token.getAssociatedTokenAddress(
        TOKEN_PROGRAM_ID,
        tokenMint,
        wallet.publicKey
      );

      // Send the deposit transaction
      const tx = await program.methods
        .deposit(amountLamports)
        .accounts({
          user: wallet.publicKey,
          userTokenAccount: userTokenAccount,
          yieldFarm: yieldFarmAddress,
          yieldFarmVault: yieldFarmVault,
          userDeposit: userDepositAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: PublicKey.SystemProgram.programId,
        })
        .rpc();

      setTxStatus(`Deposit successful! Transaction ID: ${tx}`);
      setDepositAmount("");
      
      // Refresh data after successful deposit
      await refreshData();
    } catch (error) {
      console.error("Deposit error:", error);
      setTxError(`Deposit failed: ${error.message}`);
      setTxStatus("");
    }
  };

  // Handle withdraw function
  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setTxError("Please enter a valid withdrawal amount");
      return;
    }

    if (!userDeposit || parseFloat(withdrawAmount) > formatTokenAmount(userDeposit.amount)) {
      setTxError("Insufficient balance for withdrawal");
      return;
    }

    try {
      setTxStatus("Processing withdrawal...");
      setTxError("");

      // Convert amount to lamports
      const amountLamports = new BN(parseFloat(withdrawAmount) * LAMPORTS_PER_SOL);

      // Get token mint from yield farm data
      const tokenMint = new PublicKey(yieldFarmData.tokenMint);

      // Derive the yield farm address
      const [yieldFarmAddress] = await PublicKey.findProgramAddressSync(
        [Buffer.from("yield_farm"), tokenMint.toBuffer()],
        program.programId
      );

      // Derive the yield farm vault address
      const [yieldFarmVault] = await PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), yieldFarmAddress.toBuffer()],
        program.programId
      );

      // Derive user deposit address
      const [userDepositAddress] = await PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_deposit"),
          wallet.publicKey.toBuffer(),
          yieldFarmAddress.toBuffer(),
        ],
        program.programId
      );

      // Get the user's token account for this mint
      const userTokenAccount = await Token.getAssociatedTokenAddress(
        TOKEN_PROGRAM_ID,
        tokenMint,
        wallet.publicKey
      );

      // Send the withdraw transaction
      const tx = await program.methods
        .withdraw(amountLamports)
        .accounts({
          user: wallet.publicKey,
          userTokenAccount: userTokenAccount,
          yieldFarm: yieldFarmAddress,
          yieldFarmVault: yieldFarmVault,
          userDeposit: userDepositAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxStatus(`Withdrawal successful! Transaction ID: ${tx}`);
      setWithdrawAmount("");
      
      // Refresh data after successful withdrawal
      await refreshData();
    } catch (error) {
      console.error("Withdrawal error:", error);
      setTxError(`Withdrawal failed: ${error.message}`);
      setTxStatus("");
    }
  };

  // Render the component
  return (
    <div className="yield-farm-ui">
      <div className="farm-stats">
        <h2>Yield Farm Statistics</h2>
        {yieldFarmData ? (
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Deposits:</span>
              <span className="stat-value">{formatTokenAmount(yieldFarmData.totalDeposits)} tokens</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">BIN Types:</span>
              <span className="stat-value">{yieldFarmData.binsCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Your Deposit:</span>
              <span className="stat-value">
                {userDeposit ? formatTokenAmount(userDeposit.amount) : "0"} tokens
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Last Update:</span>
              <span className="stat-value">
                {userDeposit ? new Date(userDeposit.lastUpdateTime * 1000).toLocaleString() : "N/A"}
              </span>
            </div>
          </div>
        ) : (
          <p>No yield farm data available</p>
        )}
      </div>

      <div className="allocation-strategy">
        <h3>Allocation Strategy</h3>
        {yieldFarmData && yieldFarmData.binAllocations ? (
          <div className="allocations">
            {yieldFarmData.binAllocations.map((allocation, index) => (
              <div key={index} className="allocation-item">
                <h4>{getBinTypeLabel(allocation.binType)}</h4>
                <p>Allocation: {allocation.allocationPercentage}%</p>
                <p>Step Size: {allocation.stepSize / 100}%</p>
                <p>Bin Count: {allocation.binCount}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No allocation data available</p>
        )}
      </div>

      <div className="actions">
        <div className="deposit-section">
          <h3>Deposit Tokens</h3>
          <div className="input-group">
            <input
              type="number"
              placeholder="Amount to deposit"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              min="0"
              step="0.1"
            />
            <button onClick={handleDeposit}>Deposit</button>
          </div>
        </div>

        <div className="withdraw-section">
          <h3>Withdraw Tokens</h3>
          <div className="input-group">
            <input
              type="number"
              placeholder="Amount to withdraw"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min="0"
              step="0.1"
              max={userDeposit ? formatTokenAmount(userDeposit.amount) : "0"}
            />
            <button onClick={handleWithdraw}>Withdraw</button>
          </div>
          {userDeposit && (
            <p className="max-withdrawal">
              Max: {formatTokenAmount(userDeposit.amount)} tokens
            </p>
          )}
        </div>
      </div>

      {txStatus && <div className="tx-status success">{txStatus}</div>}
      {txError && <div className="tx-status error">{txError}</div>}
    </div>
  );
};

// Helper function to convert bin type enum to label
const getBinTypeLabel = (binType) => {
  switch (binType) {
    case 0:
      return "Large BIN (20 Step -6.57% to +7.03%)";
    case 1:
      return "Medium BIN (4 Step -1.35% to +1.37%)";
    case 2:
      return "Small BIN (1 Step -0.34% to +0.34%)";
    default:
      return "Unknown BIN Type";
  }
};

export default YieldFarmUI; 