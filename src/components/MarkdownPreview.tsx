import { type ReactNode } from 'react';
import { nip19 } from 'nostr-tools';
import { NostrMention } from '@/components/NostrMention';
import { isLeftoverBracketLine, matchStandaloneImage } from '@/lib/articlePaste';
import { cn } from '@/lib/utils';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

type Block =
  | { type: 'h'; level: 1 | 2 | 3; text: string }
  | { type: 'p'; text: string }
  | { type: 'img'; alt: string; src: string }
  | { type: 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; code: string }
  | { type: 'hr' };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: 'code', code: buf.join('\n') });
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: 'h', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      i++;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    const img = matchStandaloneImage(trimmed);
    if (img) {
      blocks.push({ type: 'img', alt: img.alt, src: img.src });
      i++;
      continue;
    }

    if (isLeftoverBracketLine(trimmed)) {
      i++;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        items.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: items.join('\n') });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (
        t.startsWith('#') ||
        t.startsWith('```') ||
        t.startsWith('>') ||
        /^---+$/.test(t) ||
        matchStandaloneImage(t) ||
        /^[-*]\s+/.test(t) ||
        /^\d+\.\s+/.test(t)
      ) {
        break;
      }
      if (isLeftoverBracketLine(t)) {
        i++;
        continue;
      }
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'p', text: buf.join('\n') });
  }

  return blocks;
}

/**
 * Inline tokenizer. Images are matched BEFORE links so `![alt](url)` does not
 * leave a leftover `!` from the link regex. Built inside the function so nested
 * bold/italic calls do not share lastIndex.
 */
function renderInline(text: string): ReactNode[] {
  const inlineRe =
    /`([^`]+)`|\[!\[([^\]]*)\]\(([^)]+)\)\]\([^)]+\)|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|nostr:(npub1|nprofile1)([023456789acdefghjklmnpqrstuvwxyz]+)|(https?:\/\/[^\s)]+)|(#\w+)|\*\*(.+?)\*\*|~~(.+?)~~|\*(.+?)\*/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = inlineRe.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }

    const [
      ,
      code,
      linkedAlt,
      linkedSrc,
      imgAlt,
      imgSrc,
      linkText,
      linkHref,
      nostrPrefix,
      nostrData,
      url,
      hashtag,
      bold,
      strike,
      italic,
    ] = match;

    if (code !== undefined) {
      parts.push(
        <code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-primary">
          {code}
        </code>,
      );
    } else if (linkedSrc || imgSrc) {
      const src = linkedSrc || imgSrc;
      const alt = linkedAlt || imgAlt || '';
      parts.push(
        <img
          key={key++}
          src={src}
          alt={alt || 'Image'}
          className="rounded-lg my-3 max-w-full h-auto"
        />,
      );
    } else if (linkHref) {
      parts.push(
        <a
          key={key++}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {linkText}
        </a>,
      );
    } else if (nostrPrefix && nostrData) {
      try {
        const decoded = nip19.decode(`${nostrPrefix}${nostrData}`);
        const pubkey = decoded.type === 'npub'
          ? decoded.data
          : decoded.type === 'nprofile'
            ? decoded.data.pubkey
            : null;
        if (pubkey) {
          parts.push(
            <NostrMention key={key++} pubkey={pubkey} as="span" className="text-primary" />,
          );
        } else {
          parts.push(match[0]);
        }
      } catch {
        parts.push(match[0]);
      }
    } else if (url) {
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {url}
        </a>,
      );
    } else if (hashtag) {
      parts.push(
        <span key={key++} className="text-primary font-medium">
          {hashtag}
        </span>,
      );
    } else if (bold !== undefined) {
      parts.push(<strong key={key++}>{renderInline(bold)}</strong>);
    } else if (strike !== undefined) {
      parts.push(
        <del key={key++} className="text-muted-foreground">
          {renderInline(strike)}
        </del>,
      );
    } else if (italic !== undefined) {
      parts.push(<em key={key++}>{renderInline(italic)}</em>);
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts.length > 0 ? parts : [text];
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'h': {
      const cls = block.level === 1
        ? 'text-2xl font-bold mt-6 mb-3'
        : block.level === 2
          ? 'text-xl font-bold mt-6 mb-2'
          : 'text-lg font-semibold mt-4 mb-2';
      const Tag = (block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3';
      return <Tag className={cls}>{renderInline(block.text)}</Tag>;
    }
    case 'img':
      return (
        <img
          src={block.src}
          alt={block.alt || 'Image'}
          className="rounded-lg my-4 max-w-full h-auto"
        />
      );
    case 'quote':
      return (
        <blockquote className="border-l-4 border-primary/30 pl-4 py-1 my-3 text-muted-foreground italic whitespace-pre-wrap">
          {renderInline(block.text)}
        </blockquote>
      );
    case 'ul':
      return (
        <ul className="my-3 space-y-1 list-disc ml-5">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="my-3 space-y-1 list-decimal ml-5">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <pre className="bg-muted rounded-lg p-4 overflow-x-auto text-sm font-mono my-4">
          <code>{block.code}</code>
        </pre>
      );
    case 'hr':
      return <hr className="my-6 border-border" />;
    case 'p':
      return (
        <p className="my-2 leading-relaxed whitespace-pre-wrap break-words">
          {renderInline(block.text)}
        </p>
      );
  }
}

/** Live markdown preview: real images, @name mentions, no leftover `[` from Substack. */
export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  const blocks = parseBlocks(content);

  if (!content.trim()) {
    return (
      <p className={cn('text-muted-foreground italic text-sm', className)}>
        Nothing to preview yet...
      </p>
    );
  }

  return (
    <div className={cn('max-w-none', className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}
