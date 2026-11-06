import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OnboardingCompanionPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/onboarding/companion',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-123', email: 'user@example.com', fullName: 'Tester' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

describe('OnboardingCompanionPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('renders presets grid with style filter tabs and "Create Your Own" option', async () => {
    render(<OnboardingCompanionPage />);

    expect(screen.getByText('Choose Your Companion Avatar')).toBeInTheDocument();
    expect(screen.getByText('Create Your Own')).toBeInTheDocument();
    expect(screen.getByText('Aria')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();

    // Style filter buttons
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /photorealistic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /anime/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /3d/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /illustrated/i })).toBeInTheDocument();
  });

  it('navigates to customization step when preset is selected', async () => {
    render(<OnboardingCompanionPage />);

    // Click customize for Luna
    const selectButtons = screen.getAllByRole('button', { name: /choose & personalize/i });
    fireEvent.click(selectButtons[0]!);

    // Step 2 should display
    expect(await screen.findByRole('button', { name: /review & meet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to gallery/i })).toBeInTheDocument();
  });

  it('allows customizing companion name, bio, appearance and personality traits', async () => {
    render(<OnboardingCompanionPage />);

    // Select first preset
    const selectButtons = screen.getAllByRole('button', { name: /choose & personalize/i });
    fireEvent.click(selectButtons[0]!);

    // Switch to personality tab
    const personalityTab = screen.getByRole('button', { name: /personality & identity/i });
    fireEvent.click(personalityTab);

    // Update name
    const nameInput = screen.getByPlaceholderText(/luna, marcus, aria/i);
    fireEvent.change(nameInput, { target: { value: 'Seraphina' } });
    expect(nameInput).toHaveValue('Seraphina');

    // Toggle personality trait
    const adventurousBtn = screen.getByText('Adventurous');
    fireEvent.click(adventurousBtn);

    // Click preview & meet button to go to Step 3
    const meetBtn = screen.getByRole('button', { name: /review & meet/i });
    fireEvent.click(meetBtn);

    // Step 3 should display
    expect(await screen.findByRole('button', { name: /start chatting with seraphina/i })).toBeInTheDocument();
  });

  it('persists companion with full configuration and prevents duplicate submissions', async () => {
    let callCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/companions') {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 'new-companion-999',
            name: 'Seraphina',
            personality: { traits: ['Caring'] },
          }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    render(<OnboardingCompanionPage />);

    // Select preset -> go to step 2
    fireEvent.click(screen.getAllByRole('button', { name: /choose & personalize/i })[0]!);

    // Step 2 -> go to step 3
    const meetBtn = screen.getByRole('button', { name: /review & meet/i });
    fireEvent.click(meetBtn);

    // Step 3 finalize button
    const finalizeBtn = await screen.findByRole('button', { name: /start chatting with/i });

    // Double click to test duplicate submission prevention
    fireEvent.click(finalizeBtn);
    fireEvent.click(finalizeBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat?companionId=new-companion-999');
    });

    // Only one POST call should have been dispatched
    expect(callCount).toBe(1);
  });
});
