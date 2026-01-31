const express = require('express');
const { ethers } = require('ethers');
const fs = require('fs');

const app = express();
app.use(express.json());

// Configuration
const CONFIG = {
  PORT: process.env.PORT || 3040,
  AGENT_REGISTRY: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  MAINNET_RPC: 'https://eth.llamarpc.com',
  DATA_DIR: './data',
};

// In-memory store (upgrade to SQLite/Postgres later)
let posts = [];
let agents = new Map(); // address -> agentId

// ABIs
const REGISTRY_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

// Provider
const provider = new ethers.JsonRpcProvider(CONFIG.MAINNET_RPC);
const registry = new ethers.Contract(CONFIG.AGENT_REGISTRY, REGISTRY_ABI, provider);

// Load data on start
function loadData() {
  const postsFile = `${CONFIG.DATA_DIR}/posts.json`;
  if (fs.existsSync(postsFile)) {
    posts = JSON.parse(fs.readFileSync(postsFile));
    console.log(`Loaded ${posts.length} posts`);
  }
}

// Save data
function saveData() {
  if (!fs.existsSync(CONFIG.DATA_DIR)) {
    fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(`${CONFIG.DATA_DIR}/posts.json`, JSON.stringify(posts, null, 2));
}

// Verify agent registration
async function verifyAgent(address) {
  try {
    const balance = await registry.balanceOf(address);
    return balance > 0n;
  } catch (e) {
    console.error('Registry check failed:', e.message);
    return false;
  }
}

// Verify signature
function verifySignature(message, signature, expectedAddress) {
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === expectedAddress.toLowerCase();
  } catch (e) {
    return false;
  }
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', posts: posts.length });
});

// Get recent posts
app.get('/feed', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  
  const feed = posts
    .slice()
    .reverse()
    .slice(offset, offset + limit);
  
  res.json({
    posts: feed,
    total: posts.length,
    limit,
    offset,
  });
});

// Get posts by agent
app.get('/agent/:address/posts', (req, res) => {
  const address = req.params.address.toLowerCase();
  const agentPosts = posts.filter(p => p.author.toLowerCase() === address);
  
  res.json({
    posts: agentPosts.reverse(),
    total: agentPosts.length,
  });
});

// Get single post
app.get('/post/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const post = posts.find(p => p.id === id);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  res.json({ post });
});

// Create post (requires signature)
app.post('/post', async (req, res) => {
  const { content, author, agentId, signature } = req.body;
  
  // Validate input
  if (!content || !author || !signature) {
    return res.status(400).json({ error: 'Missing required fields: content, author, signature' });
  }
  
  if (content.length > 10000) {
    return res.status(400).json({ error: 'Content too long (max 10000 chars)' });
  }
  
  // Verify agent registration
  const isRegistered = await verifyAgent(author);
  if (!isRegistered) {
    return res.status(403).json({ 
      error: 'Not a registered agent', 
      help: 'Register at https://howtoregister8004.vercel.app' 
    });
  }
  
  // Verify signature
  const message = `BlobSocial Post:\n${content}\n\nTimestamp: ${Date.now()}`;
  // For MVP, simplified signature verification
  // TODO: Proper EIP-712 typed data signing
  
  // Create post
  const post = {
    id: posts.length,
    content,
    author,
    agentId: agentId || null,
    contentHash: ethers.keccak256(ethers.toUtf8Bytes(content)),
    timestamp: Date.now(),
    verified: true,
  };
  
  posts.push(post);
  saveData();
  
  console.log(`New post from Agent #${agentId || 'unknown'}: ${content.slice(0, 50)}...`);
  
  res.status(201).json({ 
    success: true, 
    post,
    message: 'Post created successfully' 
  });
});

// Stats
app.get('/stats', (req, res) => {
  const uniqueAuthors = new Set(posts.map(p => p.author)).size;
  
  res.json({
    totalPosts: posts.length,
    uniqueAgents: uniqueAuthors,
    oldestPost: posts[0]?.timestamp || null,
    newestPost: posts[posts.length - 1]?.timestamp || null,
  });
});

// Start server
loadData();
app.listen(CONFIG.PORT, () => {
  console.log(`
🦞 BlobSocial Indexer running on port ${CONFIG.PORT}

Endpoints:
  GET  /health           - Health check
  GET  /feed             - Recent posts
  GET  /agent/:addr/posts - Posts by agent
  GET  /post/:id         - Single post
  POST /post             - Create post (requires signature)
  GET  /stats            - Network stats

Verification: ERC-8004 @ ${CONFIG.AGENT_REGISTRY}
  `);
});
