import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

interface NotePreviewProps {
  markdown: string;
  className?: string;
}

/**
 * Renders a Markdown string as HTML, with Nostr mentions resolved
 * to display names. Uses `marked` for real Markdown parsing and
 * `DOMPurify` to sanitize the output.
 */
export function NotePreview({ markdown, className }: NotePreviewProps) {
  // Convert markdown to sanitized HTML
  const html = useMemo(() => {
    try {
      const raw = marked.parse(markdown, { async: false, breaks: true, gfm: true }) as string;
      return DOMPurify.sanitize(raw, {
        ADD_ATTR: ['target'],
        ALLOWED_TAGS: [
          'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li', 'blockquote', 'hr',
          'a', 'img', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
        ],
      });
    } catch {
      return '';
    }
  }, [markdown]);

  // Find all npub and nprofile references in the markdown text
  const mentions = useMemo(() => {
    const found = new Map<string, string>(); // bech32 -> hex pubkey
    const regex = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(markdown)) !== null) {
      try {
        const decoded = nip19.decode(m[1]);
        if (decoded.type === 'npub') {
          found.set(m[1], decoded.data);
        } else if (decoded.type === 'nprofile') {
          found.set(m[1], decoded.data.pubkey);
        }
      } catch {
        // invalid bech32, skip
      }
    }
    return found;
  }, [markdown]);

  return (
    <div className={className}>
      <RenderedHtml html={html} mentions={mentions} />
    </div>
  );
}

/**
 * Renders sanitized HTML and swaps out `nostr:npub...` strings
 * for React mention components that can fetch profile names.
 */
function RenderedHtml({
  html,
  mentions,
}: {
  html: string;
  mentions: Map<string, string>;
}) {
  // Split the HTML on nostr: references so we can interleave React components
  const parts = useMemo(() => {
    const out: Array<{ type: 'html'; value: string } | { type: 'mention'; bech32: string; pubkey: string }> = [];
    const regex = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null) {
      if (m.index > lastIndex) {
        out.push({ type: 'html', value: html.slice(lastIndex, m.index) });
      }
      const bech32 = m[1];
      const pubkey = mentions.get(bech32);
      if (pubkey) {
        out.push({ type: 'mention', bech32, pubkey });
      } else {
        out.push({ type: 'html', value: m[0] });
      }
      lastIndex = m.index + m[0].length;
    }
    if (lastIndex < html.length) {
      out.push({ type: 'html', value: html.slice(lastIndex) });
    }
    return out;
  }, [html, mentions]);

  return (
    <>
      {parts.map((part, i) =>
        part.type === 'html' ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: part.value }} />
        ) : (
          <Mention key={i} pubkey={part.pubkey} />
        )
      )}
    </>
  );
}

/** A single mention, resolved to a display name. */
function Mention({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const npub = nip19.npubEncode(pubkey);
  const displayName = author.data?.metadata?.name ?? author.data?.metadata?.display_name ?? genUserName(pubkey);

  return (
    <Link
      to={`/${npub}`}
      className="font-medium text-blue-500 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      @{displayName}
    </Link>
  );
}
