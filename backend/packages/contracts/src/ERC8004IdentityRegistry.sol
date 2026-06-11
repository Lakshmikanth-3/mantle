// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title ERC8004IdentityRegistry
/// @notice On-chain identity registry for ERC-8004 AI agents.
///         Agents register with a name, URI, and capability list.
///         SENTINEL Agent #021 registers here at startup.
contract ERC8004IdentityRegistry {

    address public immutable owner;

    struct AgentIdentity {
        string  name;
        string  agentURI;       // IPFS or HTTPS metadata URI
        string  capabilities;   // comma-separated: "risk-monitor,governance,oracle"
        address operator;       // wallet that controls this agent
        uint256 registeredAt;
        bool    active;
    }

    mapping(uint256 => AgentIdentity) public agents;
    uint256 public totalAgents;

    event AgentRegistered(
        uint256 indexed agentId,
        string  name,
        address indexed operator,
        uint256 timestamp
    );
    event AgentUpdated(uint256 indexed agentId, string field, uint256 timestamp);
    event AgentDeactivated(uint256 indexed agentId, uint256 timestamp);

    modifier onlyOwnerOrOperator(uint256 agentId) {
        require(
            msg.sender == owner || msg.sender == agents[agentId].operator,
            "ERC8004Identity: not authorised"
        );
        _;
    }

    constructor(address _owner) {
        owner = _owner;
    }

    /// @notice Register a new AI agent identity
    function registerAgent(
        uint256 agentId,
        string calldata name,
        string calldata agentURI,
        string calldata capabilities
    ) external returns (uint256) {
        require(bytes(name).length > 0, "ERC8004Identity: empty name");
        require(agents[agentId].registeredAt == 0, "ERC8004Identity: agentId already registered");

        agents[agentId] = AgentIdentity({
            name:         name,
            agentURI:     agentURI,
            capabilities: capabilities,
            operator:     msg.sender,
            registeredAt: block.timestamp,
            active:       true
        });

        totalAgents++;
        emit AgentRegistered(agentId, name, msg.sender, block.timestamp);
        return agentId;
    }

    /// @notice Update agent metadata URI
    function updateAgentURI(uint256 agentId, string calldata newURI)
        external
        onlyOwnerOrOperator(agentId)
    {
        agents[agentId].agentURI = newURI;
        emit AgentUpdated(agentId, "agentURI", block.timestamp);
    }

    function deactivateAgent(uint256 agentId) external onlyOwnerOrOperator(agentId) {
        agents[agentId].active = false;
        emit AgentDeactivated(agentId, block.timestamp);
    }

    function isRegistered(uint256 agentId) external view returns (bool) {
        return agents[agentId].registeredAt > 0 && agents[agentId].active;
    }

    function getAgent(uint256 agentId) external view returns (AgentIdentity memory) {
        return agents[agentId];
    }
}
