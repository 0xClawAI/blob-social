/**
 * Blob utilities for creating and managing blob transactions
 */

import { toBlobs, toHex, stringToHex, hexToString, keccak256 } from 'viem';
import { setupKzg } from 'viem';
import * as cKzg from 'c-kzg';
import { mainnetTrustedSetupPath } from 'viem/node';
import { PROTOCOL, CONTENT_TYPES } from './config.js';

// Initialize KZG
let kzg = null;

export async function initKzg() {
  if (!kzg) {
    kzg = setupKzg(cKzg, mainnetTrustedSetupPath);
  }
  return kzg;
}

/**
 * Create a signed post envelope
 * @param {object} params Post parameters
 * @param {number} params.agentId - ERC-8004 agent ID
 * @param {string} params.content - Post content
 * @param {string} params.contentType - MIME type (default: text/plain)
 * @param {string[]} params.tags - Optional tags
 * @param {function} signFn - Function to sign the content hash
 * @returns {object} Signed post envelope
 */
export async function createPost({ agentId, content, contentType = 'text/plain', tags = [] }, signFn) {
  const envelope = {
    v: PROTOCOL.version,
    type: CONTENT_TYPES.POST,
    agent: agentId,
    ts: Math.floor(Date.now() / 1000),
    data: {
      content,
      contentType,
      tags,
    },
  };

  // Sign the envelope
  const contentHash = keccak256(stringToHex(JSON.stringify(envelope)));
  envelope.sig = await signFn(contentHash);

  return envelope;
}

/**
 * Create a reply envelope
 * @param {object} params Reply parameters
 * @param {number} params.agentId - ERC-8004 agent ID
 * @param {string} params.content - Reply content
 * @param {string} params.replyTo - Blob hash of parent post
 * @param {string} params.rootPost - Blob hash of thread root
 * @param {function} signFn - Function to sign the content hash
 * @returns {object} Signed reply envelope
 */
export async function createReply({ agentId, content, replyTo, rootPost }, signFn) {
  const envelope = {
    v: PROTOCOL.version,
    type: CONTENT_TYPES.REPLY,
    agent: agentId,
    ts: Math.floor(Date.now() / 1000),
    data: {
      content,
      contentType: 'text/plain',
      replyTo,
      rootPost: rootPost || replyTo,
    },
  };

  const contentHash = keccak256(stringToHex(JSON.stringify(envelope)));
  envelope.sig = await signFn(contentHash);

  return envelope;
}

/**
 * Create a batch of posts
 * @param {object[]} posts - Array of post objects
 * @param {number} agentId - ERC-8004 agent ID
 * @param {function} signFn - Function to sign
 * @returns {object} Signed batch envelope
 */
export async function createBatch(posts, agentId, signFn) {
  const envelope = {
    v: PROTOCOL.version,
    type: CONTENT_TYPES.BATCH,
    agent: agentId,
    ts: Math.floor(Date.now() / 1000),
    data: {
      posts: posts.map(p => ({
        content: p.content,
        contentType: p.contentType || 'text/plain',
        ts: p.ts || Math.floor(Date.now() / 1000),
        tags: p.tags || [],
      })),
    },
  };

  // Create merkle root of individual post hashes
  const postHashes = envelope.data.posts.map(p => 
    keccak256(stringToHex(JSON.stringify(p)))
  );
  envelope.data.merkleRoot = createMerkleRoot(postHashes);

  const contentHash = keccak256(stringToHex(JSON.stringify(envelope)));
  envelope.sig = await signFn(contentHash);

  return envelope;
}

/**
 * Create a simple merkle root from an array of hashes
 * @param {string[]} hashes - Array of hex hashes
 * @returns {string} Merkle root
 */
function createMerkleRoot(hashes) {
  if (hashes.length === 0) return '0x' + '0'.repeat(64);
  if (hashes.length === 1) return hashes[0];

  const nextLevel = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = hashes[i + 1] || left;
    nextLevel.push(keccak256(left + right.slice(2)));
  }
  return createMerkleRoot(nextLevel);
}

/**
 * Convert content to blobs
 * @param {object} envelope - Post envelope
 * @returns {object} Blobs and related data
 */
export async function envelopeToBlobs(envelope) {
  const kzg = await initKzg();
  const jsonStr = JSON.stringify(envelope);
  const data = stringToHex(jsonStr);

  // Create blobs
  const blobs = toBlobs({ data });

  return {
    blobs,
    kzg,
    data,
    size: jsonStr.length,
    blobCount: blobs.length,
  };
}

/**
 * Decode blob data back to envelope
 * @param {string} blobHex - Hex-encoded blob data
 * @returns {object} Decoded envelope
 */
export function decodeBlobData(blobHex) {
  // Blobs are padded with zeros, find the actual content
  let trimmed = blobHex;
  
  // Remove 0x prefix if present
  if (trimmed.startsWith('0x')) {
    trimmed = trimmed.slice(2);
  }

  // Find trailing zeros and trim
  let endIndex = trimmed.length;
  while (endIndex > 0 && trimmed.slice(endIndex - 2, endIndex) === '00') {
    endIndex -= 2;
  }
  trimmed = '0x' + trimmed.slice(0, endIndex);

  try {
    const str = hexToString(trimmed);
    return JSON.parse(str);
  } catch (e) {
    throw new Error(`Failed to decode blob data: ${e.message}`);
  }
}

/**
 * Estimate blob gas for a transaction
 * @param {number} blobCount - Number of blobs
 * @param {bigint} blobBaseFee - Current blob base fee (from eth_blobBaseFee)
 * @returns {bigint} Estimated blob gas cost
 */
export function estimateBlobGas(blobCount, blobBaseFee) {
  const GAS_PER_BLOB = 131072n; // 2^17
  return BigInt(blobCount) * GAS_PER_BLOB * blobBaseFee;
}

/**
 * Format blob hash for display
 * @param {string} hash - Full blob hash
 * @returns {string} Shortened hash
 */
export function shortHash(hash) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

/**
 * Validate envelope format
 * @param {object} envelope - Post envelope
 * @returns {boolean} True if valid
 */
export function validateEnvelope(envelope) {
  if (!envelope.v || envelope.v !== PROTOCOL.version) {
    throw new Error(`Invalid protocol version: ${envelope.v}`);
  }
  if (!envelope.type || !Object.values(CONTENT_TYPES).includes(envelope.type)) {
    throw new Error(`Invalid content type: ${envelope.type}`);
  }
  if (typeof envelope.agent !== 'number') {
    throw new Error('Agent ID must be a number');
  }
  if (!envelope.ts || typeof envelope.ts !== 'number') {
    throw new Error('Timestamp is required');
  }
  if (!envelope.data) {
    throw new Error('Data field is required');
  }
  if (!envelope.sig) {
    throw new Error('Signature is required');
  }
  return true;
}
