/**
 * Configuration for Blob Social Network scripts
 */

import { mainnet, sepolia, base, baseSepolia } from 'viem/chains';

// Network configurations
export const NETWORKS = {
  mainnet: {
    chain: mainnet,
    rpcUrl: process.env.MAINNET_RPC_URL || 'https://eth.llamarpc.com',
    blobSocialGraph: null, // Not deployed yet
    archiverRegistry: null,
    agentRegistry: '0x...', // ERC-8004 address
  },
  sepolia: {
    chain: sepolia,
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://rpc.sepolia.org',
    blobSocialGraph: null, // Deploy and update
    archiverRegistry: null,
    agentRegistry: null,
  },
  base: {
    chain: base,
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    blobSocialGraph: null,
    archiverRegistry: null,
    agentRegistry: null,
  },
  baseSepolia: {
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    blobSocialGraph: null, // Deploy here first for testing
    archiverRegistry: null,
    agentRegistry: null,
  },
};

// Blob Social protocol constants
export const PROTOCOL = {
  version: 1,
  maxPostLength: 100000, // ~100KB text, leaves room for metadata
  maxBlobSize: 131072,   // 128KB per blob
  maxBlobsPerTx: 6,      // EIP-4844 limit
};

// Content types
export const CONTENT_TYPES = {
  POST: 'post',
  REPLY: 'reply',
  BATCH: 'batch',
  MESSAGE: 'message',
  PROFILE: 'profile',
};

// Blobscan API for reading blobs
export const BLOBSCAN_API = {
  mainnet: 'https://api.blobscan.com',
  sepolia: 'https://api.sepolia.blobscan.com',
};

export function getNetwork(name) {
  const network = NETWORKS[name];
  if (!network) {
    throw new Error(`Unknown network: ${name}. Available: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return network;
}
