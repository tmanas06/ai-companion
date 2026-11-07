import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { PrivyAuthProvider } from '@/components/auth/PrivyAuthProvider';
import { AuthProvider } from '@/context/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Companion',
  description: 'Your personal AI companion with persistent memory',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] dark:bg-portfolio-pattern text-slate-900 dark:text-slate-50 antialiased">
        <PrivyAuthProvider>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </PrivyAuthProvider>
      </body>
    </html>
  );
}