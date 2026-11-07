'use client';

import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

const PRIVY_APP_ID =
  process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ||
  'cmw51o126004a0gjt3pfuddy1';

export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'twitter', 'github'],
        appearance: {
          theme: 'dark',
          accentColor: '#6366f1',
          showWalletLoginFirst: false,
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
