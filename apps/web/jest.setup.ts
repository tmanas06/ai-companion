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