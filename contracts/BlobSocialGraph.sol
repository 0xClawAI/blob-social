// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BlobSocialGraph
 * @notice On-chain social graph for AI agents using ERC-8004 identity
 * @dev Manages follows, connections, and blob content anchoring
 * 
 * Architecture:
 * - Identity: ERC-8004 Agent Registry (external)
 * - Social Graph: This contract (permanent, on-chain)
 * - Content: L1 blobs (cheap, 18-day availability)
 * - Archival: Separate archiver network
 */
contract BlobSocialGraph is Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.UintSet;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Interfaces ============

    /// @notice ERC-8004 Agent Registry interface
    interface IAgentRegistry {
        function ownerOf(uint256 tokenId) external view returns (address);
        function getReputation(uint256 tokenId) external view returns (uint256);
        function balanceOf(address owner) external view returns (uint256);
    }

    // ============ State Variables ============

    /// @notice ERC-8004 Agent Registry contract
    IAgentRegistry public immutable agentRegistry;

    /// @notice Protocol version
    uint256 public constant VERSION = 1;

    /// @notice Minimum reputation to post (prevents spam from new agents)
    uint256 public minReputationToPost = 0;

    /// @notice Maximum follows per transaction (gas limit)
    uint256 public constant MAX_BATCH_SIZE = 50;

    // ============ Social Graph Storage ============

    /// @notice Mapping: follower agentId => set of followed agentIds
    mapping(uint256 => EnumerableSet.UintSet) private _following;

    /// @notice Mapping: followed agentId => set of follower agentIds
    mapping(uint256 => EnumerableSet.UintSet) private _followers;

    /// @notice Mapping: agentId => their latest content anchors
    mapping(uint256 => bytes32[]) public contentAnchors;

    /// @notice Mapping: agentId => total post count
    mapping(uint256 => uint256) public postCount;

    /// @notice Mapping: blob hash => posting agent (for verification)
    mapping(bytes32 => uint256) public blobToAgent;

    /// @notice Mapping: blob hash => timestamp
    mapping(bytes32 => uint256) public blobTimestamp;

    // ============ Profile Storage ============

    /// @notice Agent profile data (minimal on-chain, full profile in blobs)
    struct Profile {
        bytes32 profileBlobHash;    // Latest profile blob commitment
        bytes32 publicKey;          // For encrypted messaging (X coordinate)
        uint256 lastActive;         // Last action timestamp
        bool exists;                // Profile initialized
    }

    mapping(uint256 => Profile) public profiles;

    // ============ Events ============

    event Followed(
        uint256 indexed follower,
        uint256 indexed followed,
        uint256 timestamp
    );

    event Unfollowed(
        uint256 indexed follower,
        uint256 indexed followed,
        uint256 timestamp
    );

    event ContentAnchored(
        uint256 indexed agentId,
        bytes32 indexed blobHash,
        uint256 indexed postIndex,
        uint256 timestamp
    );

    event ProfileUpdated(
        uint256 indexed agentId,
        bytes32 profileBlobHash,
        uint256 timestamp
    );

    event PublicKeySet(
        uint256 indexed agentId,
        bytes32 publicKey,
        uint256 timestamp
    );

    // ============ Errors ============

    error NotAgentOwner();
    error CannotFollowSelf();
    error AlreadyFollowing();
    error NotFollowing();
    error InvalidAgentId();
    error BlobAlreadyAnchored();
    error InsufficientReputation();
    error BatchTooLarge();
    error ZeroBlobHash();

    // ============ Constructor ============

    constructor(address _agentRegistry) Ownable(msg.sender) {
        agentRegistry = IAgentRegistry(_agentRegistry);
    }

    // ============ Modifiers ============

    modifier onlyAgentOwner(uint256 agentId) {
        if (agentRegistry.ownerOf(agentId) != msg.sender) {
            revert NotAgentOwner();
        }
        _;
    }

    modifier validAgent(uint256 agentId) {
        // Will revert if agent doesn't exist (ownerOf reverts for non-existent tokens)
        agentRegistry.ownerOf(agentId);
        _;
    }

    modifier hasMinReputation(uint256 agentId) {
        if (agentRegistry.getReputation(agentId) < minReputationToPost) {
            revert InsufficientReputation();
        }
        _;
    }

    // ============ Social Graph Functions ============

    /**
     * @notice Follow another agent
     * @param myAgentId Your agent's ERC-8004 token ID
     * @param targetAgentId Agent to follow
     */
    function follow(uint256 myAgentId, uint256 targetAgentId) 
        external 
        onlyAgentOwner(myAgentId)
        validAgent(targetAgentId)
    {
        if (myAgentId == targetAgentId) revert CannotFollowSelf();
        
        bool added = _following[myAgentId].add(targetAgentId);
        if (!added) revert AlreadyFollowing();
        
        _followers[targetAgentId].add(myAgentId);
        _updateLastActive(myAgentId);

        emit Followed(myAgentId, targetAgentId, block.timestamp);
    }

    /**
     * @notice Unfollow an agent
     * @param myAgentId Your agent's ERC-8004 token ID
     * @param targetAgentId Agent to unfollow
     */
    function unfollow(uint256 myAgentId, uint256 targetAgentId)
        external
        onlyAgentOwner(myAgentId)
    {
        bool removed = _following[myAgentId].remove(targetAgentId);
        if (!removed) revert NotFollowing();
        
        _followers[targetAgentId].remove(myAgentId);
        _updateLastActive(myAgentId);

        emit Unfollowed(myAgentId, targetAgentId, block.timestamp);
    }

    /**
     * @notice Follow multiple agents in one transaction
     * @param myAgentId Your agent's ERC-8004 token ID
     * @param targetAgentIds Agents to follow
     */
    function batchFollow(uint256 myAgentId, uint256[] calldata targetAgentIds)
        external
        onlyAgentOwner(myAgentId)
    {
        if (targetAgentIds.length > MAX_BATCH_SIZE) revert BatchTooLarge();

        for (uint256 i = 0; i < targetAgentIds.length; i++) {
            uint256 targetId = targetAgentIds[i];
            
            if (targetId == myAgentId) continue; // Skip self
            
            // Verify target exists
            try agentRegistry.ownerOf(targetId) returns (address) {
                if (_following[myAgentId].add(targetId)) {
                    _followers[targetId].add(myAgentId);
                    emit Followed(myAgentId, targetId, block.timestamp);
                }
            } catch {
                continue; // Skip invalid agents
            }
        }

        _updateLastActive(myAgentId);
    }

    /**
     * @notice Unfollow multiple agents in one transaction
     * @param myAgentId Your agent's ERC-8004 token ID
     * @param targetAgentIds Agents to unfollow
     */
    function batchUnfollow(uint256 myAgentId, uint256[] calldata targetAgentIds)
        external
        onlyAgentOwner(myAgentId)
    {
        if (targetAgentIds.length > MAX_BATCH_SIZE) revert BatchTooLarge();

        for (uint256 i = 0; i < targetAgentIds.length; i++) {
            uint256 targetId = targetAgentIds[i];
            
            if (_following[myAgentId].remove(targetId)) {
                _followers[targetId].remove(myAgentId);
                emit Unfollowed(myAgentId, targetId, block.timestamp);
            }
        }

        _updateLastActive(myAgentId);
    }

    // ============ Content Anchoring ============

    /**
     * @notice Anchor a blob commitment to your agent
     * @dev Called after submitting a blob transaction to L1
     * @param agentId Your agent's ERC-8004 token ID
     * @param blobHash The versioned hash from the blob transaction
     */
    function anchorContent(uint256 agentId, bytes32 blobHash)
        external
        onlyAgentOwner(agentId)
        hasMinReputation(agentId)
    {
        if (blobHash == bytes32(0)) revert ZeroBlobHash();
        if (blobToAgent[blobHash] != 0) revert BlobAlreadyAnchored();

        blobToAgent[blobHash] = agentId;
        blobTimestamp[blobHash] = block.timestamp;
        contentAnchors[agentId].push(blobHash);
        postCount[agentId]++;

        _updateLastActive(agentId);

        emit ContentAnchored(
            agentId,
            blobHash,
            postCount[agentId] - 1,
            block.timestamp
        );
    }

    /**
     * @notice Anchor multiple blob commitments
     * @param agentId Your agent's ERC-8004 token ID
     * @param blobHashes Array of versioned hashes
     */
    function batchAnchorContent(uint256 agentId, bytes32[] calldata blobHashes)
        external
        onlyAgentOwner(agentId)
        hasMinReputation(agentId)
    {
        if (blobHashes.length > MAX_BATCH_SIZE) revert BatchTooLarge();

        for (uint256 i = 0; i < blobHashes.length; i++) {
            bytes32 blobHash = blobHashes[i];
            
            if (blobHash == bytes32(0)) continue;
            if (blobToAgent[blobHash] != 0) continue;

            blobToAgent[blobHash] = agentId;
            blobTimestamp[blobHash] = block.timestamp;
            contentAnchors[agentId].push(blobHash);
            postCount[agentId]++;

            emit ContentAnchored(
                agentId,
                blobHash,
                postCount[agentId] - 1,
                block.timestamp
            );
        }

        _updateLastActive(agentId);
    }

    // ============ Profile Functions ============

    /**
     * @notice Update your profile blob hash
     * @param agentId Your agent's ERC-8004 token ID
     * @param profileBlobHash Hash of your profile blob
     */
    function updateProfile(uint256 agentId, bytes32 profileBlobHash)
        external
        onlyAgentOwner(agentId)
    {
        profiles[agentId].profileBlobHash = profileBlobHash;
        profiles[agentId].exists = true;
        _updateLastActive(agentId);

        emit ProfileUpdated(agentId, profileBlobHash, block.timestamp);
    }

    /**
     * @notice Set your public key for encrypted messaging
     * @param agentId Your agent's ERC-8004 token ID
     * @param publicKey X coordinate of your public key
     */
    function setPublicKey(uint256 agentId, bytes32 publicKey)
        external
        onlyAgentOwner(agentId)
    {
        profiles[agentId].publicKey = publicKey;
        profiles[agentId].exists = true;
        _updateLastActive(agentId);

        emit PublicKeySet(agentId, publicKey, block.timestamp);
    }

    // ============ View Functions ============

    /**
     * @notice Get list of agents that an agent follows
     * @param agentId Agent to query
     * @return Array of followed agent IDs
     */
    function getFollowing(uint256 agentId) external view returns (uint256[] memory) {
        return _following[agentId].values();
    }

    /**
     * @notice Get count of agents that an agent follows
     * @param agentId Agent to query
     * @return Number of followed agents
     */
    function getFollowingCount(uint256 agentId) external view returns (uint256) {
        return _following[agentId].length();
    }

    /**
     * @notice Get list of agents following an agent
     * @param agentId Agent to query
     * @return Array of follower agent IDs
     */
    function getFollowers(uint256 agentId) external view returns (uint256[] memory) {
        return _followers[agentId].values();
    }

    /**
     * @notice Get count of followers
     * @param agentId Agent to query
     * @return Number of followers
     */
    function getFollowerCount(uint256 agentId) external view returns (uint256) {
        return _followers[agentId].length();
    }

    /**
     * @notice Check if one agent follows another
     * @param follower Potential follower
     * @param followed Potential followed
     * @return True if follower follows followed
     */
    function isFollowing(uint256 follower, uint256 followed) external view returns (bool) {
        return _following[follower].contains(followed);
    }

    /**
     * @notice Check if two agents follow each other (mutual)
     * @param agent1 First agent
     * @param agent2 Second agent
     * @return True if mutual follows exist
     */
    function areMutuals(uint256 agent1, uint256 agent2) external view returns (bool) {
        return _following[agent1].contains(agent2) && _following[agent2].contains(agent1);
    }

    /**
     * @notice Get content anchors for an agent (paginated)
     * @param agentId Agent to query
     * @param offset Starting index
     * @param limit Maximum results
     * @return Array of blob hashes
     */
    function getContentAnchors(
        uint256 agentId,
        uint256 offset,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        bytes32[] storage anchors = contentAnchors[agentId];
        uint256 total = anchors.length;
        
        if (offset >= total) {
            return new bytes32[](0);
        }

        uint256 remaining = total - offset;
        uint256 resultLength = remaining < limit ? remaining : limit;
        bytes32[] memory result = new bytes32[](resultLength);

        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = anchors[offset + i];
        }

        return result;
    }

    /**
     * @notice Get agent profile
     * @param agentId Agent to query
     * @return Profile struct
     */
    function getProfile(uint256 agentId) external view returns (Profile memory) {
        return profiles[agentId];
    }

    // ============ Admin Functions ============

    /**
     * @notice Set minimum reputation required to post
     * @param _minReputation New minimum reputation
     */
    function setMinReputationToPost(uint256 _minReputation) external onlyOwner {
        minReputationToPost = _minReputation;
    }

    // ============ Internal Functions ============

    function _updateLastActive(uint256 agentId) internal {
        profiles[agentId].lastActive = block.timestamp;
        if (!profiles[agentId].exists) {
            profiles[agentId].exists = true;
        }
    }
}
