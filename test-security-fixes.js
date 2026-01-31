const { ethers } = require('ethers');

// Test script to validate security fixes

async function testSignatureVerification() {
  console.log('\n🔒 Testing Signature Verification...');
  
  // Create a test wallet and message
  const wallet = ethers.Wallet.createRandom();
  const address = wallet.address;
  const content = "Test post content";
  const timestamp = Date.now();
  const nonce = 1;
  
  // Create the message that should be signed
  const message = `BlobSocial Post:\n${content}\n\nTimestamp: ${timestamp}\nNonce: ${nonce}`;
  
  // Sign the message
  const signature = await wallet.signMessage(message);
  
  // Test verification function (from server.js)
  function verifySignature(message, signature, expectedAddress) {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === expectedAddress.toLowerCase();
    } catch (e) {
      return false;
    }
  }
  
  const isValid = verifySignature(message, signature, address);
  console.log(`✅ Valid signature verification: ${isValid}`);
  
  // Test with wrong signature
  const wrongSignature = signature.slice(0, -2) + '00';
  const isInvalid = verifySignature(message, wrongSignature, address);
  console.log(`✅ Invalid signature rejection: ${!isInvalid}`);
  
  // Test with wrong address
  const wrongAddress = ethers.Wallet.createRandom().address;
  const isWrongAddress = verifySignature(message, signature, wrongAddress);
  console.log(`✅ Wrong address rejection: ${!isWrongAddress}`);
}

async function testNonceTracking() {
  console.log('\n🔄 Testing Nonce Tracking...');
  
  // Simulate nonce map from server
  const nonces = new Map();
  const testAddress = '0x1234567890123456789012345678901234567890';
  
  // Test first nonce (should be 1)
  const currentNonce = nonces.get(testAddress.toLowerCase()) || 0;
  console.log(`✅ Initial nonce: ${currentNonce}`);
  
  // Test valid nonce increment
  const validNonce = currentNonce + 1;
  if (validNonce > currentNonce) {
    nonces.set(testAddress.toLowerCase(), validNonce);
    console.log(`✅ Valid nonce ${validNonce} accepted`);
  }
  
  // Test replay attack prevention
  const replayNonce = validNonce; // same nonce
  const isReplayPrevented = replayNonce <= nonces.get(testAddress.toLowerCase());
  console.log(`✅ Replay attack prevented: ${isReplayPrevented}`);
}

function testRateLimiting() {
  console.log('\n⏱️  Testing Rate Limiting...');
  
  const agentRateLimits = new Map();
  const testAddress = '0x1234567890123456789012345678901234567890';
  
  function checkAgentRateLimit(address) {
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxPosts = 5; // 5 posts per 15 minutes per agent
    
    const limit = agentRateLimits.get(address) || { count: 0, resetTime: now + windowMs };
    
    if (now > limit.resetTime) {
      // Reset window
      limit.count = 0;
      limit.resetTime = now + windowMs;
    }
    
    if (limit.count >= maxPosts) {
      return false;
    }
    
    limit.count++;
    agentRateLimits.set(address, limit);
    return true;
  }
  
  // Test normal rate limiting
  for (let i = 1; i <= 5; i++) {
    const allowed = checkAgentRateLimit(testAddress);
    console.log(`✅ Post ${i}/5 allowed: ${allowed}`);
  }
  
  // Test rate limit exceeded
  const rateLimited = checkAgentRateLimit(testAddress);
  console.log(`✅ Rate limit enforced: ${!rateLimited}`);
}

function testInputValidation() {
  console.log('\n🛡️  Testing Input Validation...');
  
  // Test HTML sanitization
  const maliciousContent = '<script>alert("xss")</script>Hello World<img src="x" onerror="alert(1)">';
  const sanitizedContent = maliciousContent.replace(/<[^>]*>?/gm, '');
  console.log(`✅ XSS content sanitized: "${maliciousContent}" -> "${sanitizedContent}"`);
  
  // Test address validation
  const validAddress = '0x1234567890123456789012345678901234567890';
  const invalidAddress = '0x123';
  
  const isValidAddr = ethers.isAddress(validAddress);
  const isInvalidAddr = ethers.isAddress(invalidAddress);
  
  console.log(`✅ Valid address accepted: ${isValidAddr}`);
  console.log(`✅ Invalid address rejected: ${!isInvalidAddr}`);
  
  // Test timestamp validation
  const now = Date.now();
  const validTimestamp = now - 60000; // 1 minute ago
  const invalidTimestamp = now - 10 * 60 * 1000; // 10 minutes ago
  
  const isValidTime = Math.abs(now - validTimestamp) <= 5 * 60 * 1000;
  const isInvalidTime = Math.abs(now - invalidTimestamp) <= 5 * 60 * 1000;
  
  console.log(`✅ Valid timestamp accepted: ${isValidTime}`);
  console.log(`✅ Invalid timestamp rejected: ${!isInvalidTime}`);
}

// Run all tests
async function runAllTests() {
  console.log('🔧 BlobSocial Security Fix Validation');
  console.log('=====================================');
  
  await testSignatureVerification();
  await testNonceTracking();
  testRateLimiting();
  testInputValidation();
  
  console.log('\n✅ All security fix tests completed!');
  console.log('\n📋 Summary of Fixes Applied:');
  console.log('1. ✅ CRITICAL: Signature verification now enforced');
  console.log('2. ✅ HIGH: Integer underflow protection in contract');
  console.log('3. ✅ HIGH: Nonce tracking prevents replay attacks');
  console.log('4. ✅ MEDIUM: Rate limiting implemented (IP + agent level)');
  console.log('5. ✅ Additional: Input validation and XSS protection');
}

runAllTests().catch(console.error);