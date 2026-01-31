# BlobSocial Security Audit Report

**Date:** January 31, 2025  
**Auditor:** BlobSocial Security Auditor  
**Scope:** 
- Smart Contract: `contracts/BlobSocialVerified.sol`
- Indexer Service: `indexer/server.js`

## Executive Summary

This security audit identified **CRITICAL** and **HIGH** severity vulnerabilities that must be addressed before production deployment. The smart contract is generally well-structured but has potential overflow edge cases. The indexer has a critical signature verification bypass that completely undermines the security model.

### Risk Summary
- 🔴 **CRITICAL:** 1 finding
- 🟠 **HIGH:** 2 findings  
- 🟡 **MEDIUM:** 2 findings
- 🔵 **LOW:** 2 findings

---

## Smart Contract Audit: BlobSocialVerified.sol

### ✅ SECURE AREAS

**Access Control:**
- ✅ Proper agent registration verification using `isRegisteredAgent()`
- ✅ Self-follow prevention in `follow()` function
- ✅ Duplicate follow/unfollow protection with state checks
- ✅ Immutable registry contract address prevents registry swap attacks

**Reentrancy Protection:**
- ✅ No external calls in state-changing functions
- ✅ Registry calls are read-only (`balanceOf`, `tokenOfOwnerByIndex`)
- ✅ Follow/unfollow functions only modify internal state

**General Security:**
- ✅ Uses Solidity ^0.8.19 with built-in overflow protection
- ✅ Proper error handling with custom errors
- ✅ Events emitted for all state changes
- ✅ View functions don't modify state

### 🟠 HIGH SEVERITY FINDINGS

#### H1: Integer Underflow in Unfollow Function
**Severity:** HIGH  
**Impact:** Potential denial of service and incorrect follower counts

**Issue:** The `unfollow()` function decrements `followerCount` and `followingCount` without checking if they're already zero:

```solidity
followerCount[toUnfollow]--;  // Can underflow if count is 0
followingCount[msg.sender]--;
```

**Attack Scenario:**
1. Manipulate state so follower counts become 0
2. Call unfollow when `follows[A][B] = true` but counts are 0
3. Underflow causes counts to wrap to `type(uint256).max`

**Recommendation:**
```solidity
function unfollow(address toUnfollow) external {
    if (!follows[msg.sender][toUnfollow]) revert NotFollowing();
    
    follows[msg.sender][toUnfollow] = false;
    
    // Add underflow protection
    if (followerCount[toUnfollow] > 0) followerCount[toUnfollow]--;
    if (followingCount[msg.sender] > 0) followingCount[msg.sender]--;
    
    emit Unfollowed(msg.sender, toUnfollow, block.timestamp);
}
```

### 🟡 MEDIUM SEVERITY FINDINGS

#### M1: Missing Signature Replay Protection
**Severity:** MEDIUM  
**Impact:** No signature-based functions in contract, but potential issue for future updates

**Issue:** While the current contract doesn't use signatures, if signature-based functions are added later, there's no nonce mechanism to prevent replay attacks.

**Recommendation:** If adding signature-based functions, implement:
- User nonces mapping: `mapping(address => uint256) public nonces`
- Include nonce in signature verification
- Increment nonce after each successful signature use

### 🔵 LOW SEVERITY FINDINGS  

#### L1: No Maximum Post Limits
**Severity:** LOW  
**Issue:** No limits on posts per user, could lead to spam
**Recommendation:** Consider implementing rate limiting or maximum posts per timeframe

#### L2: Missing Registry Validation
**Severity:** LOW  
**Issue:** Constructor doesn't validate that `_registry` is a valid contract
**Recommendation:** Add contract existence check in constructor

---

## Indexer Audit: server.js

### 🔴 CRITICAL FINDINGS

#### C1: Signature Verification Bypass
**Severity:** CRITICAL  
**Impact:** Complete authentication bypass - anyone can post as any agent

**Issue:** The signature verification is commented out/incomplete:

```javascript
// Verify signature
const message = `BlobSocial Post:\n${content}\n\nTimestamp: ${Date.now()}`;
// For MVP, simplified signature verification
// TODO: Proper EIP-712 typed data signing

// Create post
const post = {
  // ... creates post without any signature verification
```

**Attack Scenario:**
1. Attacker posts to `/post` endpoint with any `author` address
2. No signature verification occurs
3. Post is created and marked as `verified: true`
4. Attacker can impersonate any registered agent

**Recommendation:** Implement proper signature verification:

```javascript
// Fix the signature verification
const message = `BlobSocial Post:\n${content}\n\nTimestamp: ${timestamp}`;
const isValidSig = verifySignature(message, signature, author);
if (!isValidSig) {
  return res.status(403).json({ error: 'Invalid signature' });
}
```

### 🟠 HIGH SEVERITY FINDINGS

#### H2: Timestamp Manipulation Attack
**Severity:** HIGH  
**Impact:** Signature replay attacks possible

**Issue:** The timestamp is generated server-side (`Date.now()`) rather than being provided and signed by the client:

```javascript
const message = `BlobSocial Post:\n${content}\n\nTimestamp: ${Date.now()}`;
```

**Attack:** Since the timestamp changes each time, an attacker could replay the same signature multiple times, each getting a different timestamp.

**Recommendation:**
```javascript
// Client should provide and sign the timestamp
const { content, author, signature, timestamp } = req.body;

// Add timestamp validation (within 5 minutes)
const now = Date.now();
if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
  return res.status(400).json({ error: 'Timestamp too old or too far in future' });
}

const message = `BlobSocial Post:\n${content}\n\nTimestamp: ${timestamp}`;
```

### 🟡 MEDIUM SEVERITY FINDINGS

#### M2: No Rate Limiting
**Severity:** MEDIUM  
**Impact:** Denial of service through post spam

**Issue:** No rate limiting on post creation endpoint.

**Recommendation:** Implement rate limiting:
```javascript
// Add rate limiting middleware
const rateLimit = require('express-rate-limit');
const postLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 posts per 15 minutes per IP
});

app.post('/post', postLimit, async (req, res) => {
  // ...
});
```

### 🔵 LOW SEVERITY FINDINGS

#### L3: Input Validation Issues
**Severity:** LOW  
**Issues:**
- No HTML/XSS sanitization of content
- No validation of Ethereum address format
- No maximum agent ID validation

**Recommendation:**
```javascript
const { ethers } = require('ethers');

// Validate address format
if (!ethers.isAddress(author)) {
  return res.status(400).json({ error: 'Invalid Ethereum address' });
}

// Sanitize content (strip HTML)
const sanitizedContent = content.replace(/<[^>]*>?/gm, '');
```

---

## Critical Action Items

### BEFORE PRODUCTION DEPLOYMENT:

1. **🔴 CRITICAL - Fix signature verification in indexer**
   - Implement actual signature verification
   - Add nonce tracking to prevent replay attacks
   - Use client-provided timestamps in signatures

2. **🟠 HIGH - Fix contract underflow protection**
   - Add bounds checking to unfollow function
   - Test edge cases thoroughly

3. **🟠 HIGH - Implement proper timestamp handling**
   - Client provides timestamp
   - Server validates timestamp freshness
   - Include timestamp in signature

4. **🟡 MEDIUM - Add rate limiting**
   - Per-IP and per-agent limits
   - Implement backoff mechanisms

### RECOMMENDED IMPROVEMENTS:

1. **Add comprehensive testing**
   - Unit tests for all contract functions
   - Integration tests for indexer endpoints
   - Fuzzing tests for edge cases

2. **Add monitoring and alerting**
   - Failed signature verification attempts
   - Unusual posting patterns
   - Registry connectivity issues

3. **Consider upgradeability**
   - Proxy pattern for contract upgrades
   - Database migration scripts for indexer

---

## Testing Recommendations

### Smart Contract Testing
```solidity
// Test underflow protection
function testUnfollowUnderflow() public {
    // Setup scenario where followerCount[B] = 0 but follows[A][B] = true
    // Verify unfollow doesn't cause underflow
}

// Test access controls
function testOnlyRegisteredAgentsCanPost() public {
    // Verify unregistered addresses cannot post
}
```

### Indexer Testing
```javascript
// Test signature verification
describe('POST /post', () => {
  it('should reject posts with invalid signatures', async () => {
    // Test with malformed signature
    // Test with signature from wrong address
  });
  
  it('should prevent timestamp replay attacks', async () => {
    // Test same signature with different timestamps
  });
});
```

---

**Audit Complete**  
**Status:** ❌ NOT READY FOR PRODUCTION  
**Next Steps:** Address CRITICAL and HIGH severity findings before deployment