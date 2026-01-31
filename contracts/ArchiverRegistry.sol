// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ArchiverRegistry
 * @notice Manages archiver registration, staking, and rewards for blob data preservation
 * @dev Archivers stake ETH to participate, earn rewards for storing blobs, 
 *      and can be slashed for missing data
 * 
 * Economic Model:
 * - Archivers stake ETH (minimum 0.1 ETH)
 * - Protocol fees fund reward pool
 * - Archivers claim rewards proportional to stake and uptime
 * - Challenges can slash archivers who lose data
 */
contract ArchiverRegistry is Ownable, ReentrancyGuard, Pausable {

    // ============ Constants ============

    uint256 public constant MIN_STAKE = 0.1 ether;
    uint256 public constant CHALLENGE_PERIOD = 24 hours;
    uint256 public constant SLASH_PERCENT = 10; // 10% of stake
    uint256 public constant CHALLENGE_BOND = 0.01 ether;

    // ============ Structs ============

    struct Archiver {
        uint256 stake;              // ETH staked
        uint256 registeredAt;       // Registration timestamp
        uint256 lastClaimAt;        // Last reward claim
        uint256 blobCount;          // Number of blobs claimed to store
        uint256 successfulChallenges; // Challenges passed
        uint256 failedChallenges;   // Challenges failed
        bool active;                // Currently active
        string endpoint;            // API endpoint for retrieving data
    }

    struct Challenge {
        address challenger;
        address archiver;
        bytes32 blobHash;
        uint256 deadline;
        bool resolved;
        bool archiverWon;
    }

    // ============ State Variables ============

    /// @notice Registered archivers
    mapping(address => Archiver) public archivers;

    /// @notice List of active archiver addresses
    address[] public activeArchivers;

    /// @notice Mapping address to index in activeArchivers (1-indexed, 0 = not present)
    mapping(address => uint256) private archiverIndex;

    /// @notice Active challenges
    mapping(uint256 => Challenge) public challenges;
    uint256 public nextChallengeId;

    /// @notice Total stake across all archivers
    uint256 public totalStake;

    /// @notice Reward pool (funded by protocol fees)
    uint256 public rewardPool;

    /// @notice Accumulated rewards per stake unit (scaled by 1e18)
    uint256 public accRewardPerStake;

    /// @notice Reward debt per archiver (for reward calculation)
    mapping(address => uint256) public rewardDebt;

    /// @notice Protocol fee recipient
    address public feeRecipient;

    /// @notice Blob hashes that archivers commit to storing
    mapping(bytes32 => address[]) public blobArchivers;

    // ============ Events ============

    event ArchiverRegistered(
        address indexed archiver,
        uint256 stake,
        string endpoint,
        uint256 timestamp
    );

    event StakeAdded(
        address indexed archiver,
        uint256 amount,
        uint256 newTotal
    );

    event StakeWithdrawn(
        address indexed archiver,
        uint256 amount,
        uint256 newTotal
    );

    event ArchiverDeactivated(
        address indexed archiver,
        uint256 timestamp
    );

    event BlobCommitted(
        address indexed archiver,
        bytes32 indexed blobHash,
        uint256 timestamp
    );

    event ChallengeCreated(
        uint256 indexed challengeId,
        address indexed challenger,
        address indexed archiver,
        bytes32 blobHash
    );

    event ChallengeResolved(
        uint256 indexed challengeId,
        bool archiverWon,
        uint256 slashAmount
    );

    event RewardsClaimed(
        address indexed archiver,
        uint256 amount
    );

    event RewardPoolFunded(
        address indexed funder,
        uint256 amount
    );

    // ============ Errors ============

    error InsufficientStake();
    error ArchiverNotActive();
    error ArchiverAlreadyRegistered();
    error NotAnArchiver();
    error ChallengeNotFound();
    error ChallengeAlreadyResolved();
    error ChallengePeriodNotExpired();
    error InvalidBond();
    error WithdrawalExceedsStake();
    error StakeBelowMinimum();

    // ============ Constructor ============

    constructor(address _feeRecipient) Ownable(msg.sender) {
        feeRecipient = _feeRecipient;
    }

    // ============ Archiver Registration ============

    /**
     * @notice Register as an archiver with initial stake
     * @param endpoint API endpoint for data retrieval
     */
    function register(string calldata endpoint) external payable nonReentrant {
        if (msg.value < MIN_STAKE) revert InsufficientStake();
        if (archivers[msg.sender].registeredAt != 0) revert ArchiverAlreadyRegistered();

        archivers[msg.sender] = Archiver({
            stake: msg.value,
            registeredAt: block.timestamp,
            lastClaimAt: block.timestamp,
            blobCount: 0,
            successfulChallenges: 0,
            failedChallenges: 0,
            active: true,
            endpoint: endpoint
        });

        activeArchivers.push(msg.sender);
        archiverIndex[msg.sender] = activeArchivers.length; // 1-indexed

        totalStake += msg.value;
        rewardDebt[msg.sender] = (msg.value * accRewardPerStake) / 1e18;

        emit ArchiverRegistered(msg.sender, msg.value, endpoint, block.timestamp);
    }

    /**
     * @notice Add more stake to your archiver position
     */
    function addStake() external payable nonReentrant {
        Archiver storage archiver = archivers[msg.sender];
        if (archiver.registeredAt == 0) revert NotAnArchiver();

        // Claim pending rewards before stake change
        _claimRewards(msg.sender);

        archiver.stake += msg.value;
        totalStake += msg.value;
        rewardDebt[msg.sender] = (archiver.stake * accRewardPerStake) / 1e18;

        emit StakeAdded(msg.sender, msg.value, archiver.stake);
    }

    /**
     * @notice Withdraw stake (partial or full)
     * @param amount Amount to withdraw
     */
    function withdrawStake(uint256 amount) external nonReentrant {
        Archiver storage archiver = archivers[msg.sender];
        if (archiver.registeredAt == 0) revert NotAnArchiver();
        if (amount > archiver.stake) revert WithdrawalExceedsStake();
        
        uint256 newStake = archiver.stake - amount;
        if (newStake > 0 && newStake < MIN_STAKE) revert StakeBelowMinimum();

        // Claim pending rewards before stake change
        _claimRewards(msg.sender);

        archiver.stake = newStake;
        totalStake -= amount;
        rewardDebt[msg.sender] = (newStake * accRewardPerStake) / 1e18;

        // If fully withdrawn, deactivate
        if (newStake == 0) {
            _deactivateArchiver(msg.sender);
        }

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit StakeWithdrawn(msg.sender, amount, newStake);
    }

    /**
     * @notice Deactivate as archiver (must withdraw all stake separately)
     */
    function deactivate() external {
        if (!archivers[msg.sender].active) revert ArchiverNotActive();
        _deactivateArchiver(msg.sender);
    }

    // ============ Blob Commitment ============

    /**
     * @notice Commit to storing a blob
     * @param blobHash The versioned hash of the blob
     */
    function commitToBlob(bytes32 blobHash) external {
        Archiver storage archiver = archivers[msg.sender];
        if (!archiver.active) revert ArchiverNotActive();

        blobArchivers[blobHash].push(msg.sender);
        archiver.blobCount++;

        emit BlobCommitted(msg.sender, blobHash, block.timestamp);
    }

    /**
     * @notice Commit to storing multiple blobs
     * @param blobHashes Array of versioned hashes
     */
    function batchCommitToBlobs(bytes32[] calldata blobHashes) external {
        Archiver storage archiver = archivers[msg.sender];
        if (!archiver.active) revert ArchiverNotActive();

        for (uint256 i = 0; i < blobHashes.length; i++) {
            blobArchivers[blobHashes[i]].push(msg.sender);
            archiver.blobCount++;
            emit BlobCommitted(msg.sender, blobHashes[i], block.timestamp);
        }
    }

    // ============ Challenge System ============

    /**
     * @notice Challenge an archiver to prove they have blob data
     * @param archiver Address of archiver to challenge
     * @param blobHash Blob hash to request
     * @return challengeId ID of created challenge
     */
    function createChallenge(address archiver, bytes32 blobHash) 
        external 
        payable 
        returns (uint256 challengeId) 
    {
        if (msg.value != CHALLENGE_BOND) revert InvalidBond();
        if (!archivers[archiver].active) revert ArchiverNotActive();

        challengeId = nextChallengeId++;
        challenges[challengeId] = Challenge({
            challenger: msg.sender,
            archiver: archiver,
            blobHash: blobHash,
            deadline: block.timestamp + CHALLENGE_PERIOD,
            resolved: false,
            archiverWon: false
        });

        emit ChallengeCreated(challengeId, msg.sender, archiver, blobHash);
    }

    /**
     * @notice Resolve a challenge (called by oracle/trusted verifier)
     * @param challengeId Challenge to resolve
     * @param archiverHasData Whether archiver proved they have the data
     */
    function resolveChallenge(uint256 challengeId, bool archiverHasData) 
        external 
        onlyOwner // TODO: Replace with decentralized oracle
    {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.deadline == 0) revert ChallengeNotFound();
        if (challenge.resolved) revert ChallengeAlreadyResolved();

        challenge.resolved = true;
        challenge.archiverWon = archiverHasData;

        Archiver storage archiver = archivers[challenge.archiver];
        uint256 slashAmount = 0;

        if (archiverHasData) {
            // Archiver wins - gets challenge bond, challenger loses bond
            archiver.successfulChallenges++;
            (bool success, ) = payable(challenge.archiver).call{value: CHALLENGE_BOND}("");
            require(success, "Transfer failed");
        } else {
            // Challenger wins - archiver is slashed
            archiver.failedChallenges++;
            slashAmount = (archiver.stake * SLASH_PERCENT) / 100;
            
            // Slash archiver
            archiver.stake -= slashAmount;
            totalStake -= slashAmount;

            // Give slash to challenger + return bond
            uint256 challengerReward = slashAmount + CHALLENGE_BOND;
            (bool success, ) = payable(challenge.challenger).call{value: challengerReward}("");
            require(success, "Transfer failed");

            // Deactivate if stake too low
            if (archiver.stake < MIN_STAKE) {
                _deactivateArchiver(challenge.archiver);
            }
        }

        emit ChallengeResolved(challengeId, archiverHasData, slashAmount);
    }

    /**
     * @notice Auto-resolve expired challenge (archiver didn't respond)
     * @param challengeId Challenge to resolve
     */
    function resolveExpiredChallenge(uint256 challengeId) external {
        Challenge storage challenge = challenges[challengeId];
        if (challenge.deadline == 0) revert ChallengeNotFound();
        if (challenge.resolved) revert ChallengeAlreadyResolved();
        if (block.timestamp < challenge.deadline) revert ChallengePeriodNotExpired();

        // Archiver didn't respond in time - treat as failure
        challenge.resolved = true;
        challenge.archiverWon = false;

        Archiver storage archiver = archivers[challenge.archiver];
        archiver.failedChallenges++;
        
        uint256 slashAmount = (archiver.stake * SLASH_PERCENT) / 100;
        archiver.stake -= slashAmount;
        totalStake -= slashAmount;

        uint256 challengerReward = slashAmount + CHALLENGE_BOND;
        (bool success, ) = payable(challenge.challenger).call{value: challengerReward}("");
        require(success, "Transfer failed");

        if (archiver.stake < MIN_STAKE) {
            _deactivateArchiver(challenge.archiver);
        }

        emit ChallengeResolved(challengeId, false, slashAmount);
    }

    // ============ Rewards ============

    /**
     * @notice Fund the reward pool (protocol fees go here)
     */
    function fundRewardPool() external payable {
        if (totalStake > 0) {
            accRewardPerStake += (msg.value * 1e18) / totalStake;
        }
        rewardPool += msg.value;

        emit RewardPoolFunded(msg.sender, msg.value);
    }

    /**
     * @notice Claim accumulated rewards
     */
    function claimRewards() external nonReentrant {
        _claimRewards(msg.sender);
    }

    /**
     * @notice View pending rewards for an archiver
     * @param archiverAddr Archiver address
     * @return Pending reward amount
     */
    function pendingRewards(address archiverAddr) external view returns (uint256) {
        Archiver storage archiver = archivers[archiverAddr];
        if (archiver.stake == 0) return 0;
        
        uint256 accumulated = (archiver.stake * accRewardPerStake) / 1e18;
        return accumulated - rewardDebt[archiverAddr];
    }

    // ============ View Functions ============

    /**
     * @notice Get all active archivers
     * @return Array of active archiver addresses
     */
    function getActiveArchivers() external view returns (address[] memory) {
        return activeArchivers;
    }

    /**
     * @notice Get archivers for a specific blob
     * @param blobHash Blob hash
     * @return Array of archiver addresses storing this blob
     */
    function getArchiversForBlob(bytes32 blobHash) external view returns (address[] memory) {
        return blobArchivers[blobHash];
    }

    /**
     * @notice Get archiver stats
     * @param archiverAddr Archiver address
     * @return stake Current stake
     * @return blobCount Number of blobs
     * @return successRate Success rate (0-100)
     */
    function getArchiverStats(address archiverAddr) 
        external 
        view 
        returns (uint256 stake, uint256 blobCount, uint256 successRate) 
    {
        Archiver storage archiver = archivers[archiverAddr];
        stake = archiver.stake;
        blobCount = archiver.blobCount;
        
        uint256 totalChallenges = archiver.successfulChallenges + archiver.failedChallenges;
        successRate = totalChallenges == 0 ? 100 : (archiver.successfulChallenges * 100) / totalChallenges;
    }

    // ============ Admin Functions ============

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal Functions ============

    function _claimRewards(address archiverAddr) internal {
        Archiver storage archiver = archivers[archiverAddr];
        if (archiver.stake == 0) return;

        uint256 accumulated = (archiver.stake * accRewardPerStake) / 1e18;
        uint256 pending = accumulated - rewardDebt[archiverAddr];

        if (pending > 0) {
            rewardDebt[archiverAddr] = accumulated;
            archiver.lastClaimAt = block.timestamp;
            
            (bool success, ) = payable(archiverAddr).call{value: pending}("");
            require(success, "Transfer failed");

            emit RewardsClaimed(archiverAddr, pending);
        }
    }

    function _deactivateArchiver(address archiverAddr) internal {
        Archiver storage archiver = archivers[archiverAddr];
        archiver.active = false;

        // Remove from active list
        uint256 index = archiverIndex[archiverAddr];
        if (index > 0) {
            uint256 lastIndex = activeArchivers.length;
            if (index < lastIndex) {
                address lastArchiver = activeArchivers[lastIndex - 1];
                activeArchivers[index - 1] = lastArchiver;
                archiverIndex[lastArchiver] = index;
            }
            activeArchivers.pop();
            archiverIndex[archiverAddr] = 0;
        }

        emit ArchiverDeactivated(archiverAddr, block.timestamp);
    }

    // ============ Receive ============

    receive() external payable {
        // Accept direct ETH transfers as protocol fees
        if (totalStake > 0) {
            accRewardPerStake += (msg.value * 1e18) / totalStake;
        }
        rewardPool += msg.value;
        emit RewardPoolFunded(msg.sender, msg.value);
    }
}
