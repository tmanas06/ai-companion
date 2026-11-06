'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { PreviewTab } from '@/components/companion/PreviewTab';
import { CustomizeTab } from './CustomizeTab';
import type { Avatar, Asset, AvatarFormData } from '@/components/companion/PreviewTab';

export default function CompanionPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [assets, setAssets] = useState<Record<string, Asset[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'preview' | 'customize'>('preview');
  const [activeAvatar, setActiveAvatar] = useState<Avatar | null>(null);
  const [editingAvatar, setEditingAvatar] = useState<Avatar | null>(null);
  const [formData, setFormData] = useState<AvatarFormData>({
    name: '',
    config: { version: 1, layers: [] },
  });

  // Layer configuration
  const layerOptions: Record<string, { variant: string; label: string; color?: string }[]> = {
    background: [
      { variant: 'default', label: 'Default' },
      { variant: 'gradient', label: 'Gradient' },
    ],
    skin: [
      { variant: 'light', label: 'Light', color: '#FFDBAC' },
      { variant: 'medium-light', label: 'Medium Light', color: '#DDB892' },
      { variant: 'medium', label: 'Medium', color: '#C68642' },
      { variant: 'medium-dark', label: 'Medium Dark', color: '#8D5524' },
      { variant: 'dark', label: 'Dark', color: '#5D3A1A' },
    ],
    eyes: [
      { variant: 'round', label: 'Round' },
      { variant: 'almond', label: 'Almond' },
      { variant: 'narrow', label: 'Narrow' },
      { variant: 'wide', label: 'Wide' },
    ],
    hair: [
      { variant: 'short', label: 'Short' },
      { variant: 'medium', label: 'Medium' },
      { variant: 'long', label: 'Long' },
    ],
    clothing: [
      { variant: 'casual', label: 'Casual' },
      { variant: 'formal', label: 'Formal' },
      { variant: 'armor', label: 'Armor' },
    ],
    accessory: [
      { variant: 'none', label: 'None' },
      { variant: 'glasses', label: 'Glasses' },
      { variant: 'earrings', label: 'Earrings' },
      { variant: 'necklace', label: 'Necklace' },
    ],
  };

  useEffect(() => {
    if (!authLoading) {
      loadAvatars();
    }
  }, [authLoading]);

  useEffect(() => {
    if (avatars.length > 0) {
      loadAssets();
    }
  }, [avatars]);

  async function loadAvatars() {
    try {
      const response = await fetch('/api/avatars');
      if (response.ok) {
        const data = await response.json();
        setAvatars(data.avatars);
        const active = data.avatars.find((a: Avatar) => a.is_active);
        if (active) setActiveAvatar(active);
      }
    } catch (err) {
      console.error('Failed to load avatars:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAssets() {
    try {
      const response = await fetch('/api/avatars/assets');
      if (response.ok) {
        const data = await response.json();
        const grouped = data.assets.reduce((acc: Record<string, Asset[]>, asset: Asset) => {
          if (!acc[asset.layer_type]) acc[asset.layer_type] = [];
          acc[asset.layer_type].push(asset);
          return acc;
        }, {});
        setAssets(grouped);
      }
    } catch (err) {
      console.error('Failed to load assets:', err);
    }
  }

  async function handleActivate(id: string) {
    try {
      const response = await fetch(`/api/avatars/${id}/activate`, { method: 'POST' });
      if (response.ok) {
        loadAvatars();
      }
    } catch (err) {
      console.error('Failed to activate avatar:', err);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this avatar?')) return;
    try {
      const response = await fetch(`/api/avatars/${id}`, { method: 'DELETE' });
      if (response.ok) {
        loadAvatars();
      }
    } catch (err) {
      alert('Failed to delete avatar');
    }
  }

  function startEdit(avatar: Avatar) {
    setEditingAvatar(avatar);
    setFormData({
      name: avatar.name,
      config: avatar.config as AvatarConfig,
    });
    setActiveTab('customize');
  }

  function resetForm() {
    setEditingAvatar(null);
    setFormData({ name: '', config: { version: 1, layers: [] } });
  }

  function getLayerVariant(layerType: string): string {
    const layer = activeAvatar?.config?.layers?.find((l) => l.type === layerType);
    return layer?.variant || layerOptions[layerType]?.[0]?.variant || 'default';
  }

  function handleLayerChange(layerType: string, variant: string) {
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        layers: prev.config.layers.map((l) =>
          l.type === layerType ? { ...l, variant } : l
        ),
      },
    }));
  }

  async function handleCreate() {
    try {
      const response = await fetch('/api/avatars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name, config: formData.config }),
      });
      if (response.ok) {
        setFormData({ name: '', config: { version: 1, layers: [] } });
        setActiveTab('preview');
      } else {
        alert('Failed to create avatar');
      }
    } catch (err) {
      alert('Failed to create avatar');
    }
  }

  async function handleSave() {
    if (!editingAvatar) return;
    try {
      const response = await fetch(`/api/avatars/${editingAvatar.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name, config: formData.config }),
      });
      if (response.ok) {
        setEditingAvatar(null);
        setFormData({ name: '', config: { version: 1, layers: [] } });
        setActiveTab('preview');
      } else {
        alert('Failed to update avatar');
      }
    } catch (err) {
      alert('Failed to update avatar');
    }
  }

  if (authLoading || isLoading) {
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
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Avatar</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">Customize your companion's appearance</p>
        </div>
        <button
          onClick={() => {
            setActiveTab('customize');
            setFormData({ name: '', config: { version: 1, layers: [] } });
            setEditingAvatar(null);
          }}
          className="px-4 py-2 rounded-lg font-medium text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
          style={{ backgroundColor: 'rgb(14 165 233)' }}
        >
          <svg className="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Avatar
        </button>
      </div>

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setActiveTab('preview')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'preview'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Preview
        </button>
        <button
          onClick={() => setActiveTab('customize')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'customize'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Customize
        </button>
      </div>

      {activeTab === 'preview' ? (
        <PreviewTab
          activeAvatar={activeAvatar}
          assets={assets}
          avatars={avatars}
          setActiveAvatar={setActiveAvatar}
          handleActivate={handleActivate}
          handleDelete={handleDelete}
          startEdit={startEdit}
        />
      ) : (
        <CustomizeTab
          activeAvatar={activeAvatar}
          assets={assets}
          layerOptions={layerOptions}
          formData={formData}
          setFormData={setFormData}
          editingAvatar={editingAvatar}
          setEditingAvatar={setEditingAvatar}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          handleLayerChange={handleLayerChange}
          getLayerVariant={getLayerVariant}
          handleCreate={handleCreate}
          handleSave={handleSave}
          resetForm={resetForm}
        />
      )}
    </div>
  );
}