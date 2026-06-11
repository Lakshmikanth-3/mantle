import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SENTINEL — Autonomous DeFi Risk Oracle on Mantle Network',
  description:
    'SENTINEL is a fully autonomous AI agent that continuously monitors every bridge protocol with Mantle exposure for cross-chain invariant violations. Detects threats in 2 seconds. Drafts governance proposals in 8 minutes. ERC-8004 verified.',
  openGraph: {
    title: 'SENTINEL — Autonomous DeFi Risk Oracle',
    description: 'Kelp DAO\'s team detected the exploit in 46 minutes. SENTINEL detects it in 2 seconds.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
