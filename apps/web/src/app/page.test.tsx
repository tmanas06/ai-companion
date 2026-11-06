import { render } from '@testing-library/react';
import { redirect } from 'next/navigation';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('HomePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /chat', async () => {
    // Import the component after mocking
    const { default: HomePage } = await import('./page');
    render(<HomePage />);
    expect(redirect).toHaveBeenCalledWith('/chat');
  });

  it('calls redirect exactly once', async () => {
    const { default: HomePage } = await import('./page');
    render(<HomePage />);
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});