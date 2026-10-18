import type { Metadata } from 'next';
import { Albert_Sans, Fragment_Mono, Sofia_Sans_Semi_Condensed } from 'next/font/google';
import './globals.css';

const display = Sofia_Sans_Semi_Condensed({ variable: '--font-display', subsets: ['latin'], weight: ['700'] });
const body = Albert_Sans({ variable: '--font-body', subsets: ['latin'], weight: ['400', '500', '600', '700'] });
const mono = Fragment_Mono({ variable: '--font-mono', subsets: ['latin'], weight: ['400'] });

export const metadata: Metadata = {
  title: 'Receipts',
  description: "Receipts sends your errands to Wajo's Fo agent under rules you wrote once, then reads your own Google Calendar to confirm the result landed.",
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
