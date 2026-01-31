#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs').promises;

// Known ERC-8004 deployments from research
const KNOWN_REGISTRIES = [
  {
    name: "Phala Network TEE Agent (Sepolia)",
    network: "sepolia",
    rpc: "https://eth-sepolia.g.alchemy.com/v2/demo",
    contracts: {
      IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
      ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713"
    }
  },
  // The original address from the request (might not be ERC-8004)
  {
    name: "Unknown Registry (Mainnet)",
    network: "mainnet",
    rpc: "https://eth.llamarpc.com",
    contracts: {
      Unknown: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    }
  }
];

// Basic ERC-8004 ABI based on the specification
const ERC8004_IDENTITY_ABI = [
  // Events
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  
  // Read functions
  "function totalSupply() external view returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function getMetadata(uint256 agentId, string memory metadataKey) external view returns (bytes memory)",
  "function getAgentWallet(uint256 agentId) external view returns (address)"
];

async function createProvider(rpcUrl) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    await provider.getBlockNumber();
    return provider;
  } catch (error) {
    throw new Error(`Failed to connect to ${rpcUrl}: ${error.message}`);
  }
}

async function analyzeContract(registry, contractAddr, provider) {
  console.log(`\n📋 Analyzing: ${registry.name}`);
  console.log(`🔗 Contract: ${contractAddr}`);
  console.log(`🌐 Network: ${registry.network}`);
  
  // Check if contract exists
  const code = await provider.getCode(contractAddr);
  if (code === '0x') {
    console.log("❌ No contract code found at this address");
    return null;
  }
  
  console.log("✅ Contract exists");
  
  try {
    const contract = new ethers.Contract(contractAddr, ERC8004_IDENTITY_ABI, provider);
    
    // Try to get basic info
    const currentBlock = await provider.getBlockNumber();
    const analysis = {
      contractAddress: contractAddr,
      network: registry.network,
      exists: true,
      currentBlock: currentBlock
    };
    
    // Try ERC-8004 specific calls
    try {
      const totalSupply = await contract.totalSupply();
      analysis.totalSupply = totalSupply.toString();
      console.log(`📊 Total registered agents: ${totalSupply}`);
    } catch (e) {
      console.log("ℹ️  totalSupply() not available (might not be ERC-721)");
    }
    
    // Check for recent registration events
    try {
      const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10k blocks
      console.log(`🔍 Searching for events from block ${fromBlock}...`);
      
      const registeredFilter = contract.filters.Registered();
      const registeredEvents = await contract.queryFilter(registeredFilter, fromBlock);
      
      analysis.recentRegistrations = registeredEvents.length;
      console.log(`📅 Recent registrations (last 10k blocks): ${registeredEvents.length}`);
      
      if (registeredEvents.length > 0) {
        console.log("🎯 Recent registrations:");
        registeredEvents.slice(-5).forEach((event, i) => {
          console.log(`   ${i + 1}. Agent ID: ${event.args.agentId}, Owner: ${event.args.owner}`);
          console.log(`      Block: ${event.blockNumber}, URI: ${event.args.agentURI}`);
        });
        analysis.sampleAgents = registeredEvents.slice(-5).map(e => ({
          agentId: e.args.agentId.toString(),
          owner: e.args.owner,
          agentURI: e.args.agentURI,
          blockNumber: e.blockNumber
        }));
      }
      
    } catch (e) {
      console.log(`⚠️  Could not query events: ${e.message}`);
    }
    
    return analysis;
    
  } catch (error) {
    console.log(`❌ Error analyzing contract: ${error.message}`);
    return { contractAddress: contractAddr, network: registry.network, exists: true, error: error.message };
  }
}

async function fetchAgentMetadata(uri, agentId) {
  if (!uri) return null;
  
  try {
    // Handle different URI schemes
    let fetchUri = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUri = `https://ipfs.io/ipfs/${uri.substring(7)}`;
    }
    
    const response = await fetch(fetchUri, { 
      timeout: 3000,
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const metadata = await response.json();
    
    // Extract contact info
    const contacts = {};
    if (metadata.services) {
      metadata.services.forEach(service => {
        if (service.name === 'email' || service.name === 'twitter' || service.name === 'github') {
          contacts[service.name] = service.endpoint;
        }
      });
    }
    
    return {
      name: metadata.name,
      description: metadata.description,
      contacts: contacts,
      supportedTrust: metadata.supportedTrust || [],
      services: metadata.services?.map(s => ({ name: s.name, endpoint: s.endpoint })) || []
    };
  } catch (error) {
    console.log(`   ⚠️  Failed to fetch metadata for agent ${agentId}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log("🔎 ERC-8004 Agent Registry Analysis");
  console.log("===================================");
  
  const results = [];
  
  for (const registry of KNOWN_REGISTRIES) {
    try {
      const provider = await createProvider(registry.rpc);
      
      for (const [contractType, address] of Object.entries(registry.contracts)) {
        const analysis = await analyzeContract(registry, address, provider);
        if (analysis) {
          analysis.contractType = contractType;
          results.push(analysis);
          
          // If this is an identity registry with agents, fetch some metadata
          if (analysis.sampleAgents && analysis.sampleAgents.length > 0) {
            console.log("\n🔍 Fetching agent metadata...");
            for (const agent of analysis.sampleAgents.slice(0, 3)) {
              const metadata = await fetchAgentMetadata(agent.agentURI, agent.agentId);
              if (metadata) {
                agent.metadata = metadata;
                console.log(`   ✅ Agent ${agent.agentId}: ${metadata.name}`);
                if (Object.keys(metadata.contacts).length > 0) {
                  console.log(`      📞 Contacts: ${Object.entries(metadata.contacts).map(([k,v]) => `${k}: ${v}`).join(', ')}`);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.log(`❌ Failed to analyze ${registry.name}: ${error.message}`);
    }
  }
  
  // Save results
  const outputPath = "erc8004-analysis.json";
  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to ${outputPath}`);
  
  return results;
}

main().catch(console.error);