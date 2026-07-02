import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Pavilion',
  description: 'Organize badminton sessions with players at your level',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={nunito.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
