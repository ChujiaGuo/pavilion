import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pavilion',
  description: 'Organize badminton sessions with players at your level',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
