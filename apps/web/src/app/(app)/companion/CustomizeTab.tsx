'use client';

import { cn } from '@/lib/utils';

interface CustomizeTabProps {
  activeAvatar: Avatar | null;
  assets: Record<string, Asset[]>;
  layerOptions: Record<string, { variant: string; label: string; color?: string }[]>;
  formData: AvatarFormData;
  setFormData: React.Dispatch<React.SetStateAction<AvatarFormData>>;
  editingAvatar: Avatar | null;
  setEditingAvatar: React.Dispatch<React.SetStateAction<Avatar | null>>;
  activeTab: 'preview' | 'customize';
  setActiveTab: React.Dispatch<React.SetStateAction<'preview' | 'customize'>>;
  handleLayerChange: (layerType: string, variant: string) => void;
  getLayerVariant: (layerType: string) => string;
  handleCreate: () => Promise<void>;
  handleSave: () => Promise<void>;
  resetForm: () => void;
}

export function CustomizeTab({
  layerOptions,
  formData,
  setFormData,
  editingAvatar,
  handleLayerChange,
  getLayerVariant,
  handleCreate,
  handleSave,
  resetForm,
}: CustomizeTabProps) {
  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Customize Avatar</h3>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Avatar Name
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Enter avatar name"
            className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Layers
          </label>
          <div className="space-y-4">
            {Object.entries(layerOptions).map(([layerType, variants]) => (
              <div key={layerType} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-slate-900 dark:text-white capitalize">{layerType}</h4>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Current: {getLayerVariant(layerType)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.variant}
                      type="button"
                      onClick={() => handleLayerChange(layerType, v.variant)}
                      className={cn(
                        'px-3 py-1.5 text-sm rounded-lg border transition-colors',
                        getLayerVariant(layerType) === v.variant
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={resetForm}
            className="px-4 py-2 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={editingAvatar ? handleSave : handleCreate}
            disabled={!formData.name.trim()}
            className={cn(
              'px-4 py-2 rounded-lg font-medium text-white',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            style={{ backgroundColor: 'rgb(14 165 233)' }}
          >
            {editingAvatar ? 'Save Changes' : 'Create Avatar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Type definitions (re-exported from main component)
interface Avatar {
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

interface AvatarConfig {
  version: number;
  layers: AvatarLayer[];
}

interface AvatarLayer {
  type: 'background' | 'skin' | 'eyes' | 'hair' | 'clothing' | 'accessory' | 'background';
  variant: string;
  color?: string;
  z_index: number;
  visible: boolean;
}

interface Asset {
  id: string;
  layer_type: string;
  variant: string;
  asset_url: string;
  metadata: Record<string, unknown>;
}

interface AvatarFormData {
  name: string;
  config: AvatarConfig;
}