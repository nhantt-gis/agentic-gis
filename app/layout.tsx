/**
 * Root layout for the application.
 */

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GTEL Maps — AI Copilot',
  description:
    'Control your map with natural language using GTEL Maps AI Copilot. Navigate, search, and visualize — all with plain English.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
