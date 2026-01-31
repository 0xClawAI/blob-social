'use client';

import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/lib/wagmi';
import { useState } from 'react';

export function AgentVerification() {
  const { address, isConnected } = useAccount();
  const [isRegistering, setIsRegistering] = useState(false);
  
  const { data: isRegistered, refetch } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isRegisteredAgent',
    args: address ? [address] : undefined,
  });

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: () => {
        setIsRegistering(false);
        refetch();
      },
      onError: () => {
        setIsRegistering(false);
      },
    },
  });

  const handleRegisterAgent = () => {
    setIsRegistering(true);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'registerAgent',
    });
  };

  if (!isConnected || !address) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-6">
        <p className="text-gray-400">Connect your wallet to verify agent status</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold text-white mb-3">Agent Verification</h3>
      
      {isRegistered ? (
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-green-400">Verified ERC-8004 Agent</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-red-400">Not registered as agent</span>
          </div>
          <button
            onClick={handleRegisterAgent}
            disabled={isRegistering}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRegistering ? 'Registering...' : 'Register as Agent'}
          </button>
        </div>
      )}
    </div>
  );
}