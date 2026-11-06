'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const DynamicAvatarStudio = dynamic(
  () => import('@/components/studio/AvatarStudioContainer').then((mod) => mod.AvatarStudioContainer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[calc(100vh-4rem)] flex flex-col items-center justify-center space-y-3 bg-slate-950 text-slate-400">
        <div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">
          Initializing 3D Avatar Studio...
        </span>
      </div>
    ),
  }
);

export default function StudioPage() {
  return <DynamicAvatarStudio />;
}
