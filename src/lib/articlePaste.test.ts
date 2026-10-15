import { describe, it, expect } from 'vitest';
import { cleanPastedMarkdown, htmlToMarkdown, pasteNeedsClean, matchStandaloneImage } from './articlePaste';

describe('cleanPastedMarkdown', () => {
  it('unwraps a Substack linked image so no leftover bracket remains', () => {
    const src = '[![Moonscape](https://cdn.substack.com/img.png)](https://cdn.substack.com/img.png)';
    expect(cleanPastedMarkdown(src)).toBe('![Moonscape](https://cdn.substack.com/img.png)\n');
  });

  it('unwraps a linked image split across lines', () => {
    const src = '[\n![alt](https://x.com/a.jpg)\n](https://x.com/a.jpg)';
    expect(cleanPastedMarkdown(src).trim()).toBe('![alt](https://x.com/a.jpg)');
  });

  it('turns a leftover "[" line before an image into a markdown image', () => {
    const src = '[\nhttps://files.example.com/photo.png\n](https://substack.com/redirect)';
    const out = cleanPastedMarkdown(src);
    expect(out).toContain('![](https://files.example.com/photo.png)');
    expect(out.trim().startsWith('[')).toBe(false);
  });

  it('converts a bare image URL on its own line', () => {
    const src = 'Hello\n\nhttps://blossom.primal.net/abc.jpg\n\nBye';
    expect(cleanPastedMarkdown(src)).toContain('![](https://blossom.primal.net/abc.jpg)');
  });

  it('converts an HTML img tag left in the text', () => {
    const src = '<img src="https://cdn.example.com/x.webp" alt="cover">';
    expect(cleanPastedMarkdown(src).trim()).toBe('![cover](https://cdn.example.com/x.webp)');
  });
});

describe('htmlToMarkdown', () => {
  it('converts a linked Substack image to a markdown image', () => {
    const html = '<p><a href="https://substackcdn.com/a.jpg"><img src="https://substackcdn.com/a.jpg" alt="stall"></a></p>';
    const out = htmlToMarkdown(html);
    expect(out).toContain('![stall](https://substackcdn.com/a.jpg)');
    expect(out).not.toMatch(/^\s*\[/m);
  });

  it('keeps real text links', () => {
    const html = '<p>Walk <a href="https://plebeian.market">the stall</a>.</p>';
    const out = htmlToMarkdown(html);
    expect(out).toContain('[the stall](https://plebeian.market)');
  });
});

describe('pasteNeedsClean', () => {
  it('detects Substack linked-image markdown', () => {
    expect(pasteNeedsClean('', '[![x](https://a.com/x.png)](https://a.com/x.png)')).toBe(true);
  });

  it('detects Substack HTML even without an img tag', () => {
    expect(pasteNeedsClean('<div data-substack-id="1"><p>Hello</p></div>', 'Hello')).toBe(true);
  });

  it('ignores a plain sentence', () => {
    expect(pasteNeedsClean('', 'GM. This week I want you to walk one stall.')).toBe(false);
  });
});

describe('matchStandaloneImage', () => {
  it('matches a markdown image line', () => {
    expect(matchStandaloneImage('![Moonscape](https://cdn.substack.com/img.png)')).toEqual({
      alt: 'Moonscape',
      src: 'https://cdn.substack.com/img.png',
    });
  });

  it('matches a linked markdown image', () => {
    expect(matchStandaloneImage('[![stall](https://x.com/a.jpg)](https://x.com/a.jpg)')).toEqual({
      alt: 'stall',
      src: 'https://x.com/a.jpg',
    });
  });
});
