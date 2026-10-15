/** Image URL (with optional query string). */
const IMAGE_URL = /https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?[^\s)]*)?/i;

/**
 * Turn messy Substack / CMS paste into clean NIP-23 markdown.
 * Fixes the leftover "[" before images and linked-image wrappers.
 */
export function cleanPastedMarkdown(input: string): string {
  let s = input.replace(/\r\n/g, '\n');

  // HTML <img> tags that survived as text
  s = s.replace(/<img[^>]*>/gi, (tag) => {
    const src = /(?:src|data-src)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src) return '';
    const alt = /alt=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    return `![${alt}](${src})`;
  });

  // Linked image, possibly wrapping newlines: [![alt](src)](href) -> ![alt](src)
  s = s.replace(
    /\[\s*!\[([^\]]*)\]\(([^)]+)\)\s*\]\([^)]+\)/g,
    '![$1]($2)',
  );

  // Empty markdown link to an image: [](https://...png) -> ![](url)
  // Negative lookbehind so we do not turn an existing ![](url) into !![](url)
  s = s.replace(
    /(?<!!)\[\]\((https?:\/\/[^)]+\.(?:jpg|jpeg|png|gif|webp|svg)[^)]*)\)/gi,
    '![]($1)',
  );

  // A leftover "[" sitting on its own line before an image
  s = s.replace(/^\s*\[\s*\n\s*(!?\[[^\]]*\]\([^)]+\))/gm, '$1');
  s = s.replace(/^\s*\[\s*\n\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp))/gim, '![]($1)');

  // Closing "](url)" leftover after an image on the previous line
  s = s.replace(/(!\[[^\]]*\]\([^)]+\))\s*\n\s*\]\([^)]+\)/g, '$1');

  // Bare image URL on its own line -> markdown image
  s = s.replace(
    new RegExp(`^(${IMAGE_URL.source})\\s*$`, 'gim'),
    '![]($1)',
  );

  s = s.replace(/\n{3,}/g, '\n\n');
  s = s.replace(/^\n+/, '').replace(/\n+$/, '');
  return s ? `${s}\n` : '';
}

function isImageHref(href: string): boolean {
  return IMAGE_URL.test(href.split('?')[0] ?? href) || /substackcdn|substack-post-media|blossom\.|void\.cat|x0\.at|imgur/i.test(href);
}

function childrenToMarkdown(el: Element): string {
  return Array.from(el.childNodes).map(nodeToMarkdown).join('');
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = childrenToMarkdown(el);

  switch (tag) {
    case 'script':
    case 'style':
    case 'noscript':
      return '';
    case 'br':
      return '\n';
    case 'img': {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      const alt = el.getAttribute('alt') || '';
      return src ? `![${alt}](${src})` : '';
    }
    case 'a': {
      const href = el.getAttribute('href') || '';
      const trimmed = inner.trim();
      if (!trimmed) return '';
      // Linked image: keep the image, drop the wrapper link
      if (/^!\[[^\]]*\]\([^)]+\)$/.test(trimmed) || (el.querySelector('img') && !el.textContent?.trim())) {
        return trimmed;
      }
      if (isImageHref(href) && !trimmed) {
        return `![](${href})`;
      }
      return href ? `[${trimmed}](${href})` : trimmed;
    }
    case 'h1':
      return `\n# ${inner.trim()}\n\n`;
    case 'h2':
      return `\n## ${inner.trim()}\n\n`;
    case 'h3':
      return `\n### ${inner.trim()}\n\n`;
    case 'strong':
    case 'b':
      return inner ? `**${inner}**` : '';
    case 'em':
    case 'i':
      return inner ? `*${inner}*` : '';
    case 'blockquote':
      return `\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'li':
      return `- ${inner.trim()}\n`;
    case 'ul':
    case 'ol':
      return `\n${inner}\n`;
    case 'p':
    case 'div':
    case 'figure':
    case 'figcaption':
    case 'section':
    case 'article':
      return `\n\n${inner.trim()}\n\n`;
    case 'hr':
      return '\n\n---\n\n';
    default:
      return inner;
  }
}

/** Convert pasted HTML (Substack, Google Docs, browsers) to markdown. */
export function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return cleanPastedMarkdown(html);
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const md = nodeToMarkdown(doc.body);
  return cleanPastedMarkdown(md);
}

/** True when a paste is worth intercepting instead of dumping raw clipboard text. */
export function pasteNeedsClean(html: string, text: string): boolean {
  if (/substack/i.test(html) || /substack/i.test(text)) return true;
  if (/<img[\s>]/i.test(html)) return true;
  if (/\[!\[[\s\S]*?\]\([^)]+\)\]\([^)]+\)/.test(text)) return true;
  if (/^\s*\[\s*$/m.test(text) && IMAGE_URL.test(text)) return true;
  if (/<a[\s>][^>]*>\s*<img/i.test(html)) return true;
  return false;
}

/** A markdown or bare image that occupies a whole line. */
export function matchStandaloneImage(trimmed: string): { alt: string; src: string } | null {
  let m = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(trimmed);
  if (m) return { alt: m[1], src: m[2] };
  m = /^\[\s*!\[([^\]]*)\]\(([^)]+)\)\s*\]\([^)]+\)\s*$/.exec(trimmed);
  if (m) return { alt: m[1], src: m[2] };
  m = new RegExp(`^(${IMAGE_URL.source})\\s*$`, 'i').exec(trimmed);
  if (m) return { alt: '', src: m[1] };
  return null;
}

/** Leftover Substack wrapper lines that should not render as text. */
export function isLeftoverBracketLine(trimmed: string): boolean {
  return trimmed === '[' || /^\]\([^)]+\)$/.test(trimmed);
}

/** Pick the best markdown from a paste event. */
export function markdownFromPaste(html: string, text: string): string {
  if (html && pasteNeedsClean(html, text)) {
    return htmlToMarkdown(html);
  }
  return cleanPastedMarkdown(text);
}
