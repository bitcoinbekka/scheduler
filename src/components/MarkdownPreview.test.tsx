import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TestApp } from '@/test/TestApp';
import { MarkdownPreview } from './MarkdownPreview';

describe('MarkdownPreview', () => {
  it('renders a markdown image as an actual img, not leftover brackets', () => {
    render(
      <TestApp>
        <MarkdownPreview content={'Intro\n\n![Moonscape](https://cdn.substack.com/img.png)\n\nBye'} />
      </TestApp>,
    );

    const img = screen.getByRole('img', { name: 'Moonscape' });
    expect(img).toHaveAttribute('src', 'https://cdn.substack.com/img.png');
    expect(screen.queryByText(/\[/)).not.toBeInTheDocument();
  });

  it('unwraps a Substack linked image so no leftover [ remains', () => {
    const src = '[![stall](https://cdn.substack.com/a.jpg)](https://cdn.substack.com/a.jpg)';
    render(
      <TestApp>
        <MarkdownPreview content={src} />
      </TestApp>,
    );

    const img = screen.getByRole('img', { name: 'stall' });
    expect(img).toHaveAttribute('src', 'https://cdn.substack.com/a.jpg');
    expect(screen.queryByText(/\[/)).not.toBeInTheDocument();
  });

  it('skips a leftover "[" line before a bare image URL', () => {
    const src = '[\nhttps://files.example.com/photo.png\n](https://substack.com/redirect)';
    render(
      <TestApp>
        <MarkdownPreview content={src} />
      </TestApp>,
    );

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://files.example.com/photo.png');
  });

  it('renders nostr mentions as @names, not raw npubs', () => {
    render(
      <TestApp>
        <MarkdownPreview content="Books from nostr:npub1zg69v7ys40x77y352eufp27daufrg4ncjz4ummcjx3t83y9tehhsqepuh0 today" />
      </TestApp>,
    );

    expect(screen.queryByText(/nostr:npub1/)).not.toBeInTheDocument();
    expect(screen.getByText('@Swift Falcon')).toBeInTheDocument();
  });

  it('keeps real text links clickable', () => {
    render(
      <TestApp>
        <MarkdownPreview content="Walk [the stall](https://plebeian.market)." />
      </TestApp>,
    );

    const link = screen.getByRole('link', { name: 'the stall' });
    expect(link).toHaveAttribute('href', 'https://plebeian.market');
  });
});
