import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { ClientPreview } from './ClientPreview';

describe('ClientPreview', () => {
  it('renders nostr mentions as @names instead of raw npubs', () => {
    render(
      <TestApp>
        <ClientPreview
          content="Bitcoin Books from nostr:npub1zg69v7ys40x77y352eufp27daufrg4ncjz4ummcjx3t83y9tehhsqepuh0 still on the bazaar."
          images={[]}
        />
      </TestApp>,
    );

    expect(screen.queryByText(/nostr:npub1/)).not.toBeInTheDocument();
    expect(screen.getByText('@Swift Falcon')).toBeInTheDocument();
  });

  it('renders markdown images as img tags', () => {
    render(
      <TestApp>
        <ClientPreview content={'![cover](https://x0.at/yXcq.png)'} images={[]} />
      </TestApp>,
    );

    const imgs = screen.getAllByRole('img');
    const cover = imgs.find(el => el.getAttribute('src') === 'https://x0.at/yXcq.png');
    expect(cover).toBeTruthy();
  });

  it('does not show leftover Substack brackets before an image', () => {
    render(
      <TestApp>
        <ClientPreview
          content={'[\nhttps://files.example.com/photo.png\n](https://substack.com/redirect)'}
          images={[]}
        />
      </TestApp>,
    );

    expect(screen.queryByText('[')).not.toBeInTheDocument();
    const imgs = screen.getAllByRole('img');
    const photo = imgs.find(el => el.getAttribute('src') === 'https://files.example.com/photo.png');
    expect(photo).toBeTruthy();
  });
});
