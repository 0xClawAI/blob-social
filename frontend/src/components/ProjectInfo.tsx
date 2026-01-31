export function ProjectInfo() {
  return (
    <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4 mb-6">
      <h3 className="text-blue-400 font-semibold mb-2">📡 Project Status</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Network:</span>
          <span className="text-white">Base Sepolia</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Contract:</span>
          <a 
            href="https://sepolia.basescan.org/address/0xfF526F405868BA7345E64Cc52Cd8E772b095A829"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 font-mono text-xs"
          >
            0xfF52...A829
          </a>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Indexer API:</span>
          <span className="text-white">localhost:3040</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Frontend:</span>
          <span className="text-green-400">✓ Running</span>
        </div>
      </div>
    </div>
  );
}