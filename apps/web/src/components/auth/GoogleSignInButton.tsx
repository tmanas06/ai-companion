'use client';

import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number | string;
            }
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onError?: (err: string) => void;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  text = 'continue_with',
  onError,
}) => {
  const router = useRouter();
  const { loginWithGoogle } = useAuth();
  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const clientId =
    process.env['NEXT_PUBLIC_GOOGLE_CLIENT_ID'] ||
    '945131031074-k3h44mknuv8spo714b90pu5fb1po0cbf.apps.googleusercontent.com';

  const handleCredentialResponse = async (response: { credential: string }) => {
    if (!response.credential) return;
    setIsProcessing(true);
    try {
      await loginWithGoogle(response.credential);

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
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      onError?.(msg);
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (scriptLoaded && window.google?.accounts?.id && buttonContainerRef.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
        });

        buttonContainerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: 384,
          logo_alignment: 'left',
        });
      } catch (err) {
        console.error('Failed to initialize Google Sign-In button:', err);
      }
    }
  }, [scriptLoaded, clientId, text]);

  return (
    <div className="w-full flex flex-col items-center">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />

      <div
        ref={buttonContainerRef}
        className="w-full flex justify-center min-h-[44px]"
      >
        {/* Placeholder while Google Script loads */}
        {!scriptLoaded && (
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium shadow-sm opacity-60"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Loading Google Sign-In...
          </button>
        )}
      </div>

      {isProcessing && (
        <div className="mt-2 text-xs text-sky-500 flex items-center gap-1.5 animate-pulse">
          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Authenticating & generating EVM wallet...
        </div>
      )}
    </div>
  );
};
