// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ERC8004ReputationRegistry
/// @notice Immutable reputation ledger for ERC-8004 AI agents.
///         Every SENTINEL alert fires a `submitFeedback` call logged here.
contract ERC8004ReputationRegistry {

    address public immutable owner;

    struct FeedbackEntry {
        uint256 agentId;
        bytes32 taskId;       // keccak256 of the alert GUID
        int128  scoreFixed;   // score × 10^decimals (e.g. 9200 = 92.00)
        uint8   decimals;     // fixed-point decimals (always 2 for SENTINEL)
        string  metadataCID;  // IPFS CID of full alert payload
        address submitter;
        uint256 timestamp;
    }

    // agentId → ordered list of feedback entries
    mapping(uint256 => FeedbackEntry[]) public feedbackLog;
    // taskId → agentId (for deduplication)
    mapping(bytes32 => bool) public taskSubmitted;

    uint256 public totalFeedbackEntries;

    event FeedbackSubmitted(
        uint256 indexed agentId,
        bytes32 indexed taskId,
        int128  scoreFixed,
        uint8   decimals,
        string  metadataCID,
        address submitter,
        uint256 timestamp
    );

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice Submit a reputation feedback entry for a completed task.
    /// @param agentId     Numeric agent ID (SENTINEL = 21)
    /// @param taskId      keccak256 of the task/alert identifier
    /// @param scoreFixed  Score × 10^decimals
    /// @param decimals_   Fixed-point decimals (2 for SENTINEL)
    /// @param metadataCID IPFS CID or any string identifier
    function submitFeedback(
        uint256 agentId,
        bytes32 taskId,
        int128  scoreFixed,
        uint8   decimals_,
        string calldata metadataCID
    ) external {
        require(!taskSubmitted[taskId], "ERC8004Reputation: task already submitted");
        require(bytes(metadataCID).length > 0, "ERC8004Reputation: empty CID");

        taskSubmitted[taskId] = true;
        totalFeedbackEntries++;

        FeedbackEntry memory entry = FeedbackEntry({
            agentId:     agentId,
            taskId:      taskId,
            scoreFixed:  scoreFixed,
            decimals:    decimals_,
            metadataCID: metadataCID,
            submitter:   msg.sender,
            timestamp:   block.timestamp
        });

        feedbackLog[agentId].push(entry);

        emit FeedbackSubmitted(
            agentId,
            taskId,
            scoreFixed,
            decimals_,
            metadataCID,
            msg.sender,
            block.timestamp
        );
    }

    /// @notice Get total feedback count for an agent
    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return feedbackLog[agentId].length;
    }

    /// @notice Get a specific feedback entry
    function getFeedback(uint256 agentId, uint256 index)
        external
        view
        returns (FeedbackEntry memory)
    {
        require(index < feedbackLog[agentId].length, "ERC8004Reputation: index out of range");
        return feedbackLog[agentId][index];
    }

    /// @notice Compute average score for an agent (returns scoreFixed with same decimals)
    function getAverageScore(uint256 agentId) external view returns (int128 avg, uint8 decimals_) {
        FeedbackEntry[] storage entries = feedbackLog[agentId];
        if (entries.length == 0) return (0, 2);

        int256 sum = 0;
        for (uint256 i = 0; i < entries.length; i++) {
            sum += int256(entries[i].scoreFixed);
        }
        avg = int128(sum / int256(entries.length));
        decimals_ = 2;
    }
}
