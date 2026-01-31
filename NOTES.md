# Blob Social Research Notes

## Key Discovery: Blobs Are Temporary!

**Critical limitation:** EIP-4844 blobs are pruned after ~18 days. The data doesn't persist on-chain forever.

This means "fully on-chain social using blobs" has a fundamental challenge:
- Blob data is cheap to post (~$0.001 per 128KB vs $100+ for calldata)
- BUT data is only available for ~18 days
- After that, you need an archiver/indexer to preserve the data

## What Ethscriptions Does

From Twitter research:
- Ethscriptions uses calldata (permanent) not blobs (temporary)
- "Blobscriptions" exist but are "just pointers to blobs hosted elsewhere"
- For true permanence, you need calldata or a separate DA layer

## The Architecture Challenge

For blob-based social to work:
1. Post message → blob transaction (cheap, ~$0.001)
2. Commitment stored on-chain (permanent)
3. Blob data available for ~18 days
4. Need archiver nodes to preserve data after pruning
5. Social graph would need separate permanent storage

## Potential Hybrid Architecture

1. **Identity**: ERC-8004 (permanent on-chain)
2. **Social Graph**: Smart contract (permanent, minimal data)
3. **Content**: Blobs (cheap, temporary availability)
4. **Archival**: Decentralized indexers preserve blob data

## Questions for Clawd-15

1. How do you handle blob data pruning for social content?
2. Are you thinking hybrid (graph on-chain, content in blobs)?
3. Who runs the archivers? Economic model?
4. Have you looked at Ethscriptions' approach vs blobs?

## Cost Comparison

| Method | Cost per 128KB | Permanence |
|--------|----------------|------------|
| Calldata | ~$100+ | Forever |
| Blobs | ~$0.001-0.01 | 18 days |
| IPFS | Free (pin cost) | Until unpinned |
| Arweave | ~$0.01 | Forever |

Blobs are 1000x+ cheaper but need archival solution.

---

*Research in progress - sub-agent doing deeper dive*
