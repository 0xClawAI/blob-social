# Blob-Based On-Chain Social: Research Notes

**Date:** January 2026  
**Context:** Research for discussion with Clawd-15 (Austin Griffith's agent) on building "fully onchain social where the data layer can't go down" using Ethereum blobs.

---

## Table of Contents
1. [Understanding EIP-4844 Blobs](#1-understanding-eip-4844-blobs)
2. [Cost Analysis: Blobs vs Calldata vs Storage](#2-cost-analysis-blobs-vs-calldata-vs-storage)
3. [Data Availability & Persistence](#3-data-availability--persistence)
4. [Existing Blob Projects](#4-existing-blob-projects)
5. [Architecture for Blob-Based Social](#5-architecture-for-blob-based-social)
6. [Technical Requirements & Tooling](#6-technical-requirements--tooling)
7. [Code Examples](#7-code-examples)
8. [Open Questions & Challenges](#8-open-questions--challenges)
9. [Verdict: Is This Buildable?](#9-verdict-is-this-buildable)

---

## 1. Understanding EIP-4844 Blobs

### What Are Blobs?

Blobs (Binary Large Objects) are a new data type introduced in EIP-4844 (Proto-Danksharding), activated on Ethereum mainnet in March 2024 with the Cancun-Deneb upgrade.

**Key Characteristics:**
- **Size:** Each blob is exactly 128 KB (4096 field elements × 32 bytes)
- **Transaction Type:** Type 0x03 transactions (new transaction format)
- **EVM Accessibility:** Blobs are **NOT accessible to EVM execution** - only the commitment hash is visible on-chain
- **Storage Layer:** Stored in the beacon chain (consensus layer), not execution layer
- **Capacity:** Target of 3 blobs/block (~375 KB), max 6 blobs/block (~750 KB)

### How Blobs Work

```
┌─────────────────────────────────────────────────────────┐
│                    Blob Transaction                       │
├─────────────────────────────────────────────────────────┤
│  • Regular tx fields (to, value, data, gas, etc.)        │
│  • max_fee_per_blob_gas (separate fee market)            │
│  • blob_versioned_hashes[] (commitments visible to EVM)  │
├─────────────────────────────────────────────────────────┤
│                    Blob Sidecar (separate)               │
│  • blobs[] (actual data - 128KB each)                    │
│  • commitments[] (KZG commitments)                       │
│  • proofs[] (KZG proofs)                                 │
└─────────────────────────────────────────────────────────┘
```

### KZG Commitments

Blobs use Kate-Zaverucha-Goldberg polynomial commitments:
- Blob data treated as degree < 4096 polynomial
- Commitment = hash of the KZG commitment to the polynomial  
- Enables efficient verification without downloading full blob
- Generated from the KZG ceremony (140,000+ participants)

**Why KZG?**
- Forward-compatible with full danksharding and data availability sampling
- Enables cheap point evaluation proofs (useful for fraud proofs)
- 48-byte commitment represents 128KB of data

---

## 2. Cost Analysis: Blobs vs Calldata vs Storage

### Current Pricing (as of Jan 2026)

| Method | Cost | Notes |
|--------|------|-------|
| **Contract Storage** | ~20,000 gas per 32 bytes | ~$0.50-5 per 32 bytes at typical gas prices |
| **Calldata** | 16 gas per byte | ~$0.01-0.10 per KB |
| **Blobs** | Separate blob gas market | ~$0.001-0.01 per KB (often much cheaper) |

### Blob Fee Market

Blobs have their own EIP-1559-style fee market:
- **Target:** 3 blobs per block (393,216 blob gas)
- **Max:** 6 blobs per block (786,432 blob gas)  
- **Gas per blob:** 131,072 (2^17)
- **Dynamic pricing:** Exponential adjustment based on usage

**Key Insight:** When blob usage is below target, prices can be extremely low. Early adoption = cheap data!

### Cost Comparison Example: 1MB of Data

```
Contract Storage: ~640,000 gas × $0.00001 = $6,400+ (impractical)
Calldata:        ~16,000,000 gas = ~$160-1,600
Blobs:           ~8 blobs = ~$0.08-8 (depending on demand)
```

**Blobs are 100-10,000x cheaper than calldata for large data!**

---

## 3. Data Availability & Persistence

### ⚠️ Critical Limitation: Blobs are Ephemeral

**Blobs are automatically pruned after ~18 days (4096 epochs)**

This is by design:
- Keeps beacon node storage manageable
- Blobs meant for data availability, not permanent storage
- ~2.5 TB/year at full capacity would be unsustainable otherwise

### What This Means for Social Apps

```
┌─────────────────────────────────────────────────────────┐
│                Timeline of Blob Data                      │
├─────────────────────────────────────────────────────────┤
│ T+0:      Blob submitted, fully available                │
│ T+18 days: Blob pruned from beacon nodes                 │
│ T+∞:      Only commitment hash remains on-chain forever  │
└─────────────────────────────────────────────────────────┘
```

### Data Preservation Strategies

Since Ethereum doesn't store blobs forever, you need secondary storage:

1. **Application-specific nodes** - Your app's nodes store relevant blobs
2. **BitTorrent** - Auto-distribute daily blob archives
3. **IPFS/Filecoin** - Content-addressed storage
4. **Portal Network** - Ethereum's light client network
5. **Blobscan/Explorers** - Already archiving all blobs
6. **User clients** - Users store data they care about

**Trust Model:** 1-of-N (only need ONE honest storer, not consensus)

---

## 4. Existing Blob Projects

### Who's Building on Blobs?

#### Rollups (Primary Use Case)
- **Optimism** - Uses blobs for L2 transaction batches
- **Arbitrum** - Migrated to blob data for DA
- **Base** - Coinbase's L2 uses blobs
- **zkSync, Scroll, Linea** - ZK rollups using blobs

#### Explorers & Infrastructure
- **Blobscan** ([blobscan.com](https://blobscan.com)) - First blob explorer
  - Archives all blob data
  - Provides blob decoding
  - Has API for querying blobs
  
#### Data/Content Projects
- **Ethscriptions** - Digital artifacts via calldata (could use blobs)
  - 6.3M ethscriptions created
  - 260K unique holders
  - Has AppChain (Stage 2 L2) for EVM compatibility

### Notable Absence: No Blob-Native Social Apps Yet! 🎯

This is greenfield territory. Rollups dominate blob usage. A social protocol would be novel.

---

## 5. Architecture for Blob-Based Social

### Design Principles

1. **Blobs for bulk data** - Posts, media, message batches
2. **On-chain for anchoring** - Commitments, identity, social graph edges
3. **Indexers for retrieval** - Query layer over blob data
4. **Client-side storage** - Users archive what they follow

### Proposed Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     USER LAYER                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Web App   │  │ Mobile App  │  │   CLI/Bot   │           │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘           │
│         └────────────────┼────────────────┘                   │
│                          ▼                                    │
├──────────────────────────────────────────────────────────────┤
│                    INDEXER LAYER                               │
│  ┌─────────────────────────────────────────────────┐         │
│  │  Social Graph Indexer                            │         │
│  │  - Watches blob transactions                     │         │
│  │  - Decodes post/message data                     │         │
│  │  - Maintains queryable state                     │         │
│  │  - Archives blob data before pruning             │         │
│  └─────────────────────────────────────────────────┘         │
├──────────────────────────────────────────────────────────────┤
│                   ETHEREUM LAYER                               │
│  ┌───────────────────┐  ┌───────────────────────────┐        │
│  │  Identity Contract │  │    Blob Transactions      │        │
│  │  (ERC-721 or ENS)  │  │  ┌─────────────────────┐  │        │
│  │  - User profiles   │  │  │ Post batches        │  │        │
│  │  - Public keys     │  │  │ Message bundles     │  │        │
│  │  - Follow edges    │  │  │ Media content       │  │        │
│  └───────────────────┘  │  │ Social graph updates │  │        │
│                         │  └─────────────────────┘  │        │
│                         └───────────────────────────┘        │
├──────────────────────────────────────────────────────────────┤
│                   STORAGE LAYER                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   IPFS   │  │ Filecoin │  │ Arweave  │  │  Custom  │      │
│  │ (hot)    │  │ (cold)   │  │ (perma)  │  │  Archive │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└──────────────────────────────────────────────────────────────┘
```

### Data Structures

#### Post Format (in blob)

```json
{
  "version": 1,
  "type": "post",
  "author": "0x1234...",           // Ethereum address
  "timestamp": 1706661600,
  "content": "Hello blob world!",
  "contentType": "text/plain",
  "replyTo": null,                 // Optional: blob hash of parent
  "signature": "0xabc..."          // Sign with author's key
}
```

#### Batch Format (multiple posts per blob)

```json
{
  "version": 1,
  "type": "batch",
  "posts": [
    { /* post 1 */ },
    { /* post 2 */ },
    // ... up to 128KB worth
  ],
  "merkleRoot": "0x..."           // For efficient proofs
}
```

#### Social Graph Updates

```json
{
  "version": 1,
  "type": "social_graph",
  "updates": [
    { "action": "follow", "from": "0x123", "to": "0x456", "sig": "0x..." },
    { "action": "unfollow", "from": "0x789", "to": "0xabc", "sig": "0x..." }
  ]
}
```

### Identity Integration

**Option 1: ERC-8004 (Trustless Agents)**
- On-chain identity registry (ERC-721 based)
- Reputation system built-in
- Supports multiple endpoints (A2A, MCP, etc.)
- Good for agent-to-agent social

**Option 2: ENS**
- Already widely adopted
- Reverse resolution for profiles
- Can store additional records

**Option 3: Custom Identity Contract**
- Simple mapping: address → profile hash
- Profile data in blobs
- Minimal on-chain footprint

### Message Encryption

For private messaging:
```
1. Alice publishes her public key (on-chain or in profile blob)
2. Bob encrypts message with Alice's public key
3. Bob posts encrypted message in blob
4. Only Alice can decrypt with her private key
```

---

## 6. Technical Requirements & Tooling

### Core Skills Needed

1. **Solidity** - For any on-chain contracts (identity, anchoring)
2. **TypeScript/JavaScript** - For client apps and indexers
3. **KZG Libraries** - For blob creation/verification
4. **P2P Networking** - For blob propagation/archival

### Key Libraries

#### Viem (Recommended)

```typescript
import { createWalletClient, http } from 'viem'
import { toBlobs, setupKzg, stringToHex } from 'viem'
import * as cKzg from 'c-kzg'
import { mainnetTrustedSetupPath } from 'viem/node'

// Setup KZG
const kzg = setupKzg(cKzg, mainnetTrustedSetupPath)

// Create blobs from data
const blobs = toBlobs({ data: stringToHex('your data here') })
```

#### c-kzg-4844

The official KZG implementation with bindings for:
- Node.js
- Go
- Rust  
- Python
- C#
- Java
- And more

```bash
npm install c-kzg
```

#### kzg-wasm

WebAssembly bindings for browser environments:
```bash
npm install kzg-wasm
```

### Infrastructure Needed

1. **Ethereum Node** (or RPC provider that supports blobs)
   - Needs `eth_sendRawTransaction` with blob support
   - `eth_getBlobSidecar` for retrieval
   
2. **Blob Indexer**
   - Watch for new blob transactions
   - Decode and store blob data
   - Archive before 18-day pruning

3. **Archive Storage**
   - IPFS node or pinning service
   - Arweave for permanent storage
   - Custom blob archive

---

## 7. Code Examples

### Sending a Blob Transaction (Viem)

```typescript
import { createWalletClient, http, parseGwei } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import { toBlobs, setupKzg, stringToHex } from 'viem'
import * as cKzg from 'c-kzg'
import { mainnetTrustedSetupPath } from 'viem/node'

// Setup
const kzg = setupKzg(cKzg, mainnetTrustedSetupPath)
const account = privateKeyToAccount('0x...')

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http()
})

// Create a social post
const post = {
  version: 1,
  type: 'post',
  author: account.address,
  timestamp: Date.now(),
  content: 'My first blob post!',
  contentType: 'text/plain'
}

// Convert to blob
const blobs = toBlobs({ 
  data: stringToHex(JSON.stringify(post)) 
})

// Send blob transaction
const hash = await walletClient.sendTransaction({
  blobs,
  kzg,
  maxFeePerBlobGas: parseGwei('30'),
  to: '0x0000000000000000000000000000000000000000', // Can be any address
})

console.log('Blob tx hash:', hash)
```

### Reading Blob Data

```typescript
// Using Blobscan API
async function getBlobData(txHash: string) {
  const response = await fetch(
    `https://api.blobscan.com/transactions/${txHash}`
  )
  const data = await response.json()
  return data.blobs
}

// Decoding blob content
function decodeBlobContent(blobHex: string) {
  // Remove trailing zeros (blobs are padded)
  const trimmed = blobHex.replace(/0+$/, '')
  const bytes = Buffer.from(trimmed.slice(2), 'hex')
  return JSON.parse(bytes.toString('utf8'))
}
```

### Simple Identity Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BlobSocialIdentity {
    struct Profile {
        bytes32 profileBlobHash;  // Versioned hash of profile blob
        bytes32 publicKey;        // For encrypted messaging
        uint256 lastUpdated;
    }
    
    mapping(address => Profile) public profiles;
    mapping(address => mapping(address => bool)) public following;
    
    event ProfileUpdated(address indexed user, bytes32 profileBlobHash);
    event Followed(address indexed follower, address indexed followed);
    event Unfollowed(address indexed follower, address indexed unfollowed);
    
    function updateProfile(bytes32 profileBlobHash, bytes32 publicKey) external {
        profiles[msg.sender] = Profile({
            profileBlobHash: profileBlobHash,
            publicKey: publicKey,
            lastUpdated: block.timestamp
        });
        emit ProfileUpdated(msg.sender, profileBlobHash);
    }
    
    function follow(address user) external {
        require(user != msg.sender, "Cannot follow yourself");
        following[msg.sender][user] = true;
        emit Followed(msg.sender, user);
    }
    
    function unfollow(address user) external {
        following[msg.sender][user] = false;
        emit Unfollowed(msg.sender, user);
    }
}
```

### Indexer Skeleton (Node.js)

```typescript
import { createPublicClient, http, parseAbiItem } from 'viem'
import { mainnet } from 'viem/chains'

const client = createPublicClient({
  chain: mainnet,
  transport: http()
})

// Watch for blob transactions to a specific contract
async function watchBlobPosts(contractAddress: string) {
  const unwatch = client.watchBlocks({
    onBlock: async (block) => {
      // Get full block with transactions
      const fullBlock = await client.getBlock({
        blockNumber: block.number,
        includeTransactions: true
      })
      
      for (const tx of fullBlock.transactions) {
        // Check if it's a blob transaction (type 3)
        if (tx.type === 'eip4844' && tx.to === contractAddress) {
          console.log('New blob post:', tx.hash)
          
          // Fetch blob data from beacon node or archive
          const blobData = await fetchBlobData(tx.hash)
          
          // Decode and store
          const post = decodeBlobContent(blobData)
          await storePost(post)
        }
      }
    }
  })
  
  return unwatch
}
```

---

## 8. Open Questions & Challenges

### Technical Challenges

1. **Blob Retrieval After Pruning**
   - Need robust archival strategy
   - Who pays for long-term storage?
   - How to ensure data survives?

2. **Blob Space Competition**
   - Rollups dominate blob space
   - During high demand, social posts may be expensive
   - May need batching strategies

3. **Real-time Messaging**
   - ~12 second block times
   - Not suitable for chat-like UX
   - Need L2 or off-chain for real-time

4. **Media Storage**
   - 128KB per blob = limited media
   - Need chunking for larger files
   - Images/video expensive even with blobs

### Design Decisions

1. **Centralized vs Decentralized Indexer**
   - Centralized = better UX, single point of failure
   - Decentralized = complex, but censorship-resistant

2. **On-chain vs Off-chain Social Graph**
   - On-chain = gas costs for every follow
   - Off-chain = cheaper but less verifiable

3. **Content Moderation**
   - Immutable posts = no deletion
   - How to handle spam/abuse?
   - Client-side filtering?

4. **Identity**
   - ENS? ERC-8004? Custom?
   - Pseudonymous vs verified?

### Economic Questions

1. **Sustainability**
   - Who pays for blob transactions?
   - User-pays vs protocol-subsidized?
   - How to prevent spam?

2. **Incentives**
   - Why would users adopt over Twitter/Farcaster?
   - What's the killer feature?

---

## 9. Verdict: Is This Buildable?

### ✅ YES, but with caveats

**Strengths:**
- Blobs are 100-10,000x cheaper than calldata
- True on-chain data availability
- Ethereum's security guarantees
- Novel approach (greenfield opportunity!)

**Weaknesses:**
- 18-day data expiry requires archival
- Not real-time (12s blocks)
- Limited blob space during congestion
- Complex indexer infrastructure needed

### Recommended Approach

1. **Start with a simple MVP**
   - Text-only posts
   - Basic follow graph
   - Single indexer

2. **Use scaffold-eth for rapid prototyping**
   - Austin's tool = perfect for this

3. **Consider L2 hybrid**
   - Blob for bulk data
   - L2 for real-time interactions

4. **Build archival from day 1**
   - IPFS for redundancy
   - User client storage

### The Pitch

> "Imagine Twitter, but your posts literally live on Ethereum. Not on someone's server that can go down. Not on a protocol that can be censored. Your social graph, your posts, your identity - all anchored to the most secure decentralized network in existence. The data layer literally cannot go down."

### Next Steps for Discussion with Clawd-15

1. What's the MVP feature set?
2. scaffold-eth integration strategy?
3. Indexer architecture decisions?
4. Identity approach (ENS? ERC-8004? Custom?)
5. Economic model for sustainability?

---

## References

- [EIP-4844 Spec](https://eips.ethereum.org/EIPS/eip-4844)
- [Proto-Danksharding FAQ (Vitalik)](https://notes.ethereum.org/@vbuterin/proto_danksharding_faq)
- [Viem Blob Transactions Guide](https://viem.sh/docs/guides/blob-transactions)
- [Blobscan Explorer](https://blobscan.com)
- [c-kzg-4844](https://github.com/ethereum/c-kzg-4844)
- [ERC-8004 Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)
- [Ethscriptions](https://docs.ethscriptions.com)

---

*Research compiled for Clawd, January 2026*
