'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useLogin, type User } from '@privy-io/react-auth';
import { useAuth } from '@/context/AuthContext';

interface PrivySignInButtonProps {
  text?: string;
  onError?: (err: string) => void;
}

export const PrivySignInButton: React.FC<PrivySignInButtonProps> = ({
  text = 'Continue with Privy',
  onError,
}) => {
  const router = useRouter();
  const { ready, getAccessToken } = usePrivy();
  const { loginWithPrivy } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePrivySuccess = async (privyUser: User) => {
    setIsProcessing(true);
    try {
      const token = (await getAccessToken()) || '';
      const email =
        privyUser?.email?.address ||
        privyUser?.google?.email ||
        privyUser?.twitter?.username ||
        undefined;
      const walletAddress = privyUser?.wallet?.address || undefined;
      const fullName =
        privyUser?.google?.name ||
        privyUser?.twitter?.name ||
        undefined;

      await loginWithPrivy({
        token,
        privy_user_id: privyUser.id,
        email,
        wallet_address: walletAddress,
        full_name: fullName,
      });

      // Check companions to determine destination
      try {
        const companionsRes = await fetch('/api/companions');
        if (companionsRes.ok) {
          const data = await companionsRes.json();
          const list = Array.isArray(data) ? data : (data.items || data.companions || []);
          if (list.length > 0) {
            router.push(`/chat?companionId=${list[0].id}`);
            return;
          }
        }
      } catch (checkErr) {
        console.warn('Could not check companions post-login:', checkErr);
      }
      router.push('/onboarding/companion');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Privy sign-in failed';
      onError?.(msg);
      setIsProcessing(false);
    }
  };

  const { login } = useLogin({
    onComplete: ({ user: loggedInUser }) => {
      handlePrivySuccess(loggedInUser);
    },
    onError: (error) => {
      onError?.(error ? String(error) : 'Login cancelled');
    },
  });

  if (!ready) {
    return (
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium shadow-sm opacity-60"
      >
        Loading Privy...
      </button>
    );
  }

  return (
    <div className="w-full flex flex-col items-center">
      <button
        type="button"
        onClick={() => login()}
        disabled={isProcessing}
        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-indigo-500/40 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-sm font-semibold shadow-sm transition-all duration-200 disabled:opacity-50"
      >
        <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2"/>
          <path d="M7 7h10"/>
          <path d="M7 12h10"/>
          <path d="M7 17h10"/>
        </svg>
        {isProcessing ? 'Connecting...' : text}
      </button>

      {isProcessing && (
        <div className="mt-2 text-xs text-indigo-500 flex items-center gap-1.5 animate-pulse">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Authenticating & synchronizing wallet...
        </div>
      )}
    </div>
  );
};

