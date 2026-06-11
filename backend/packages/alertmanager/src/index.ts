import './env.js';
import { routeAlert } from './router.js';

console.log('[alertmanager] Starting AlertManager service...');
console.log('[alertmanager] Connecting to Watcher event bus...');

// In a real microservices architecture, this would use Redis PubSub or RabbitMQ.
// Since we are running concurrently, we can expose a simple HTTP endpoint or use a shared DB.
// For hackathon simplicity, we will just start the router and wait for manual triggers or DB sweeps.

setInterval(() => {
  // Sweeping logic or listening to indexer events
}, 10000);

export {};
