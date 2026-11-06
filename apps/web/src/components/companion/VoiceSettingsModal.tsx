'use client';

import React, { useState } from 'react';
import { VoiceSettings } from '@/hooks/useLiveVoiceCompanion';
import {
  classifyVoiceGender,
  getCompanionVoiceProfile,
  NEURAL_VOICES,
} from '@/lib/voice-manager';

interface VoiceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onUpdateSettings: (newSettings: VoiceSettings) => void;
  availableVoices?: SpeechSynthesisVoice[];
  onTestVoice?: () => void;
  companionGender?: 'male' | 'female';
  companionName?: string;
}

export const VoiceSettingsModal: React.FC<VoiceSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  availableVoices = [],
  onTestVoice,
  companionGender = 'female',
  companionName,
}) => {
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  if (!isOpen) return null;

  const defaultProfile = getCompanionVoiceProfile(companionName, companionGender);

  // Partition voices by gender
  const maleVoices = availableVoices.filter((v) => classifyVoiceGender(v) === 'male');
  const femaleVoices = availableVoices.filter((v) => classifyVoiceGender(v) === 'female');
  const neutralVoices = availableVoices.filter((v) => classifyVoiceGender(v) === 'unknown');

  // Enforce strictly gender-appropriate choices for this avatar
  const matchingGenderVoices = companionGender === 'male' ? maleVoices : femaleVoices;
  const matchingNeuralVoices = NEURAL_VOICES.filter((v) => v.gender === companionGender);

  const handleResetDefaults = () => {
    onUpdateSettings({
      ...settings,
      pitch: defaultProfile.pitch,
      speechRate: defaultProfile.speechRate,
      voiceName: defaultProfile.neuralVoice,
      ttsEngine: 'backend',
    });
  };

  const handlePreviewNeural = async () => {
    if (isPlayingPreview) return;
    setIsPlayingPreview(true);
    try {
      const res = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Hello, I am ${companionName || 'your companion'}. This is my lifelike voice.`,
          voice: settings.voiceName || defaultProfile.neuralVoice,
          speed: settings.speechRate,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          setIsPlayingPreview(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsPlayingPreview(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } else {
        setIsPlayingPreview(false);
        if (onTestVoice) onTestVoice();
      }
    } catch (e) {
      setIsPlayingPreview(false);
      if (onTestVoice) onTestVoice();
    }
  };

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
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-slate-100 text-lg">Voice & Audio Settings</h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    companionGender === 'male'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                  }`}
                >
                  {companionGender === 'male' ? '♂ Male Voice' : '♀ Female Voice'}
                </span>
              </div>
              {companionName && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Voice profile for <span className="text-violet-400 font-medium">{companionName}</span>
                </p>
              )}
            </div>
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
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  ttsEngine: 'backend',
                  voiceName: settings.voiceName || defaultProfile.neuralVoice,
                })
              }
              className={`p-3 rounded-2xl text-left border transition ${
                settings.ttsEngine !== 'browser'
                  ? 'border-violet-500 bg-violet-600/10 text-violet-300 ring-1 ring-violet-500/40 shadow-sm'
                  : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  HD AI
                </span>
                <span className="text-sm font-semibold">Studio Neural</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Ultra-smooth & lifelike human tone</div>
            </button>
            <button
              onClick={() => onUpdateSettings({ ...settings, ttsEngine: 'browser' })}
              className={`p-3 rounded-2xl text-left border transition ${
                settings.ttsEngine === 'browser'
                  ? 'border-violet-500 bg-violet-600/10 text-violet-300 ring-1 ring-violet-500/40 shadow-sm'
                  : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <div className="text-sm font-medium">Browser Speech</div>
              <div className="text-xs text-slate-500 mt-1">Device synthesized speech</div>
            </button>
          </div>
        </div>

        {/* Studio Neural AI Voice Selection */}
        {settings.ttsEngine !== 'browser' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Neural AI Voice Model
              </label>
              <button
                type="button"
                onClick={handlePreviewNeural}
                disabled={isPlayingPreview}
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center space-x-1 font-medium transition disabled:opacity-50"
                title="Preview spoken neural voice"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                  />
                </svg>
                <span>{isPlayingPreview ? 'Playing...' : 'Preview Voice'}</span>
              </button>
            </div>
            <select
              value={settings.voiceName || defaultProfile.neuralVoice}
              onChange={(e) => onUpdateSettings({ ...settings, voiceName: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 truncate"
            >
              {matchingNeuralVoices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} {voice.recommendedFor?.toLowerCase() === companionName?.toLowerCase() ? '★ (Signature)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Filtered to natural {companionGender === 'male' ? 'masculine' : 'feminine'} neural voices with human cadence and realistic emotion.
            </p>
          </div>
        )}

        {/* Browser Voice Picker (when browser engine is selected) */}
        {settings.ttsEngine === 'browser' && availableVoices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Browser Voice Selection
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
              <option value="">
                Default Recommended Voice ({companionGender === 'male' ? 'Masculine' : 'Feminine'})
              </option>
              {matchingGenderVoices.length > 0 && (
                <optgroup label={`${companionGender === 'male' ? 'Male' : 'Female'} Voices`}>
                  {matchingGenderVoices.map((voice) => (
                    <option key={voice.voiceURI || voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </optgroup>
              )}
              {neutralVoices.length > 0 && (
                <optgroup label="System / Neutral Voices">
                  {neutralVoices.map((voice) => (
                    <option key={voice.voiceURI || voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-[11px] text-slate-400">
              Only {companionGender === 'male' ? 'masculine' : 'feminine'} voices are enabled for {companionName || 'this avatar'}.
            </p>
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

        {/* Reset to Avatar Persona Defaults */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-violet-400 hover:text-violet-300 font-medium transition flex items-center space-x-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Reset {companionName ? `${companionName}'s` : 'Avatar'} Voice Profile</span>
          </button>
          <span className="text-[10px] text-slate-500">
            Profile pitch: {defaultProfile.pitch.toFixed(2)}x
          </span>
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
