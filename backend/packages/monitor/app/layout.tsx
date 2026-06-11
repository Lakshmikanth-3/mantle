import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SENTINEL | Mantle DeFi Risk Oracle',
  description:
    'SENTINEL — Autonomous ERC-8004 risk oracle monitoring cross-chain collateral flows on Mantle Network. Real-time invariant detection, x402 economic security, and autonomous governance.',
  keywords: ['SENTINEL', 'Mantle', 'DeFi', 'risk oracle', 'ERC-8004', 'autonomous agent'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⬡</text></svg>" />
      </head>
      <body>{children}</body>
    </html>
  );
}
