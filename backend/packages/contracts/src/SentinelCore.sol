// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SentinelCore
 * @notice On-chain anchor for the SENTINEL risk-monitoring AI agent.
 *         Provides an immutable audit trail, gas reservoir management,
 *         defensive-position registry, and the on-chain interface through
 *         which the off-chain agent emits risk intelligence.
 *
 * @dev  PRD §9.1 — all constants, structs, events, and functions defined
 *       in the product requirements document are implemented here.
 *
 *       Access model
 *       ─────────────
 *       • owner  – deployer; can add protocols, set the agent wallet, and
 *                  drain the gas reservoir in emergencies.
 *       • agent  – a single EOA (the off-chain SENTINEL process); can fire
 *                  alerts, log defensive actions, log proposals, serve risk
 *                  queries, and consume gas from the reservoir.
 */
contract SentinelCore is Ownable {
    // ─────────────────────────────────────────────────────────────────────
    // Constants  (PRD §9.1 — guard-rail thresholds)
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Alert threshold in 6-decimal USD units (500 000 USDC = $500 k).
    uint256 public constant ALERT_THRESHOLD_USD = 500_000e6;

    /// @notice Critical threshold in 6-decimal USD units ($5 M).
    uint256 public constant CRITICAL_THRESHOLD_USD = 5_000_000e6;

    /// @notice Maximum single defensive position in 6-decimal USD units ($10 k).
    uint256 public constant MAX_DEFENSIVE_POSITION = 10_000e6;

    /// @notice Minimum MNT balance that must remain in the gas reservoir.
    uint256 public constant GAS_RESERVOIR_MIN = 0.05 ether; // 0.05 MNT

    /// @notice Fraction of each risk-query fee routed to the reservoir (3 %).
    uint256 public constant GAS_ROUTING_BPS = 300; // 300 / 10 000 = 3 %

    // ─────────────────────────────────────────────────────────────────────
    // Data structures
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Metadata for a protocol that SENTINEL monitors.
     * @param name          Human-readable protocol name (e.g. "Lendle").
     * @param contractAddr  Representative contract address on Mantle.
     * @param exposureUSD   Current tracked exposure in 6-decimal USD units.
     * @param active        Whether the protocol is actively monitored.
     */
    struct MonitoredProtocol {
        string name;
        address contractAddr;
        uint256 exposureUSD;
        bool active;
    }

    /**
     * @notice A position that SENTINEL has registered as defensively managed.
     * @param protocol      Protocol index in `protocols` array.
     * @param amountUSD     Position size in 6-decimal USD units.
     * @param active        Whether the position is still open.
     * @param openedAt      Block timestamp when the position was registered.
     */
    struct SentinelPosition {
        uint256 protocol;
        uint256 amountUSD;
        bool active;
        uint256 openedAt;
    }

    // ─────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Authorized off-chain agent wallet.
    address public agentWallet;

    /// @notice Ordered list of monitored protocols (append-only).
    MonitoredProtocol[] public protocols;

    /// @notice Defensive positions keyed by a caller-supplied positionId.
    mapping(uint256 => SentinelPosition) public sentinelPositions;

    /// @notice Internal MNT balance reserved for agent gas.
    uint256 public gasReservoir;

    /// @notice Total number of alerts ever fired.
    uint256 public totalAlerts;

    /// @notice Total number of defensive actions ever logged.
    uint256 public totalDefensiveActions;

    // ─────────────────────────────────────────────────────────────────────
    // Events  (PRD §9.1)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when the agent fires a risk alert.
     * @param alertId        Monotonically increasing alert counter.
     * @param protocolIndex  Index into `protocols` array.
     * @param exposureUSD    Snapshot exposure at the time of alert (6-dec).
     * @param riskScore      Agent-computed risk score (0–100).
     * @param isCritical     True if exposure exceeds CRITICAL_THRESHOLD_USD.
     * @param timestamp      Block timestamp.
     */
    event AlertFired(
        uint256 indexed alertId,
        uint256 indexed protocolIndex,
        uint256 exposureUSD,
        uint8 riskScore,
        bool isCritical,
        uint256 timestamp
    );

    /**
     * @notice Emitted when the agent logs a completed defensive action.
     * @param actionId       Monotonically increasing action counter.
     * @param positionId     Caller-supplied position identifier.
     * @param protocol       Protocol index.
     * @param amountUSD      Position size (6-dec).
     * @param action         Short action descriptor (e.g. "WITHDRAW").
     * @param timestamp      Block timestamp.
     */
    event DefensiveActionTaken(
        uint256 indexed actionId,
        uint256 indexed positionId,
        uint256 indexed protocol,
        uint256 amountUSD,
        string action,
        uint256 timestamp
    );

    /**
     * @notice Emitted when the agent drafts a governance proposal.
     * @param proposalId     Caller-supplied proposal reference.
     * @param protocol       Protocol index this proposal targets.
     * @param descriptionHash  keccak256 of the proposal description text.
     * @param timestamp      Block timestamp.
     */
    event ProposalDrafted(
        uint256 indexed proposalId,
        uint256 indexed protocol,
        bytes32 descriptionHash,
        uint256 timestamp
    );

    /**
     * @notice Emitted whenever the agent answers a risk query.
     * @param queryId        Unique query identifier supplied by agent.
     * @param requester      Address that triggered the query.
     * @param protocol       Protocol index queried (type(uint256).max = all).
     * @param riskScore      Agent-computed risk score (0–100).
     * @param responseHash   keccak256 of the off-chain response payload.
     * @param timestamp      Block timestamp.
     */
    event RiskQueryServed(
        uint256 indexed queryId,
        address indexed requester,
        uint256 protocol,
        uint8 riskScore,
        bytes32 responseHash,
        uint256 timestamp
    );

    /**
     * @notice Emitted when MNT is added to the gas reservoir.
     * @param funder      Address that sent MNT.
     * @param amount      Amount added (wei).
     * @param newBalance  Updated reservoir balance (wei).
     */
    event GasReservoirFunded(
        address indexed funder,
        uint256 amount,
        uint256 newBalance
    );

    /**
     * @notice Emitted when the gas reservoir is drained by the agent.
     * @param amount    Amount consumed (wei).
     * @param remaining Reservoir balance after consumption.
     */
    event GasConsumed(uint256 amount, uint256 remaining);

    /**
     * @notice Emitted when a new protocol is registered.
     * @param index       Index in the protocols array.
     * @param name        Protocol name.
     * @param contractAddr Representative contract address.
     */
    event ProtocolAdded(uint256 indexed index, string name, address contractAddr);

    /**
     * @notice Emitted when a protocol's exposure is updated.
     * @param index       Protocol index.
     * @param oldExposure Previous exposure (6-dec USD).
     * @param newExposure Updated exposure (6-dec USD).
     */
    event ExposureUpdated(
        uint256 indexed index,
        uint256 oldExposure,
        uint256 newExposure
    );

    /**
     * @notice Emitted when a defensive position is registered.
     * @param positionId  Caller-supplied position identifier.
     * @param protocol    Protocol index.
     * @param amountUSD   Position size (6-dec USD).
     */
    event PositionRegistered(
        uint256 indexed positionId,
        uint256 indexed protocol,
        uint256 amountUSD
    );

    /**
     * @notice Emitted when the agent wallet is updated.
     * @param oldAgent Previous agent address.
     * @param newAgent New agent address.
     */
    event AgentWalletUpdated(address indexed oldAgent, address indexed newAgent);

    // ─────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Reverts unless the caller is the authorised agent wallet.
    modifier onlyAgent() {
        require(msg.sender == agentWallet, "SentinelCore: caller is not agent");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @param _owner       Address that will own the contract (multisig / DAO).
     * @param _agentWallet Address of the off-chain SENTINEL agent EOA.
     * @param _protocolNames       Initial set of protocol names.
     * @param _protocolContracts   Corresponding contract addresses.
     */
    constructor(
        address _owner,
        address _agentWallet,
        string[] memory _protocolNames,
        address[] memory _protocolContracts
    ) Ownable(_owner) {
        require(_agentWallet != address(0), "SentinelCore: zero agent address");
        require(
            _protocolNames.length == _protocolContracts.length,
            "SentinelCore: array length mismatch"
        );

        agentWallet = _agentWallet;
        emit AgentWalletUpdated(address(0), _agentWallet);

        for (uint256 i = 0; i < _protocolNames.length; i++) {
            _addProtocol(_protocolNames[i], _protocolContracts[i]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Receive / fallback — fund the gas reservoir
    // ─────────────────────────────────────────────────────────────────────

    receive() external payable {
        _fundReservoir(msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Agent-facing functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Fire a risk alert for a monitored protocol.
     * @dev    Exposure must reach ALERT_THRESHOLD_USD; isCritical is set
     *         automatically when it reaches CRITICAL_THRESHOLD_USD.
     *         Only the registered agent may call.
     *
     * @param protocolIndex  Index into the `protocols` array.
     * @param riskScore      Agent-computed risk score (0–100 inclusive).
     * @return alertId       The new monotonic alert identifier.
     */
    function fireAlert(
        uint256 protocolIndex,
        uint8 riskScore
    ) external onlyAgent returns (uint256 alertId) {
        require(
            protocolIndex < protocols.length,
            "SentinelCore: invalid protocol index"
        );
        require(
            protocols[protocolIndex].active,
            "SentinelCore: protocol not active"
        );
        require(riskScore <= 100, "SentinelCore: riskScore > 100");

        MonitoredProtocol storage proto = protocols[protocolIndex];
        require(
            proto.exposureUSD >= ALERT_THRESHOLD_USD,
            "SentinelCore: exposure below alert threshold"
        );

        bool isCritical = proto.exposureUSD >= CRITICAL_THRESHOLD_USD;

        alertId = ++totalAlerts;

        emit AlertFired(
            alertId,
            protocolIndex,
            proto.exposureUSD,
            riskScore,
            isCritical,
            block.timestamp
        );
    }

    /**
     * @notice Log that the agent has executed a defensive action.
     * @dev    The positionId must have been registered via `registerPosition`.
     *         Position amount must not exceed MAX_DEFENSIVE_POSITION.
     *
     * @param positionId  Identifier of the position affected.
     * @param action      Short descriptor, e.g. "WITHDRAW" or "REDUCE".
     * @return actionId   The new monotonic action identifier.
     */
    function logDefensiveAction(
        uint256 positionId,
        string calldata action
    ) external onlyAgent returns (uint256 actionId) {
        SentinelPosition storage pos = sentinelPositions[positionId];
        require(pos.active, "SentinelCore: position not active");
        require(
            pos.amountUSD <= MAX_DEFENSIVE_POSITION,
            "SentinelCore: position exceeds max defensive size"
        );
        require(bytes(action).length > 0, "SentinelCore: empty action");

        actionId = ++totalDefensiveActions;

        emit DefensiveActionTaken(
            actionId,
            positionId,
            pos.protocol,
            pos.amountUSD,
            action,
            block.timestamp
        );
    }

    /**
     * @notice Log a governance proposal drafted by the agent.
     *
     * @param proposalId      Caller-supplied reference (e.g. Snapshot id).
     * @param protocolIndex   Protocol this proposal targets.
     * @param description     Full proposal description text (emitted as hash).
     */
    function logProposalDraft(
        uint256 proposalId,
        uint256 protocolIndex,
        string calldata description
    ) external onlyAgent {
        require(
            protocolIndex < protocols.length,
            "SentinelCore: invalid protocol index"
        );
        require(bytes(description).length > 0, "SentinelCore: empty description");

        bytes32 descHash = keccak256(bytes(description));

        emit ProposalDrafted(proposalId, protocolIndex, descHash, block.timestamp);
    }

    /**
     * @notice Record that the agent has answered a risk query.
     * @dev    3 % of the attached MNT value is routed to the gas reservoir.
     *
     * @param queryId       Unique query id (supplied by off-chain caller).
     * @param requester     Address that originated the query.
     * @param protocolIndex Protocol queried; pass type(uint256).max for global.
     * @param riskScore     Agent answer (0–100).
     * @param responseHash  keccak256 of the off-chain JSON response payload.
     */
    function logRiskQuery(
        uint256 queryId,
        address requester,
        uint256 protocolIndex,
        uint8 riskScore,
        bytes32 responseHash
    ) external payable onlyAgent {
        require(riskScore <= 100, "SentinelCore: riskScore > 100");

        // Route 3 % of any attached value to the gas reservoir.
        if (msg.value > 0) {
            uint256 reservoirShare = (msg.value * GAS_ROUTING_BPS) / 10_000;
            if (reservoirShare > 0) {
                _fundReservoir(reservoirShare);
            }
        }

        emit RiskQueryServed(
            queryId,
            requester,
            protocolIndex,
            riskScore,
            responseHash,
            block.timestamp
        );
    }

    /**
     * @notice Consume MNT from the gas reservoir to fund agent transactions.
     * @dev    Reservoir must remain above GAS_RESERVOIR_MIN after the draw.
     *
     * @param amount   Amount of MNT (wei) to transfer to the agent wallet.
     */
    function consumeGas(uint256 amount) external onlyAgent {
        require(amount > 0, "SentinelCore: zero amount");
        require(
            gasReservoir >= amount + GAS_RESERVOIR_MIN,
            "SentinelCore: insufficient reservoir (min floor)"
        );

        gasReservoir -= amount;

        (bool ok, ) = agentWallet.call{value: amount}("");
        require(ok, "SentinelCore: MNT transfer failed");

        emit GasConsumed(amount, gasReservoir);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public / permissionless functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Fund the gas reservoir by sending MNT to this function.
     */
    function addToGasReservoir() external payable {
        require(msg.value > 0, "SentinelCore: zero value");
        _fundReservoir(msg.value);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Owner-facing admin functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a defensive position for a monitored protocol.
     * @dev    Can be called by owner OR agent to support autonomous
     *         position management within the MAX_DEFENSIVE_POSITION cap.
     *
     * @param positionId   Caller-supplied unique position identifier.
     * @param protocolIndex  Protocol index this position is in.
     * @param amountUSD    Position size in 6-decimal USD units.
     */
    function registerPosition(
        uint256 positionId,
        uint256 protocolIndex,
        uint256 amountUSD
    ) external {
        require(
            msg.sender == owner() || msg.sender == agentWallet,
            "SentinelCore: caller not owner or agent"
        );
        require(
            protocolIndex < protocols.length,
            "SentinelCore: invalid protocol index"
        );
        require(
            amountUSD > 0 && amountUSD <= MAX_DEFENSIVE_POSITION,
            "SentinelCore: amount out of range"
        );
        require(
            !sentinelPositions[positionId].active,
            "SentinelCore: position already active"
        );

        sentinelPositions[positionId] = SentinelPosition({
            protocol: protocolIndex,
            amountUSD: amountUSD,
            active: true,
            openedAt: block.timestamp
        });

        emit PositionRegistered(positionId, protocolIndex, amountUSD);
    }

    /**
     * @notice Add a new protocol to the monitored list.
     * @dev    Only the owner can extend the protocol registry.
     *
     * @param name          Protocol name.
     * @param contractAddr  Representative contract address.
     */
    function addProtocol(
        string calldata name,
        address contractAddr
    ) external onlyOwner {
        _addProtocol(name, contractAddr);
    }

    /**
     * @notice Update the tracked exposure for a protocol.
     * @dev    Can be called by owner OR agent.
     *
     * @param protocolIndex  Protocol to update.
     * @param newExposureUSD New exposure in 6-decimal USD units.
     */
    function updateExposure(
        uint256 protocolIndex,
        uint256 newExposureUSD
    ) external {
        require(
            msg.sender == owner() || msg.sender == agentWallet,
            "SentinelCore: caller not owner or agent"
        );
        require(
            protocolIndex < protocols.length,
            "SentinelCore: invalid protocol index"
        );

        uint256 old = protocols[protocolIndex].exposureUSD;
        protocols[protocolIndex].exposureUSD = newExposureUSD;

        emit ExposureUpdated(protocolIndex, old, newExposureUSD);
    }

    /**
     * @notice Deactivate a protocol (stops alerts being fired for it).
     * @param protocolIndex  Protocol to deactivate.
     */
    function deactivateProtocol(uint256 protocolIndex) external onlyOwner {
        require(
            protocolIndex < protocols.length,
            "SentinelCore: invalid protocol index"
        );
        protocols[protocolIndex].active = false;
    }

    /**
     * @notice Close (deactivate) a registered position.
     * @param positionId  Position to close.
     */
    function closePosition(uint256 positionId) external {
        require(
            msg.sender == owner() || msg.sender == agentWallet,
            "SentinelCore: caller not owner or agent"
        );
        require(
            sentinelPositions[positionId].active,
            "SentinelCore: position not active"
        );
        sentinelPositions[positionId].active = false;
    }

    /**
     * @notice Rotate the authorised agent wallet.
     * @param newAgent  New agent EOA address.
     */
    function setAgentWallet(address newAgent) external onlyOwner {
        require(newAgent != address(0), "SentinelCore: zero address");
        address old = agentWallet;
        agentWallet = newAgent;
        emit AgentWalletUpdated(old, newAgent);
    }

    /**
     * @notice Emergency drain of the gas reservoir to the owner.
     * @dev    Bypasses GAS_RESERVOIR_MIN; owner-only.
     */
    function emergencyDrainReservoir() external onlyOwner {
        uint256 amount = gasReservoir;
        gasReservoir = 0;
        (bool ok, ) = owner().call{value: amount}("");
        require(ok, "SentinelCore: drain transfer failed");
    }

    // ─────────────────────────────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────────────────────────────

    /// @notice Returns the total number of registered protocols.
    function protocolCount() external view returns (uint256) {
        return protocols.length;
    }

    /// @notice Returns full MonitoredProtocol data for a given index.
    function getProtocol(
        uint256 index
    ) external view returns (MonitoredProtocol memory) {
        require(index < protocols.length, "SentinelCore: invalid index");
        return protocols[index];
    }

    /// @notice Returns full SentinelPosition data for a given positionId.
    function getPosition(
        uint256 positionId
    ) external view returns (SentinelPosition memory) {
        return sentinelPositions[positionId];
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────

    function _fundReservoir(uint256 amount) internal {
        gasReservoir += amount;
        emit GasReservoirFunded(msg.sender, amount, gasReservoir);
    }

    function _addProtocol(string memory name, address contractAddr) internal {
        require(bytes(name).length > 0, "SentinelCore: empty protocol name");
        require(contractAddr != address(0), "SentinelCore: zero contract address");

        uint256 index = protocols.length;
        protocols.push(
            MonitoredProtocol({
                name: name,
                contractAddr: contractAddr,
                exposureUSD: 0,
                active: true
            })
        );

        emit ProtocolAdded(index, name, contractAddr);
    }
}
