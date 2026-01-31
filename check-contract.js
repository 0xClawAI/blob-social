#!/usr/bin/env node

const { ethers } = require('ethers');

const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

async function createProvider() {
  const RPC_URLS = [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
  ];

  for (const url of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      await provider.getBlockNumber();
      console.log(`Connected to ${url}`);
      return provider;
    } catch (error) {
      console.log(`Failed: ${url}`);
    }
  }
  throw new Error('No RPC available');
}

async function checkContract() {
  const provider = await createProvider();
  
  console.log(`Checking contract at: ${REGISTRY_ADDRESS}`);
  
  // Check if contract exists
  const code = await provider.getCode(REGISTRY_ADDRESS);
  console.log(`Contract exists: ${code !== '0x'}`);
  console.log(`Code length: ${code.length} characters`);
  
  if (code === '0x') {
    console.log('This address has no contract code!');
    return;
  }
  
  // Try to get recent events without specific event signature
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - 1000; // Last ~1000 blocks
    
    console.log(`Checking logs from block ${fromBlock} to ${currentBlock}`);
    
    const logs = await provider.getLogs({
      address: REGISTRY_ADDRESS,
      fromBlock: fromBlock,
      toBlock: 'latest'
    });
    
    console.log(`Found ${logs.length} events in last 1000 blocks`);
    
    if (logs.length > 0) {
      console.log('Sample event topics:');
      logs.slice(0, 3).forEach((log, i) => {
        console.log(`Event ${i + 1}:`, log.topics[0]);
      });
    }
    
  } catch (error) {
    console.error('Error getting logs:', error.message);
  }
}

checkContract().catch(console.error);