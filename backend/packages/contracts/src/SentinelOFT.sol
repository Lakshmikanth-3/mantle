// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SentinelOFT
 * @notice LayerZero OFT bridge contract implementation for SENTINEL.
 *
 * Emits the real LayerZero OFT v2 event signatures:
 *   - OFTSent  (source chain: when tokens leave)
 *   - OFTReceived (destination chain: when tokens arrive)
 *
 * SENTINEL's watcher listens for these exact events on-chain.
 */
contract SentinelOFT is ERC20, Ownable {
    // LayerZero v2 standard OFT events — must match exactly what SENTINEL watches
    event OFTSent(
        bytes32 indexed guid,
        uint32  dstEid,
        address indexed from,
        uint256 amountSentLD,
        uint256 amountReceivedLD
    );

    event OFTReceived(
        bytes32 indexed guid,
        uint32  srcEid,
        address indexed toAddress,
        uint256 amountReceivedLD
    );

    // LayerZero endpoint IDs
    uint32 public constant MANTLE_EID      = 30181; // Mantle Mainnet
    uint32 public constant MANTLE_SEP_EID  = 40246; // Mantle Sepolia
    uint32 public constant ETH_SEP_EID     = 40161; // Ethereum Sepolia

    uint8 private _tokenDecimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _tokenDecimals = decimals_;
        // Mint 1,000,000 tokens to deployer for testing
        _mint(msg.sender, 1_000_000 * (10 ** decimals_));
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    /**
     * @notice Executes cross-chain transfer FROM this chain TO a destination chain.
     * SENTINEL's ethListener watches for this event on Ethereum Sepolia.
     * @param amount Token amount in human units (will be scaled by decimals)
     * @param dstEid Destination LayerZero endpoint ID
     */
    function executeCrossChainSend(uint256 amount, uint32 dstEid) external returns (bytes32 guid) {
        uint256 amountLD = amount * (10 ** _tokenDecimals);
        guid = keccak256(abi.encodePacked(block.timestamp, msg.sender, amount, dstEid, block.number));

        emit OFTSent(guid, dstEid, msg.sender, amountLD, amountLD);
        return guid;
    }

    /**
     * @notice Executes receiving tokens on this chain FROM a source chain.
     * SENTINEL's mantleListener watches for this event on Mantle Sepolia.
     * @param amount Token amount in human units
     * @param srcEid Source LayerZero endpoint ID
     * @param guid The cross-chain message GUID (must match the OFTSent guid for reconciliation)
     */
    function executeReceive(uint256 amount, uint32 srcEid, bytes32 guid) external {
        uint256 amountLD = amount * (10 ** _tokenDecimals);
        _mint(msg.sender, amountLD);
        emit OFTReceived(guid, srcEid, msg.sender, amountLD);
    }

    /**
     * @notice Triggers an unmatched mint vulnerability — the core invariant violation SENTINEL detects.
     * Call this to trigger a CRITICAL alert without a matching OFTSent on the source chain.
     * @param amount Token amount in human units (use large values like 5000 to trigger CRITICAL)
     */
    function triggerVulnerability(uint256 amount) external returns (bytes32 guid) {
        uint256 amountLD = amount * (10 ** _tokenDecimals);
        // Generate a unique GUID that has NO matching OFTSent on the source chain
        guid = keccak256(abi.encodePacked("EXPLOIT", block.timestamp, msg.sender, amount));

        _mint(msg.sender, amountLD);
        emit OFTReceived(guid, ETH_SEP_EID, msg.sender, amountLD);

        return guid;
    }

    /// @notice Allows owner to mint tokens for testing
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount * (10 ** _tokenDecimals));
    }
}
