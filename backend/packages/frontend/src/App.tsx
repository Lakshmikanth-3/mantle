import { useState, useEffect } from 'react';
import { Activity, ShieldAlert, ShieldCheck, Cpu, Database, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
import './index.css';

// Mock protocols data for the dashboard fallback
const initialProtocols = [
  { id: 'rsETH', name: 'rsETH (Kelp DAO)', exposure: 292000000, riskScore: 12, icon: '🌊', color: '#3b82f6' },
  { id: 'mETH', name: 'mETH (Mantle LSP)', exposure: 415000000, riskScore: 8, icon: '💧', color: '#10b981' },
  { id: 'USDY', name: 'USDY (Ondo)', exposure: 125000000, riskScore: 5, icon: '💵', color: '#f59e0b' },
  { id: 'xStocks', name: 'xStocks', exposure: 45000000, riskScore: 22, icon: '📈', color: '#8b5cf6' },
  { id: 'Byreal', name: 'Byreal Portal', exposure: 18000000, riskScore: 15, icon: '🌌', color: '#ec4899' },
];

const mockAlerts = [
  { id: 1, type: 'info', title: 'System Online', desc: 'Sentinel Agent #021 monitoring 5 protocols.', time: '2m ago' },
  { id: 2, type: 'warning', title: 'Sentiment Drop', desc: 'mETH social sentiment dropped 15% vs 7d baseline.', time: '1h ago' }
];

const sentinelCoreAddress = '0x38E0D4468Afdd12776b7D371166edED8E9522054';
const erc8004ReputationAddress = '0x02807Be6d2B2934C677A448c011404497a814cA2';

const sentinelCoreAbi = parseAbi([
  'function gasReservoir() view returns (uint256)',
  'function protocolCount() view returns (uint256)',
  'function getProtocol(uint256) view returns (string name, address contractAddr, uint256 exposureUSD, bool active)'
]);

const erc8004Abi = parseAbi([
  'function getReputationScore(uint256 agentId) view returns (uint256)'
]);

const publicClient = createPublicClient({
  chain: mantleSepoliaTestnet,
  transport: http('https://rpc.sepolia.mantle.xyz')
});

function App() {
  const [protocols, setProtocols] = useState(initialProtocols);
  const [alerts, setAlerts] = useState(mockAlerts);
  const [isSimulating, setIsSimulating] = useState(false);
  const [systemHealth, setSystemHealth] = useState(100);
  const [wsConnected, setWsConnected] = useState(false);
  
  // Live on-chain data state
  const [gasReservoir, setGasReservoir] = useState('0.00');
  const [reputationScore, setReputationScore] = useState(99.2); // Default fallback

  useEffect(() => {
    // 1. Fetch live on-chain metrics
    const fetchOnChainData = async () => {
      try {
        const gas = await publicClient.readContract({
          address: sentinelCoreAddress,
          abi: sentinelCoreAbi,
          functionName: 'gasReservoir'
        });
        setGasReservoir(Number(formatEther(gas)).toFixed(4));
        
        try {
          const score = await publicClient.readContract({
            address: erc8004ReputationAddress,
            abi: erc8004Abi,
            functionName: 'getReputationScore',
            args: [21n] // agentId = 21
          });
          setReputationScore(Number(score) / 100); // Assuming 10000 basis points
        } catch(e) {
          console.warn('Failed to fetch reputation score (ERC8004 might not be fully initialized). Using fallback.');
        }

      } catch (err) {
        console.error('Failed to fetch on-chain data', err);
      }
    };
    
    fetchOnChainData();
    const interval = setInterval(fetchOnChainData, 15000); // Refresh every 15s

    // 2. Connect WebSocket to AlertManager
    const ws = new WebSocket('ws://localhost:3000');
    
    ws.onopen = () => {
      console.log('Connected to Sentinel WS API');
      setWsConnected(true);
    };

    ws.onclose = () => {
      console.log('Disconnected from Sentinel WS API');
      setWsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'INVARIANT_VIOLATION') {
          const payload = data.payload;
          setProtocols(prev => prev.map(p => 
            p.name.includes(payload.protocol) ? { ...p, riskScore: payload.severity === 'CRITICAL' ? 94 : 75 } : p
          ));
          
          const newAlert = { 
            id: Date.now(), 
            type: payload.severity.toLowerCase(), 
            title: `${payload.severity}: Invariant Violation`, 
            desc: `${payload.protocol}: ${payload.amount} tokens. ${payload.reason}`,
            time: new Date(payload.timestamp).toLocaleTimeString()
          };
          
          setAlerts(prev => [newAlert, ...prev].slice(0, 50));
          setSystemHealth(Math.max(0, systemHealth - 15));
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, [systemHealth]);

  const triggerExploit = async () => {
    setIsSimulating(true);
    
    try {
      const response = await fetch('http://localhost:3000/trigger-exploit', {
        method: 'POST'
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      
      console.log('Exploit transaction sent! Hash:', data.hash);
      // The button remains in 'Simulating...' state until the WS event arrives or times out
      setTimeout(() => setIsSimulating(false), 5000);
    } catch (err) {
      console.error('Failed to trigger exploit:', err);
      setIsSimulating(false);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'var(--danger)';
    if (score >= 45) return 'var(--warning)';
    return 'var(--success)';
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>
          <ShieldCheck size={36} color="var(--primary)" /> 
          SENTINEL Dashboard
        </h1>
        <div className="status-badge" style={{ backgroundColor: wsConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)', color: wsConnected ? 'var(--success)' : 'var(--danger)' }}>
          <div className="status-dot" style={{ backgroundColor: wsConnected ? 'var(--success)' : 'var(--danger)' }}></div>
          Agent #021 {wsConnected ? 'Online' : 'Offline'}
        </div>
      </header>

      <div className="grid-dashboard">
        {/* Main Metrics */}
        <div className="col-span-8 glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 className="card-title"><Activity size={20} /> Monitored Protocols</h2>
            <button 
              className="btn-trigger" 
              onClick={triggerExploit}
              disabled={isSimulating}
            >
              <AlertTriangle size={18} />
              {isSimulating ? 'Simulating...' : 'Trigger Test Exploit'}
            </button>
          </div>
          
          <div className="protocol-list">
            {protocols.map((protocol, idx) => (
              <motion.div 
                key={protocol.id}
                className="protocol-item"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <div className="protocol-info">
                  <div className="protocol-icon">{protocol.icon}</div>
                  <div>
                    <div className="protocol-name">{protocol.name}</div>
                    <div className="protocol-exposure">TVL Exposure: ${(protocol.exposure / 1000000).toFixed(1)}M</div>
                  </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: getRiskColor(protocol.riskScore) }}>
                    {protocol.riskScore}/100
                  </div>
                  <div className="risk-bar-container">
                    <div 
                      className="risk-bar" 
                      style={{ 
                        width: `${protocol.riskScore}%`, 
                        backgroundColor: getRiskColor(protocol.riskScore) 
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="col-span-4" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="glass-panel">
            <h2 className="card-title"><Cpu size={20} /> System Status</h2>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Mantle Listener</div>
              <div style={{ color: 'var(--success)', fontWeight: 600 }}>Syncing (WSS)</div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Gas Reservoir (MNT)</div>
              <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{gasReservoir} MNT</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>ERC-8004 Reputation</div>
              <div style={{ color: 'var(--primary)', fontWeight: 600 }}>{reputationScore.toFixed(1)}% Trust Score</div>
            </div>
          </div>

          <div className="glass-panel" style={{ flex: 1 }}>
            <h2 className="card-title"><ShieldAlert size={20} /> Alert Feed</h2>
            <div className="alert-feed">
              {alerts.map(alert => (
                <motion.div 
                  key={alert.id} 
                  className={`alert-item ${alert.type}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  <div className="alert-header">
                    <span>{alert.title}</span>
                    <span className="alert-time">{alert.time}</span>
                  </div>
                  <div className="alert-desc">{alert.desc}</div>
                </motion.div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;

