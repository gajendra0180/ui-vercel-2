/**
 * Initialize IAO Factory on Solana Devnet
 * Run with: node scripts/initFactory.mjs
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = "https://solana-devnet.g.alchemy.com/v2/MZLweJZ3VTyHwZR9WnQ5Z";
const IAO_FACTORY_PROGRAM_ID = new PublicKey("FpCX6E1LxRph23NJgF9R8haRJscGPbbdhP2vd5Sn6jwA");
const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// Discriminator for initialize_factory: SHA256("global:initialize_factory")[:8]
const INIT_FACTORY_DISCRIMINATOR = Buffer.from([179, 64, 75, 250, 39, 254, 240, 178]);

function getFactoryStatePDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("factory")],
    IAO_FACTORY_PROGRAM_ID
  );
}

function serializeU64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value), 0);
  return buffer;
}

async function main() {
  console.log("Initializing IAO Factory on Solana Devnet...\n");

  // Load keypair
  const keypairPath = path.join(process.env.HOME, ".config/solana/deploy-wallet.json");
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("Admin wallet:", admin.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(RPC_URL, "confirmed");

  // Check balance
  const balance = await connection.getBalance(admin.publicKey);
  console.log("Balance:", balance / 1e9, "SOL");

  // Get factory PDA
  const [factoryState, bump] = getFactoryStatePDA();
  console.log("Factory PDA:", factoryState.toBase58());

  // Check if already initialized
  const accountInfo = await connection.getAccountInfo(factoryState);
  if (accountInfo !== null) {
    console.log("\n✅ Factory is already initialized!");
    return;
  }

  console.log("Factory not yet initialized. Creating initialization transaction...");

  // Build instruction data: discriminator + payment_token_price (u64)
  const paymentTokenPrice = BigInt(1000000); // $1.00 in 6 decimals
  const instructionData = Buffer.concat([
    INIT_FACTORY_DISCRIMINATOR,
    serializeU64(paymentTokenPrice),
  ]);

  // Build instruction
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: factoryState, isSigner: false, isWritable: true },
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: USDC_MINT_DEVNET, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: IAO_FACTORY_PROGRAM_ID,
    data: instructionData,
  });

  // Build transaction
  const transaction = new Transaction();
  transaction.add(instruction);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = admin.publicKey;

  // Sign
  transaction.sign(admin);

  // Send
  console.log("Sending transaction...");
  const signature = await connection.sendRawTransaction(transaction.serialize());
  console.log("Transaction sent:", signature);

  // Confirm
  console.log("Waiting for confirmation...");
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  });

  if (confirmation.value.err) {
    console.error("Transaction failed:", confirmation.value.err);
    return;
  }

  console.log("\n✅ Factory initialized successfully!");
  console.log("Transaction:", `https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
