// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

/**
 * @title SentinelLedger
 * @notice Append-only on-chain audit ledger for the SENTINEL risk-monitoring
 *         system. Only the SentinelCore contract may write entries; reads
 *         are permissionless.
 *
 * @dev PRD §9.2 — EntryType enum, LedgerEntry struct, log(), getStats(),
 *      markAlertConfirmed().
 *
 *      Design decisions
 *      ────────────────
 *      • sentinelCore is set immutably in the constructor (no setter).
 *        If the core contract is upgraded a new ledger must be deployed;
 *        this makes the append-only guarantee enforceable without admin keys.
 *      • zkProofHash stores the keccak256 commitment to an optional ZK proof
 *        submitted by the agent for cryptographic verifiability.
 *      • dataHash stores the keccak256 commitment to the full off-chain
 *        payload (JSON / CBOR) so on-chain storage stays minimal.
 */
contract SentinelLedger {
    // ─────────────────────────────────────────────────────────────────────
    // Enums
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Classification of a ledger entry.
     * @param ALERT              Risk alert fired by the agent.
     * @param DEFENSIVE_ACTION   Protective position action logged by agent.
     * @param PROPOSAL_DRAFT     Governance proposal drafted by agent.
     * @param RISK_QUERY         Risk query answered by agent.
     * @param EXPOSURE_UPDATE    Protocol exposure update.
     * @param POSITION_OPEN      New defensive position registered.
     * @param POSITION_CLOSE     Defensive position closed.
     * @param GENERIC            Catch-all for miscellaneous agent events.
     */
    enum EntryType {
        ALERT,
        DEFENSIVE_ACTION,
        PROPOSAL_DRAFT,
        RISK_QUERY,
        EXPOSURE_UPDATE,
        POSITION_OPEN,
        POSITION_CLOSE,
        GENERIC
    }

    // ─────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice A single immutable audit record.
     * @param timestamp    Block timestamp at log time.
     * @param entryType    Classification of this record (see EntryType).
     * @param protocol     Protocol index in SentinelCore.protocols (or
     *                     type(uint256).max for global / protocol-agnostic).
     * @param amount       Associated USD amount in 6-decimal units (0 if N/A).
     * @param riskScore    Agent risk score 0-100 (0 if N/A).
     * @param zkProofHash  keccak256 of the ZK proof blob (bytes32(0) if none).
     * @param dataHash     keccak256 of the full off-chain payload (required).
     * @param confirmed    True once the alert/action has been externally
     *                     confirmed via markAlertConfirmed().
     */
    struct LedgerEntry {
        uint256 timestamp;
        EntryType entryType;
        uint256 protocol;
        uint256 amount;
        uint8 riskScore;
        bytes32 zkProofHash;
        bytes32 dataHash;
        bool confirmed;
    }

    // ─────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────

    /// @notice The SentinelCore contract that is authorised to write entries.
    address public immutable sentinelCore;

    /// @notice All ledger entries, append-only.
    LedgerEntry[] public entries;

    // Per-type counters for getStats().
    uint256 public totalAlerts;
    uint256 public totalDefensiveActions;
    uint256 public totalProposalDrafts;
    uint256 public totalRiskQueries;
    uint256 public totalExposureUpdates;
    uint256 public totalPositionOpens;
    uint256 public totalPositionCloses;
    uint256 public totalGeneric;

    // ─────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted on every new ledger entry.
     * @param entryId    Zero-based index in the `entries` array.
     * @param entryType  Type classification.
     * @param protocol   Protocol index (or type(uint256).max).
     * @param dataHash   keccak256 of the off-chain payload.
     * @param timestamp  Block timestamp.
     */
    event EntryLogged(
        uint256 indexed entryId,
        EntryType indexed entryType,
        uint256 indexed protocol,
        bytes32 dataHash,
        uint256 timestamp
    );

    /**
     * @notice Emitted when an alert/action entry is confirmed.
     * @param entryId  Index of the confirmed entry.
     */
    event EntryConfirmed(uint256 indexed entryId);

    // ─────────────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────────────

    /// @dev Only the SentinelCore contract may write ledger entries.
    modifier onlyCore() {
        require(
            msg.sender == sentinelCore,
            "SentinelLedger: caller is not SentinelCore"
        );
        _;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @param _sentinelCore  Address of the SentinelCore contract.
     */
    constructor(address _sentinelCore) {
        require(
            _sentinelCore != address(0),
            "SentinelLedger: zero core address"
        );
        sentinelCore = _sentinelCore;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Write functions  (onlyCore)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Append a new entry to the ledger.
     * @dev    Called exclusively by SentinelCore.
     *
     * @param entryType    Classification of this entry.
     * @param protocol     Protocol index (use type(uint256).max for global).
     * @param amount       USD amount in 6-dec units (0 if N/A).
     * @param riskScore    Agent risk score 0-100 (0 if N/A).
     * @param zkProofHash  keccak256 of ZK proof blob (bytes32(0) if none).
     * @param dataHash     keccak256 of the off-chain payload (must be non-zero).
     * @return entryId     Zero-based index of the newly created entry.
     */
    function log(
        EntryType entryType,
        uint256 protocol,
        uint256 amount,
        uint8 riskScore,
        bytes32 zkProofHash,
        bytes32 dataHash
    ) external onlyCore returns (uint256 entryId) {
        require(dataHash != bytes32(0), "SentinelLedger: zero dataHash");

        entryId = entries.length;

        entries.push(
            LedgerEntry({
                timestamp: block.timestamp,
                entryType: entryType,
                protocol: protocol,
                amount: amount,
                riskScore: riskScore,
                zkProofHash: zkProofHash,
                dataHash: dataHash,
                confirmed: false
            })
        );

        _incrementCounter(entryType);

        emit EntryLogged(entryId, entryType, protocol, dataHash, block.timestamp);
    }

    /**
     * @notice Mark an existing entry as externally confirmed.
     * @dev    Only SentinelCore may confirm entries (it relays the call from
     *         the owner or a governance multisig).
     *
     * @param entryId  Zero-based index of the entry to confirm.
     */
    function markAlertConfirmed(uint256 entryId) external onlyCore {
        require(entryId < entries.length, "SentinelLedger: invalid entryId");
        require(
            !entries[entryId].confirmed,
            "SentinelLedger: already confirmed"
        );

        entries[entryId].confirmed = true;

        emit EntryConfirmed(entryId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────

    /**
     * @notice Return aggregate counters for all entry types.
     * @return total               Total number of entries ever logged.
     * @return alerts              Count of ALERT entries.
     * @return defensiveActions    Count of DEFENSIVE_ACTION entries.
     * @return proposalDrafts      Count of PROPOSAL_DRAFT entries.
     * @return riskQueries         Count of RISK_QUERY entries.
     * @return exposureUpdates     Count of EXPOSURE_UPDATE entries.
     * @return positionOpens       Count of POSITION_OPEN entries.
     * @return positionCloses      Count of POSITION_CLOSE entries.
     * @return generic             Count of GENERIC entries.
     */
    function getStats()
        external
        view
        returns (
            uint256 total,
            uint256 alerts,
            uint256 defensiveActions,
            uint256 proposalDrafts,
            uint256 riskQueries,
            uint256 exposureUpdates,
            uint256 positionOpens,
            uint256 positionCloses,
            uint256 generic
        )
    {
        total = entries.length;
        alerts = totalAlerts;
        defensiveActions = totalDefensiveActions;
        proposalDrafts = totalProposalDrafts;
        riskQueries = totalRiskQueries;
        exposureUpdates = totalExposureUpdates;
        positionOpens = totalPositionOpens;
        positionCloses = totalPositionCloses;
        generic = totalGeneric;
    }

    /**
     * @notice Retrieve a single ledger entry by index.
     * @param entryId  Zero-based entry index.
     * @return entry   The LedgerEntry struct.
     */
    function getEntry(
        uint256 entryId
    ) external view returns (LedgerEntry memory entry) {
        require(entryId < entries.length, "SentinelLedger: invalid entryId");
        entry = entries[entryId];
    }

    /**
     * @notice Total number of entries ever logged.
     */
    function entryCount() external view returns (uint256) {
        return entries.length;
    }

    /**
     * @notice Paginated read of entries in range [from, to).
     * @param from  Inclusive start index.
     * @param to    Exclusive end index.
     * @return page  Slice of ledger entries.
     */
    function getEntries(
        uint256 from,
        uint256 to
    ) external view returns (LedgerEntry[] memory page) {
        require(from < to, "SentinelLedger: invalid range");
        require(to <= entries.length, "SentinelLedger: range out of bounds");

        page = new LedgerEntry[](to - from);
        for (uint256 i = from; i < to; i++) {
            page[i - from] = entries[i];
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────

    function _incrementCounter(EntryType entryType) internal {
        if (entryType == EntryType.ALERT) {
            unchecked {
                ++totalAlerts;
            }
        } else if (entryType == EntryType.DEFENSIVE_ACTION) {
            unchecked {
                ++totalDefensiveActions;
            }
        } else if (entryType == EntryType.PROPOSAL_DRAFT) {
            unchecked {
                ++totalProposalDrafts;
            }
        } else if (entryType == EntryType.RISK_QUERY) {
            unchecked {
                ++totalRiskQueries;
            }
        } else if (entryType == EntryType.EXPOSURE_UPDATE) {
            unchecked {
                ++totalExposureUpdates;
            }
        } else if (entryType == EntryType.POSITION_OPEN) {
            unchecked {
                ++totalPositionOpens;
            }
        } else if (entryType == EntryType.POSITION_CLOSE) {
            unchecked {
                ++totalPositionCloses;
            }
        } else {
            unchecked {
                ++totalGeneric;
            }
        }
    }
}
