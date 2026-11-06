'use client';

import React from 'react';
import { VoiceSettings } from '@/hooks/useLiveVoiceCompanion';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onUpdateSettings: (newSettings: VoiceSettings) => void;
  availableVoices?: SpeechSynthesisVoice[];
  onTestVoice?: () => void;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  availableVoices = [],
  onTestVoice,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z"
                />
              </svg>
            </div>
            <h3 className="font-semibold text-slate-100 text-lg">Voice & Audio Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Engine selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Speech Output Engine
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onUpdateSettings({ ...settings, ttsEngine: 'browser' })}
              className={`p-3 rounded-2xl text-left border transition ${
                settings.ttsEngine === 'browser'
                  ? 'border-violet-500 bg-violet-600/10 text-violet-300'
                  : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-sm font-medium">Browser Speech</div>
              <div className="text-xs text-slate-500 mt-0.5">High-quality native voice</div>
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, ttsEngine: 'backend' })}
              className={`p-3 rounded-2xl text-left border transition ${
                settings.ttsEngine === 'backend'
                  ? 'border-violet-500 bg-violet-600/10 text-violet-300'
                  : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-sm font-medium">Local Backend TTS</div>
              <div className="text-xs text-slate-500 mt-0.5">Piper neural / eSpeak</div>
            </button>
          </div>
        </div>

        {/* Browser Voice Picker (when voices are available) */}
        {settings.ttsEngine === 'browser' && availableVoices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Voice Selection
              </label>
              {onTestVoice && (
                <button
                  type="button"
                  onClick={onTestVoice}
                  className="text-xs text-violet-400 hover:text-violet-300 flex items-center space-x-1 font-medium transition"
                  title="Test spoken voice"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    />
                  </svg>
                  <span>Test Voice</span>
                </button>
              )}
            </div>
            <select
              value={settings.voiceName || ''}
              onChange={(e) => onUpdateSettings({ ...settings, voiceName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 truncate"
            >
              <option value="">Default Recommended Voice (Natural)</option>
              {availableVoices.map((voice) => (
                <option key={voice.voiceURI || voice.name} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Speed slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-400">Speech Rate</span>
            <span className="text-violet-400 font-mono">{settings.speechRate.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={settings.speechRate}
            onChange={(e) => onUpdateSettings({ ...settings, speechRate: parseFloat(e.target.value) })}
            className="w-full accent-violet-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Slower (0.75x)</span>
            <span>Normal (1.0x)</span>
            <span>Faster (1.5x)</span>
          </div>
        </div>

        {/* Pitch slider */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-slate-400">Voice Pitch</span>
            <span className="text-violet-400 font-mono">{settings.pitch.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.8"
            max="1.3"
            step="0.05"
            value={settings.pitch}
            onChange={(e) => onUpdateSettings({ ...settings, pitch: parseFloat(e.target.value) })}
            className="w-full accent-violet-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Deeper (0.8x)</span>
            <span>Normal (1.0x)</span>
            <span>Higher (1.3x)</span>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="rounded-2xl bg-emerald-950/30 border border-emerald-800/40 p-3.5 flex items-start space-x-2.5">
          <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-xs text-emerald-200/90 leading-relaxed">
            <span className="font-medium text-emerald-300">Local-First Audio:</span> Audio captured via your microphone
            is transcribed locally. Audio and transcripts are never forwarded to third-party cloud services in private-machine mode.
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-medium text-white text-sm bg-violet-600 hover:bg-violet-500 transition shadow-sm"
        >
          Save & Close
        </button>
      </div>
    </div>
  );
};
