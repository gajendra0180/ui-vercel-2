/**
 * Initialize IAO Factory on Solana Devnet
 * Run with: npx ts-node scripts/initializeFactory.ts
 */

import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

import {
  initializeFactoryTransaction,
  isFactoryInitialized,
  getFactoryStatePDA,
  USDC_MINT_DEVNET,
} from "../src/contracts/solanaIaoFactory.js";

const RPC_URL = "https://solana-devnet.g.alchemy.com/v2/MZLweJZ3VTyHwZR9WnQ5Z";

async function main() {
  console.log("Initializing IAO Factory on Solana Devnet...\n");

  // Load keypair
  const keypairPath = path.join(process.env.HOME || "", ".config/solana/deploy-wallet.json");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Admin wallet:", admin.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(RPC_URL, "confirmed");

  // Check if already initialized
  const initialized = await isFactoryInitialized(connection);
  if (initialized) {
    console.log("\n Factory is already initialized!");
    const [factoryPDA] = getFactoryStatePDA();
    console.log("Factory PDA:", factoryPDA.toBase58());
    return;
  }

  console.log("Factory not yet initialized. Creating initialization transaction...");

  // Create initialization transaction
  const transaction = await initializeFactoryTransaction(
    connection,
    admin.publicKey,
    USDC_MINT_DEVNET,
    BigInt(1000000) // $1.00 USDC price
  );

  // Sign and send
  console.log("Signing and sending transaction...");
  const signature = await sendAndConfirmTransaction(connection, transaction, [admin]);

  console.log("\n Factory initialized successfully!");
  console.log("Transaction signature:", signature);

  const [factoryPDA] = getFactoryStatePDA();
  console.log("Factory PDA:", factoryPDA.toBase58());
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
