'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { AvatarRenderer } from '@/components/companion/AvatarRenderer';

interface PreviewTabProps {
  activeAvatar: Avatar | null;
  assets: Record<string, Asset[]>;
  avatars: Avatar[];
  setActiveAvatar: React.Dispatch<React.SetStateAction<Avatar | null>>;
  handleActivate: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  startEdit: (avatar: Avatar) => void;
}

export const PreviewTab = ({
  activeAvatar,
  assets: _assets,
  avatars,
  setActiveAvatar,
  handleActivate,
  handleDelete,
  startEdit,
}: PreviewTabProps) => {
  const avatarList = avatars.map((avatar) => (
    <div
      key={avatar.id}
      className={cn(
        'p-4 rounded-xl border transition-colors cursor-pointer',
        activeAvatar?.id === avatar.id
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
      )}
      onClick={() => setActiveAvatar(avatar)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-slate-900 border border-slate-700">
          <AvatarRenderer
            previewUrl={avatar.preview_url || '/avatars/aria-portrait.webp'}
            name={avatar.name}
            size={48}
            state="idle"
          />
        </div>
        <div className="flex-1 ml-3">
          <h4 className="font-semibold text-slate-900 dark:text-white">{avatar.name}</h4>
          <p className="text-sm text-slate-500 dark:text-slate-400">v{avatar.config_version}</p>
        </div>
        {avatar.is_active && (
          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            Active
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="flex gap-2">
          <button
            onClick={() => handleActivate(avatar.id)}
            disabled={avatar.is_active}
            className="px-3 py-1 text-xs rounded-lg font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
            style={{ backgroundColor: 'rgb(14 165 233)' }}
          >
            Set Active
          </button>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={(e) => { e.stopPropagation(); startEdit(avatar); }}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(avatar.id); }}
            className="p-2 text-red-500 hover:text-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5.036 7H7m10 0v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7h14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Active Avatar Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Active Avatar</h3>
        <div className="flex flex-col items-center gap-4">
          {activeAvatar ? (
            <AvatarRenderer
              previewUrl={activeAvatar.preview_url || '/avatars/aria-portrait.webp'}
              name={activeAvatar.name}
              size={240}
              state="idle"
            />
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-lg font-medium text-slate-900 dark:text-white mb-2">No active avatar</p>
              <p className="text-slate-500 dark:text-slate-400 mb-4">Create or select an avatar to customize</p>
            </div>
          )}
        </div>
      </div>

      {/* Avatar List */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">All Avatars</h3>
        {avatars.length === 0 ? (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            <p>No avatars created yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {avatarList}
          </div>
        )}
      </div>
    </div>
  );
};

// Type definitions
export interface Avatar {
  id: string;
  user_id: string;
  name: string;
  config_version: number;
  config: AvatarConfig;
  preview_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvatarConfig {
  version: number;
  layers: AvatarLayer[];
}

export interface AvatarLayer {
  type: 'background' | 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  z_index: number;
  visible: boolean;
}

export interface Asset {
  id: string;
  layer_type: string;
  variant: string;
  asset_url: string;
  metadata: Record<string, unknown>;
}

export interface AvatarFormData {
  name: string;
  config: AvatarConfig;
}