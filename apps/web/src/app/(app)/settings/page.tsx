'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  useEffect(() => {
    setIsLoading(false);
    try {
      setAudioEnabled(localStorage.getItem('ai_companion_audio_enabled') !== 'false');
    } catch {
      // Use the default when storage is unavailable.
    }
  }, []);

  function handleAudioPreferenceChange(enabled: boolean) {
    setAudioEnabled(enabled);
    try {
      localStorage.setItem('ai_companion_audio_enabled', String(enabled));
    } catch {
      // Keep the preference active for this page if storage is unavailable.
    }
  }

  async function handleLogout() {
    await logout();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-8">Settings</h1>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Account</h2>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-700 dark:text-primary-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900 dark:text-white">{user.fullName || user.email}</p>
              <p className="text-slate-500 dark:text-slate-400">{user.email}</p>
              {user.wallet_address && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-mono font-medium">
                    EVM Wallet
                  </span>
                  <code className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded select-all">
                    {user.wallet_address}
                  </code>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Voice & Audio</h3>
            <label className="flex items-center justify-between gap-4 cursor-pointer">
              <span>
                <span className="block text-sm font-medium text-slate-900 dark:text-white">Enable companion audio automatically</span>
                <span className="block mt-1 text-sm text-slate-500 dark:text-slate-400">You can change this preference any time.</span>
              </span>
              <input
                type="checkbox"
                checked={audioEnabled}
                onChange={(event) => handleAudioPreferenceChange(event.target.checked)}
                className="h-5 w-5 accent-violet-600"
              />
            </label>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
            <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Account Actions</h3>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-4">Danger Zone</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <button
            className="px-4 py-2 rounded-lg font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 transition-colors"
            onClick={() => {
              if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
                alert('Account deletion not yet implemented');
              }
            }}
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}
