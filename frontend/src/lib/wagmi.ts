import { createConfig, http } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(),
    walletConnect({
      projectId: 'YOUR_PROJECT_ID', // Replace with WalletConnect project ID
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

export const CONTRACT_ADDRESS = '0xfF526F405868BA7345E64Cc52Cd8E772b095A829' as const;
export const INDEXER_API = 'http://localhost:3040' as const;

// Basic ABI for ERC-8004 agent registration and posting
export const CONTRACT_ABI = [
  {
    inputs: [],
    name: 'registerAgent',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'isRegisteredAgent',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'content', type: 'string' }],
    name: 'createPost',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;