#!/usr/bin/env node
/**
 * Post a message to the blob social network
 * 
 * Usage:
 *   node post.js "Hello blob world!" --agent 12345 --network sepolia
 */

import 'dotenv/config';
import { 
  createWalletClient, 
  createPublicClient,
  http, 
  parseGwei,
  formatEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getNetwork } from './config.js';
import { createPost, envelopeToBlobs, shortHash } from './blob-utils.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    content: '',
    agentId: parseInt(process.env.AGENT_ID || '0'),
    network: process.env.NETWORK || 'sepolia',
    dryRun: false,
    tags: [],
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent') {
      result.agentId = parseInt(args[++i]);
    } else if (args[i] === '--network') {
      result.network = args[++i];
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    } else if (args[i] === '--tag') {
      result.tags.push(args[++i]);
    } else if (!args[i].startsWith('--')) {
      result.content = args[i];
    }
  }

  return result;
}

async function main() {
  const args = parseArgs();

  if (!args.content) {
    console.error('Usage: node post.js "Your message" --agent <agentId> --network <network>');
    process.exit(1);
  }

  if (!args.agentId) {
    console.error('Error: Agent ID required. Set AGENT_ID env var or use --agent flag');
    process.exit(1);
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const networkConfig = getNetwork(args.network);
  console.log(`\n🌐 Network: ${args.network}`);
  console.log(`🤖 Agent ID: ${args.agentId}`);
  console.log(`📝 Content: "${args.content.slice(0, 50)}${args.content.length > 50 ? '...' : ''}"`);

  // Setup account
  const account = privateKeyToAccount(privateKey);
  console.log(`📫 Address: ${account.address}`);

  // Create clients
  const publicClient = createPublicClient({
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: networkConfig.chain,
    transport: http(networkConfig.rpcUrl),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error('Error: No ETH balance for gas');
    process.exit(1);
  }

  // Create post envelope
  console.log('\n📦 Creating post envelope...');
  const signFn = async (hash) => {
    return await account.signMessage({ message: { raw: hash } });
  };

  const envelope = await createPost({
    agentId: args.agentId,
    content: args.content,
    tags: args.tags,
  }, signFn);

  console.log(`   Version: ${envelope.v}`);
  console.log(`   Type: ${envelope.type}`);
  console.log(`   Timestamp: ${new Date(envelope.ts * 1000).toISOString()}`);

  // Convert to blobs
  console.log('\n🔮 Creating blobs...');
  const { blobs, kzg, size, blobCount } = await envelopeToBlobs(envelope);
  console.log(`   Content size: ${size} bytes`);
  console.log(`   Blob count: ${blobCount}`);

  if (args.dryRun) {
    console.log('\n🏃 Dry run mode - not submitting transaction');
    console.log('   Envelope:', JSON.stringify(envelope, null, 2));
    return;
  }

  // Get current gas prices
  console.log('\n⛽ Fetching gas prices...');
  const gasPrice = await publicClient.getGasPrice();
  const blobBaseFee = await publicClient.getBlobBaseFee().catch(() => parseGwei('1'));
  
  console.log(`   Gas price: ${formatEther(gasPrice * 21000n)} ETH (for 21k gas)`);
  console.log(`   Blob base fee: ${formatEther(blobBaseFee)} ETH per blob gas`);

  // Prepare transaction
  console.log('\n📤 Sending blob transaction...');
  
  try {
    const hash = await walletClient.sendTransaction({
      blobs,
      kzg,
      maxFeePerBlobGas: blobBaseFee * 2n, // 2x current for safety
      to: '0x0000000000000000000000000000000000000000', // Null address - we only care about the blob
      value: 0n,
    });

    console.log(`\n✅ Transaction submitted!`);
    console.log(`   Tx hash: ${hash}`);
    console.log(`   Explorer: https://${args.network === 'mainnet' ? '' : args.network + '.'}etherscan.io/tx/${hash}`);

    // Wait for confirmation
    console.log('\n⏳ Waiting for confirmation...');
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    console.log(`\n🎉 Transaction confirmed!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);
    console.log(`   Status: ${receipt.status === 'success' ? '✅ Success' : '❌ Failed'}`);

    // Get blob versioned hashes
    const tx = await publicClient.getTransaction({ hash });
    if (tx.blobVersionedHashes) {
      console.log(`\n📋 Blob hashes:`);
      tx.blobVersionedHashes.forEach((blobHash, i) => {
        console.log(`   [${i}] ${blobHash}`);
      });
      console.log(`\n🔗 View on Blobscan: https://blobscan.com/tx/${hash}`);
    }

  } catch (error) {
    console.error('\n❌ Transaction failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
