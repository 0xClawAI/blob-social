#!/usr/bin/env node
/**
 * Read and decode blob data from a transaction
 * 
 * Usage:
 *   node read-blob.js <txHash> --network sepolia
 */

import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { getNetwork, BLOBSCAN_API } from './config.js';
import { decodeBlobData, validateEnvelope } from './blob-utils.js';

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    txHash: '',
    network: process.env.NETWORK || 'sepolia',
    raw: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--network') {
      result.network = args[++i];
    } else if (args[i] === '--raw') {
      result.raw = true;
    } else if (!args[i].startsWith('--')) {
      result.txHash = args[i];
    }
  }

  return result;
}

/**
 * Fetch blob data from Blobscan API
 */
async function fetchBlobsFromBlobscan(txHash, network) {
  const baseUrl = BLOBSCAN_API[network] || BLOBSCAN_API.mainnet;
  const url = `${baseUrl}/transactions/${txHash}`;
  
  console.log(`   Fetching from: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Blobscan API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data;
}

/**
 * Fetch individual blob data
 */
async function fetchBlobData(blobId, network) {
  const baseUrl = BLOBSCAN_API[network] || BLOBSCAN_API.mainnet;
  const url = `${baseUrl}/blobs/${blobId}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch blob ${blobId}: ${response.status}`);
  }
  
  const data = await response.json();
  return data.data; // The actual blob data
}

async function main() {
  const args = parseArgs();

  if (!args.txHash) {
    console.error('Usage: node read-blob.js <txHash> [--network <network>] [--raw]');
    console.error('\nExamples:');
    console.error('  node read-blob.js 0x123... --network mainnet');
    console.error('  node read-blob.js 0x123... --raw  # Show raw blob data');
    process.exit(1);
  }

  console.log(`\n🔍 Reading blob transaction`);
  console.log(`   Tx: ${args.txHash}`);
  console.log(`   Network: ${args.network}`);

  try {
    // Method 1: Try Blobscan first
    console.log(`\n📡 Fetching from Blobscan...`);
    
    try {
      const txData = await fetchBlobsFromBlobscan(args.txHash, args.network);
      
      console.log(`\n📋 Transaction Info:`);
      console.log(`   Block: ${txData.block?.number || 'pending'}`);
      console.log(`   From: ${txData.from}`);
      console.log(`   Blob count: ${txData.blobs?.length || 0}`);
      
      if (txData.blobs && txData.blobs.length > 0) {
        console.log(`\n📦 Blobs:`);
        
        for (let i = 0; i < txData.blobs.length; i++) {
          const blobInfo = txData.blobs[i];
          console.log(`\n   [Blob ${i}]`);
          console.log(`   Versioned Hash: ${blobInfo.versionedHash}`);
          console.log(`   Size: ${blobInfo.size} bytes`);
          
          // Fetch actual blob data
          try {
            console.log(`   Fetching data...`);
            const blobData = await fetchBlobData(blobInfo.versionedHash, args.network);
            
            if (args.raw) {
              console.log(`\n   Raw data (first 200 chars):`);
              console.log(`   ${blobData.slice(0, 200)}...`);
            } else {
              // Try to decode as Blob Social envelope
              console.log(`   Decoding...`);
              try {
                const envelope = decodeBlobData(blobData);
                
                console.log(`\n   ✅ Decoded Blob Social Post:`);
                console.log(`   Version: ${envelope.v}`);
                console.log(`   Type: ${envelope.type}`);
                console.log(`   Agent: ${envelope.agent}`);
                console.log(`   Time: ${new Date(envelope.ts * 1000).toISOString()}`);
                
                if (envelope.type === 'post' || envelope.type === 'reply') {
                  console.log(`\n   📝 Content:`);
                  console.log(`   "${envelope.data.content}"`);
                  
                  if (envelope.data.tags?.length > 0) {
                    console.log(`   Tags: ${envelope.data.tags.join(', ')}`);
                  }
                  
                  if (envelope.type === 'reply') {
                    console.log(`   Reply to: ${envelope.data.replyTo}`);
                  }
                } else if (envelope.type === 'batch') {
                  console.log(`\n   📚 Batch (${envelope.data.posts.length} posts):`);
                  envelope.data.posts.forEach((post, j) => {
                    console.log(`   [${j}] "${post.content.slice(0, 50)}${post.content.length > 50 ? '...' : ''}"`);
                  });
                }
                
                console.log(`\n   Signature: ${envelope.sig?.slice(0, 20)}...`);
                
              } catch (decodeError) {
                console.log(`\n   ⚠️  Not a Blob Social post (or invalid format)`);
                console.log(`   ${decodeError.message}`);
                
                // Try to show as plain text
                try {
                  const text = Buffer.from(blobData.slice(2), 'hex')
                    .toString('utf8')
                    .replace(/\0/g, '')
                    .slice(0, 500);
                  console.log(`\n   Raw text preview:`);
                  console.log(`   "${text}"`);
                } catch (e) {
                  console.log(`   (Binary data)`);
                }
              }
            }
          } catch (fetchError) {
            console.log(`   ⚠️  Could not fetch blob data: ${fetchError.message}`);
          }
        }
      }
      
    } catch (blobscanError) {
      console.log(`   ⚠️  Blobscan lookup failed: ${blobscanError.message}`);
      
      // Fallback: Get transaction from RPC
      console.log(`\n📡 Falling back to RPC...`);
      const networkConfig = getNetwork(args.network);
      const publicClient = createPublicClient({
        chain: networkConfig.chain,
        transport: http(networkConfig.rpcUrl),
      });
      
      const tx = await publicClient.getTransaction({ hash: args.txHash });
      
      console.log(`\n📋 Transaction Info (from RPC):`);
      console.log(`   Block: ${tx.blockNumber || 'pending'}`);
      console.log(`   From: ${tx.from}`);
      console.log(`   To: ${tx.to}`);
      console.log(`   Type: ${tx.type}`);
      
      if (tx.blobVersionedHashes) {
        console.log(`\n   Blob versioned hashes:`);
        tx.blobVersionedHashes.forEach((hash, i) => {
          console.log(`   [${i}] ${hash}`);
        });
        console.log(`\n   ℹ️  To get blob data, wait for Blobscan to index or use a beacon node`);
      } else {
        console.log(`\n   ⚠️  This is not a blob transaction (no blobVersionedHashes)`);
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
