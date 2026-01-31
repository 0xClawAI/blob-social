#!/usr/bin/env node

const { ethers } = require('ethers');
const fs = require('fs').promises;
const path = require('path');

// ERC-8004 registry contract address
const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// Basic ERC-8004 ABI - we need the registration events and metadata functions
const REGISTRY_ABI = [
  // Registration event
  "event AgentRegistered(bytes32 indexed agentId, address indexed owner, string metadataURI)",
  
  // Functions to query agent data
  "function getAgent(bytes32 agentId) external view returns (address owner, string memory metadataURI, bool active)",
  "function getAllAgents() external view returns (bytes32[] memory)",
];

// Setup provider - using public RPC endpoints with fallbacks
const RPC_URLS = [
  'https://eth.llamarpc.com',
  'https://rpc.ankr.com/eth',
  'https://ethereum.publicnode.com',
  'https://eth-mainnet.g.alchemy.com/v2/demo'
];

async function createProvider() {
  for (const url of RPC_URLS) {
    try {
      console.log(`Trying RPC endpoint: ${url}`);
      const provider = new ethers.JsonRpcProvider(url, null, {
        staticNetwork: ethers.Network.from(1),
        timeout: 10000
      });
      
      // Test the connection
      await provider.getBlockNumber();
      console.log(`Successfully connected to ${url}`);
      return provider;
    } catch (error) {
      console.log(`Failed to connect to ${url}: ${error.message}`);
    }
  }
  throw new Error('Could not connect to any RPC endpoint');
}

async function fetchMetadata(uri) {
  if (!uri) return null;
  
  try {
    // Handle IPFS URLs with multiple gateways
    if (uri.startsWith('ipfs://')) {
      const hash = uri.substring(7);
      const gateways = [
        `https://ipfs.io/ipfs/${hash}`,
        `https://gateway.pinata.cloud/ipfs/${hash}`,
        `https://cloudflare-ipfs.com/ipfs/${hash}`
      ];
      
      for (const gateway of gateways) {
        try {
          const response = await fetch(gateway, { 
            timeout: 3000,
            headers: { 'Accept': 'application/json' }
          });
          if (response.ok) {
            return await response.json();
          }
        } catch (err) {
          continue;
        }
      }
      throw new Error('All IPFS gateways failed');
    }
    
    const response = await fetch(uri, { 
      timeout: 3000,
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.log(`Failed to fetch metadata from ${uri}:`, error.message);
    return null;
  }
}

function extractContactInfo(metadata) {
  if (!metadata) return {};
  
  const contacts = {};
  
  // Look for common contact fields in metadata
  const fields = ['twitter', 'github', 'website', 'contact', 'homepage', 'social'];
  
  for (const field of fields) {
    if (metadata[field]) {
      contacts[field] = metadata[field];
    }
  }
  
  // Check nested objects
  if (metadata.social) {
    if (metadata.social.twitter) contacts.twitter = metadata.social.twitter;
    if (metadata.social.github) contacts.github = metadata.social.github;
  }
  
  if (metadata.links) {
    for (const link of metadata.links) {
      if (typeof link === 'string') {
        if (link.includes('twitter.com')) contacts.twitter = link;
        if (link.includes('github.com')) contacts.github = link;
      } else if (link.type) {
        contacts[link.type] = link.url || link.value;
      }
    }
  }
  
  return contacts;
}

async function queryRecentAgents() {
  console.log('Connecting to Ethereum mainnet...');
  
  const provider = await createProvider();
  const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  
  // Calculate block range for last 30 days (approximately)
  const currentBlock = await provider.getBlockNumber();
  const blocksPerDay = Math.floor(86400 / 12); // ~12 sec per block
  const thirtyDaysAgo = currentBlock - (blocksPerDay * 30);
  
  console.log(`Querying events from block ${thirtyDaysAgo} to ${currentBlock}`);
  
  try {
    // Query registration events
    const filter = contract.filters.AgentRegistered();
    const events = await contract.queryFilter(filter, thirtyDaysAgo);
    
    console.log(`Found ${events.length} registration events in the last 30 days`);
    
    const agents = [];
    
    for (const event of events) {
      console.log(`Processing agent: ${event.args.agentId}`);
      
      const agentId = event.args.agentId;
      const owner = event.args.owner;
      const metadataURI = event.args.metadataURI;
      
      // Fetch metadata
      const metadata = await fetchMetadata(metadataURI);
      const contacts = extractContactInfo(metadata);
      
      // Only include agents with contact methods
      if (Object.keys(contacts).length > 0) {
        agents.push({
          agentId: agentId,
          owner: owner,
          metadataURI: metadataURI,
          metadata: metadata,
          contacts: contacts,
          registrationBlock: event.blockNumber
        });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return agents;
    
  } catch (error) {
    console.error('Error querying events:', error);
    return [];
  }
}

async function generateMarkdown(agents) {
  let markdown = `# ERC-8004 Agent Directory

*Last updated: ${new Date().toISOString()}*

## Recent Agent Registrations (Last 30 Days)

Found ${agents.length} agents with contact information.

`;

  agents.forEach((agent, index) => {
    markdown += `### ${index + 1}. ${agent.metadata?.name || 'Unnamed Agent'}

- **Agent ID:** \`${agent.agentId}\`
- **Owner:** \`${agent.owner}\`
- **Registration Block:** ${agent.registrationBlock}
`;

    if (agent.metadata?.description) {
      markdown += `- **Description:** ${agent.metadata.description}\n`;
    }

    markdown += '\n**Contact Methods:**\n';
    
    Object.entries(agent.contacts).forEach(([type, value]) => {
      let displayValue = value;
      if (type === 'twitter' && !value.startsWith('http')) {
        displayValue = `https://twitter.com/${value.replace('@', '')}`;
      }
      if (type === 'github' && !value.startsWith('http')) {
        displayValue = `https://github.com/${value}`;
      }
      
      markdown += `- **${type.charAt(0).toUpperCase() + type.slice(1)}:** ${displayValue}\n`;
    });
    
    if (agent.metadataURI) {
      markdown += `- **Metadata:** ${agent.metadataURI}\n`;
    }
    
    markdown += '\n---\n\n';
  });

  return markdown;
}

async function main() {
  try {
    const agents = await queryRecentAgents();
    
    if (agents.length === 0) {
      console.log('No agents found with contact information');
      return;
    }
    
    console.log(`Found ${agents.length} agents with contact methods`);
    
    // Sort by registration block (newest first)
    agents.sort((a, b) => b.registrationBlock - a.registrationBlock);
    
    // Limit to 20 most recent
    const topAgents = agents.slice(0, 20);
    
    const markdown = await generateMarkdown(topAgents);
    const outputPath = path.join(__dirname, 'AGENT_DIRECTORY.md');
    
    await fs.writeFile(outputPath, markdown);
    console.log(`Agent directory saved to ${outputPath}`);
    
    // Also save raw data as JSON
    await fs.writeFile(
      path.join(__dirname, 'agents-raw-data.json'), 
      JSON.stringify(topAgents, null, 2)
    );
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();