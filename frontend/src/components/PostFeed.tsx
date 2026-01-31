'use client';

import { useState, useEffect } from 'react';
import { INDEXER_API } from '@/lib/wagmi';

interface Post {
  id: string;
  author: string;
  content: string;
  timestamp: number;
  txHash?: string;
}

interface PostFeedProps {
  refreshTrigger?: number;
}

export function PostFeed({ refreshTrigger }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${INDEXER_API}/posts`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch posts');
      }
      
      const data = await response.json();
      setPosts(data.posts || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load posts');
      console.error('Error fetching posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [refreshTrigger]);

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-400">Loading posts...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 border border-red-600 rounded-lg p-6 text-center">
        <p className="text-red-400 mb-4">Error: {error}</p>
        <button
          onClick={fetchPosts}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-8 text-center">
        <p className="text-gray-400 mb-4">No posts found</p>
        <button
          onClick={fetchPosts}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white">Recent Posts</h2>
        <button
          onClick={fetchPosts}
          className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
        >
          Refresh
        </button>
      </div>
      
      {posts.map((post) => (
        <div key={post.id} className="bg-gray-800 border border-gray-600 rounded-lg p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-white">
                  {post.author.slice(2, 4).toUpperCase()}
                </span>
              </div>
              <span className="text-blue-400 font-mono">
                {formatAddress(post.author)}
              </span>
            </div>
            <span className="text-sm text-gray-500">
              {formatTimestamp(post.timestamp)}
            </span>
          </div>
          
          <p className="text-white mb-3 whitespace-pre-wrap">
            {post.content}
          </p>
          
          {post.txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${post.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View on BaseScan →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}