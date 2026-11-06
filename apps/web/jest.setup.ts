import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';
import { ReadableStream } from 'stream/web';

// Polyfill web streams and encoders for jsdom environment
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  // @ts-expect-error Node's TextDecoder is compatible with global.TextDecoder
  global.TextDecoder = TextDecoder;
}
if (typeof global.ReadableStream === 'undefined') {
  // @ts-expect-error Node's ReadableStream is compatible
  global.ReadableStream = ReadableStream;
}

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
};
const mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/chat',
  useSearchParams: () => mockSearchParams,
  redirect: jest.fn(),
}));

// Mock Web Audio and Media Devices for Voice Companion
class MockAudioContext {
  createMediaStreamSource() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
  }
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: (arr: Uint8Array) => arr.fill(42),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
  }
  close() {
    return Promise.resolve();
  }
}

// @ts-expect-error Mock AudioContext
global.AudioContext = MockAudioContext;
// @ts-expect-error Mock webkitAudioContext
global.webkitAudioContext = MockAudioContext;

class MockMediaRecorder {
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  static isTypeSupported = jest.fn().mockReturnValue(true);

  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['fake audio'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

// @ts-expect-error Mock MediaRecorder
global.MediaRecorder = MockMediaRecorder;

if (!navigator.mediaDevices) {
  // @ts-expect-error Mock mediaDevices
  navigator.mediaDevices = {};
}

navigator.mediaDevices.getUserMedia = jest.fn().mockResolvedValue({
  active: true,
  getTracks: () => [
    {
      stop: jest.fn(),
      enabled: true,
    },
  ],
});

// Mock HTMLMediaElement play/pause
window.HTMLMediaElement.prototype.play = jest.fn().mockImplementation(function (this: HTMLMediaElement) {
  setTimeout(() => {
    if (this.onplay) {
      this.onplay(new Event('play'));
    }
    this.dispatchEvent(new Event('play'));
  }, 0);
  setTimeout(() => {
    if (this.onended) {
      this.onended(new Event('ended'));
    }
    this.dispatchEvent(new Event('ended'));
  }, 300);
  return Promise.resolve();
});
window.HTMLMediaElement.prototype.pause = jest.fn().mockImplementation(function (this: HTMLMediaElement) {
  if (this.onpause) {
    this.onpause(new Event('pause'));
  }
  this.dispatchEvent(new Event('pause'));
});

// Mock SpeechSynthesis
class MockSpeechSynthesisUtterance {
  text = '';
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  lang = 'en-US';
  onstart: (() => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(text = '') {
    this.text = text;
  }
}
// @ts-expect-error Mock SpeechSynthesisUtterance
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
// @ts-expect-error Mock SpeechSynthesisUtterance on window
window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;

const mockSpeechSynthesis = {
  paused: false,
  speak: jest.fn((utterance: MockSpeechSynthesisUtterance) => {
    setTimeout(() => {
      utterance.onstart?.();
    }, 0);
    setTimeout(() => {
      utterance.onend?.(new Event('end'));
    }, 10);
  }),
  cancel: jest.fn(),
  resume: jest.fn(),
  pause: jest.fn(),
  getVoices: jest.fn().mockReturnValue([]),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};
Object.defineProperty(window, 'speechSynthesis', {
  value: mockSpeechSynthesis,
  writable: true,
});

class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
global.ResizeObserver = MockResizeObserver;
window.ResizeObserver = MockResizeObserver;