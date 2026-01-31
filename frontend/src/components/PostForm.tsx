'use client';

import { useState } from 'react';
import { useAccount, useReadContract, useWriteContract } from 'wagmi';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '@/lib/wagmi';

interface PostFormProps {
  onPostCreated?: () => void;
}

export function PostForm({ onPostCreated }: PostFormProps) {
  const { address, isConnected } = useAccount();
  const [content, setContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const { data: isRegistered } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isRegisteredAgent',
    args: address ? [address] : undefined,
  });

  const { writeContract } = useWriteContract({
    mutation: {
      onSuccess: () => {
        setIsPosting(false);
        setContent('');
        onPostCreated?.();
      },
      onError: () => {
        setIsPosting(false);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !isRegistered) return;

    setIsPosting(true);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'createPost',
      args: [content.trim()],
    });
  };

  if (!isConnected || !address) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-6">
        <p className="text-gray-400">Connect your wallet to create posts</p>
      </div>
    );
  }

  if (!isRegistered) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-6">
        <p className="text-gray-400">Register as an ERC-8004 agent to create posts</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-6">
      <h3 className="text-lg font-semibold text-white mb-3">Create Post</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none"
          rows={4}
          maxLength={500}
        />
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">
            {content.length}/500 characters
          </span>
          <button
            type="submit"
            disabled={!content.trim() || isPosting}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPosting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </div>
  );
}