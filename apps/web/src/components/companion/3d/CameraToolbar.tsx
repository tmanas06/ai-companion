'use client';

import React, { useEffect, useCallback } from 'react';
import { CameraFramingPreset } from './animation-mappings';

export type AvatarDisplayMode = 'video' | '3d' | 'photorealistic-2d';
export type AvatarRenderMode = 'baseline' | 'enhanced';

export interface CameraToolbarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onSelectPreset?: (preset: CameraFramingPreset) => void;
  activePreset?: CameraFramingPreset;
  displayMode?: AvatarDisplayMode;
  onChangeDisplayMode?: (mode: AvatarDisplayMode) => void;
  renderMode?: AvatarRenderMode;
  onChangeRenderMode?: (mode: AvatarRenderMode) => void;
  hasVideoMode?: boolean;
  is3DMode?: boolean;
  onToggle3DMode?: () => void;
  showFramingControls?: boolean;
  className?: string;
}

export const CameraToolbar: React.FC<CameraToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  onReset,
  onSelectPreset,
  activePreset = 'full',
  displayMode,
  onChangeDisplayMode,
  renderMode,
  onChangeRenderMode,
  hasVideoMode = true,
  is3DMode = true,
  onToggle3DMode,
  showFramingControls,
  className = '',
}) => {
  // Global keyboard shortcuts for camera manipulation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is focused inside an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        onSelectPreset?.('face');
      } else if (e.key === '2') {
        e.preventDefault();
        onSelectPreset?.('upper');
      } else if (e.key === '3') {
        e.preventDefault();
        onSelectPreset?.('full');
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        onZoomOut();
      } else if (e.key === 'r' || e.key === 'R' || e.key === '0') {
        e.preventDefault();
        onReset();
      }
    },
    [onZoomIn, onZoomOut, onReset, onSelectPreset]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const effectiveMode: AvatarDisplayMode = displayMode || (is3DMode ? '3d' : 'photorealistic-2d');

  return (
    <div
      role="toolbar"
      aria-label="Companion Camera & View Controls"
      className={`flex items-center space-x-1 p-1.5 rounded-2xl bg-slate-900/85 backdrop-blur-md border border-slate-800 shadow-xl select-none text-slate-300 ${className}`}
    >
      {/* Display Mode Selection: Video / 3D Body / 2D Face */}
      {onChangeDisplayMode ? (
        <>
          {hasVideoMode && (
            <button
              type="button"
              onClick={() => onChangeDisplayMode('video')}
              title="Switch to Photorealistic Video Avatar"
              aria-label="Switch to Photorealistic Video Avatar"
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold tracking-wider transition ${
                effectiveMode === 'video'
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-500/30'
                  : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              Video
            </button>
          )}

          <button
            type="button"
            onClick={() => onChangeDisplayMode('3d')}
            title="Switch to Interactive 3D Avatar"
            aria-label="Switch to Interactive 3D Avatar"
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold tracking-wider transition ${
              effectiveMode === '3d'
                ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            3D Body
          </button>

          <button
            type="button"
            onClick={() => onChangeDisplayMode('photorealistic-2d')}
            title="Switch to Photorealistic 2D Avatar"
            aria-label="Switch to Photorealistic 2D Avatar"
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold tracking-wider transition ${
              effectiveMode === 'photorealistic-2d'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            Photo 2D
</button>
        </> 
      ) : (
        <button
          type="button"
          onClick={() => onToggle3DMode?.()}
          title={effectiveMode === '3d' ? 'Switch to Photorealistic 2D Avatar' : 'Switch to Interactive 3D Avatar'}
          aria-label={effectiveMode === '3d' ? 'Switch to Photorealistic 2D Avatar' : 'Switch to Interactive 3D Avatar'}
          className={`px-2.5 py-1 rounded-xl text-xs font-semibold tracking-wider transition ${
            effectiveMode === '3d'
              ? 'bg-violet-600 text-white shadow-sm shadow-violet-500/30'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {effectiveMode === '3d' ? '3D Body' : 'Photo 2D'}
        </button>
      )}

      {/* Render Mode Selection: Baseline / Enhanced (only in 3D mode) */}
      {onChangeRenderMode && (effectiveMode === '3d' || effectiveMode === 'video') && (
        <>
          <div className="w-[1px] h-5 bg-slate-800 mx-0.5" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onChangeRenderMode('baseline')}
            title="Standard Renderer (Baseline)"
            aria-label="Switch to Baseline Renderer"
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold tracking-wider transition ${
              renderMode === 'baseline'
                ? 'bg-slate-700 text-white shadow-sm shadow-slate-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            Baseline
          </button>

          <button
            type="button"
            onClick={() => onChangeRenderMode('enhanced')}
            title="Enhanced Renderer (Experimental: PBR + SSS + IBL)"
            aria-label="Switch to Enhanced Renderer"
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold tracking-wider transition ${
              renderMode === 'enhanced'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            Enhanced
          </button>
        </>
      )}

      {/* Framing & Camera Controls (Only active in 3D Body stage mode) */}
      {(showFramingControls ?? (effectiveMode === '3d' || effectiveMode === 'photorealistic-2d')) && (
        <>
          <div className="w-[1px] h-5 bg-slate-800 mx-0.5" aria-hidden="true" />

          {/* Preset: Face (Close-up) */}
          <button
            type="button"
            onClick={() => onSelectPreset?.('face')}
            title="Focus Face Portrait (Key: 1)"
            aria-label="Focus on character face"
            className={`px-2 py-1 rounded-xl text-xs font-medium transition ${
              activePreset === 'face'
                ? 'bg-slate-800 text-violet-400 font-semibold'
                : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            Face
          </button>

          {/* Preset: Upper (Half-body/conversational) */}
          <button
            type="button"
            onClick={() => onSelectPreset?.('upper')}
            title="Focus Upper Body (Key: 2)"
            aria-label="Focus on upper body"
            className={`px-2 py-1 rounded-xl text-xs font-medium transition ${
              activePreset === 'upper'
                ? 'bg-slate-800 text-violet-400 font-semibold'
                : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            Bust
          </button>

          {/* Preset: Full (Head-to-toe) */}
          <button
            type="button"
            onClick={() => onSelectPreset?.('full')}
            title="Full-Body View (Key: 3)"
            aria-label="Full body head to toe"
            className={`px-2 py-1 rounded-xl text-xs font-medium transition ${
              activePreset === 'full'
                ? 'bg-slate-800 text-violet-400 font-semibold'
                : 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            Full
          </button>

          <div className="w-[1px] h-5 bg-slate-800 mx-0.5" aria-hidden="true" />

          {/* Zoom In (+) */}
          <button
            type="button"
            onClick={onZoomIn}
            title="Zoom In (Key: +)"
            aria-label="Zoom in"
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>

          {/* Zoom Out (-) */}
          <button
            type="button"
            onClick={onZoomOut}
            title="Zoom Out (Key: -)"
            aria-label="Zoom out"
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 12H6" />
            </svg>
          </button>

          {/* Reset Camera (r) */}
          <button
            type="button"
            onClick={onReset}
            title="Reset Camera Framing (Key: r)"
            aria-label="Reset to full body"
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};
