// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ERC8004ValidationRegistry
/// @notice On-chain proof submission registry for ERC-8004 AI agents.
///         SENTINEL submits keccak256 commitment hashes here after each
///         invariant violation detection cycle.
contract ERC8004ValidationRegistry {

    address public immutable owner;

    struct ValidationEntry {
        uint256 agentId;
        bytes32 batchId;           // Unique batch identifier
        bytes   proofCalldata;     // Commitment hash or real Groth16 proof
        address verifierContract;  // SentinelBatchVerifier address
        address submitter;
        uint256 timestamp;
        bool    verified;          // true if verifier returned success
    }

    mapping(bytes32 => ValidationEntry) public validations;
    mapping(uint256 => bytes32[]) public agentBatches; // agentId → batchIds
    uint256 public totalValidations;

    event ValidationSubmitted(
        uint256 indexed agentId,
        bytes32 indexed batchId,
        address verifierContract,
        address submitter,
        uint256 timestamp
    );

    event ValidationVerified(
        bytes32 indexed batchId,
        bool    success,
        uint256 timestamp
    );

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice Submit a ZK batch proof / commitment hash for validation
    /// @param agentId          Numeric agent ID (SENTINEL = 21)
    /// @param batchId          Unique batch identifier
    /// @param proofCalldata    Proof bytes (first 32 bytes = commitment hash)
    /// @param verifierContract Address of SentinelBatchVerifier
    function submitValidation(
        uint256 agentId,
        bytes32 batchId,
        bytes calldata proofCalldata,
        address verifierContract
    ) external {
        require(validations[batchId].timestamp == 0, "ERC8004Validation: batchId already submitted");
        require(proofCalldata.length >= 32, "ERC8004Validation: proof data too short");

        bool verified = false;

        // Attempt to call the verifier contract if one is provided
        if (verifierContract != address(0)) {
            try IVerifier(verifierContract).verifyBatch(proofCalldata, batchId, 1) returns (bool result) {
                verified = result;
            } catch {
                // Verifier call failed — store as unverified (non-fatal)
                verified = false;
            }
        }

        validations[batchId] = ValidationEntry({
            agentId:          agentId,
            batchId:          batchId,
            proofCalldata:    proofCalldata,
            verifierContract: verifierContract,
            submitter:        msg.sender,
            timestamp:        block.timestamp,
            verified:         verified
        });

        agentBatches[agentId].push(batchId);
        totalValidations++;

        emit ValidationSubmitted(agentId, batchId, verifierContract, msg.sender, block.timestamp);
        emit ValidationVerified(batchId, verified, block.timestamp);
    }

    function isValidated(bytes32 batchId) external view returns (bool) {
        return validations[batchId].timestamp > 0;
    }

    function isVerified(bytes32 batchId) external view returns (bool) {
        return validations[batchId].verified;
    }

    function getValidation(bytes32 batchId) external view returns (ValidationEntry memory) {
        return validations[batchId];
    }

    function getBatchCount(uint256 agentId) external view returns (uint256) {
        return agentBatches[agentId].length;
    }
}

interface IVerifier {
    function verifyBatch(bytes calldata proofData, bytes32 batchId, uint256 checksCount) external returns (bool);
}
