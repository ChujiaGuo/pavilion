import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Most routes here have no server-side per-request data (auth is checked
  // client-side via useRequireAuth), so Next prerenders them as static HTML
  // at build time — which bakes in zero nonce attributes, since no request
  // exists yet to generate one from. middleware.ts's per-request CSP nonce
  // is then meaningless: the browser gets a fresh nonce in the header but a
  // static page with no matching nonce on any script tag. Reading headers()
  // here opts every route into dynamic (per-request) rendering, which is
  // what actually makes Next stamp that nonce onto its inline hydration
  // scripts. Confirmed by curling the prod build before/after — without
  // this, /profile's HTML was byte-identical across requests and carried no
  // nonce attribute at all despite the header rotating correctly.
  await headers();

  return (
    <html lang="en" className={nunito.variable}>
      <body className="font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
