import { useState, type ReactNode } from 'react';
import { Smartphone } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NostrMention } from '@/components/NostrMention';
import { isLeftoverBracketLine, matchStandaloneImage } from '@/lib/articlePaste';
import { cn } from '@/lib/utils';
import type { NostrMetadata } from '@nostrify/nostrify';

type ClientType = 'primal' | 'damus' | 'amethyst';

interface ClientPreviewProps {
  content: string;
  images: string[];
  metadata?: NostrMetadata;
  className?: string;
}

const CLIENT_CONFIG: Record<ClientType, { name: string; bg: string; text: string; accent: string; secondary: string; border: string; subtle: string }> = {
  primal: {
    name: 'Primal',
    bg: 'bg-[#1a1a2e]',
    text: 'text-white',
    accent: 'text-violet-400',
    secondary: 'text-gray-400',
    border: 'border-gray-700/50',
    subtle: 'bg-white/5',
  },
  damus: {
    name: 'Damus',
    bg: 'bg-[#0a0a0a]',
    text: 'text-white',
    accent: 'text-purple-400',
    secondary: 'text-gray-500',
    border: 'border-gray-800',
    subtle: 'bg-white/5',
  },
  amethyst: {
    name: 'Amethyst',
    bg: 'bg-[#1c1b22]',
    text: 'text-white',
    accent: 'text-purple-300',
    secondary: 'text-gray-400',
    border: 'border-purple-900/30',
    subtle: 'bg-purple-500/5',
  },
};

type Segment = { type: 'text'; value: string } | { type: 'image'; value: string; alt: string };

/** Parse content into segments of text and image URLs */
function parseContent(content: string, images: string[]): Segment[] {
  if (!content.trim() && images.length === 0) return [];

  const segments: Segment[] = [];
  const lines = content.split('\n');
  const usedUrls = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (isLeftoverBracketLine(trimmed)) continue;

    const img = matchStandaloneImage(trimmed);
    if (img) {
      segments.push({ type: 'image', value: img.src, alt: img.alt || 'Image' });
      usedUrls.add(img.src);
    } else if (trimmed) {
      segments.push({ type: 'text', value: line });
    }
  }

  for (const img of images) {
    if (!usedUrls.has(img)) {
      segments.push({ type: 'image', value: img, alt: 'Image' });
    }
  }

  return segments;
}

/** Render hashtags, links, and nostr:npub mentions as @profile names */
function renderText(text: string, accentClass: string): ReactNode[] {
  const token = /(nostr:(?:npub1|nprofile1)[023456789acdefghjklmnpqrstuvwxyz]+|#\w+|https?:\/\/\S+)/gi;
  return text.split(token).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('nostr:npub1') || part.startsWith('nostr:nprofile1')) {
      try {
        const decoded = nip19.decode(part.slice('nostr:'.length));
        const pubkey = decoded.type === 'npub'
          ? decoded.data
          : decoded.type === 'nprofile'
            ? decoded.data.pubkey
            : null;
        if (pubkey) {
          return (
            <NostrMention
              key={i}
              pubkey={pubkey}
              as="span"
              className={cn(accentClass, 'hover:underline')}
            />
          );
        }
      } catch {
        // fall through and show the raw token
      }
    }
    if (part.startsWith('#')) {
      return <span key={i} className={accentClass}>{part}</span>;
    }
    if (part.startsWith('http')) {
      return <span key={i} className={cn(accentClass, 'underline underline-offset-2 break-all')}>{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function ClientPreview({ content, images, metadata, className }: ClientPreviewProps) {
  const [client, setClient] = useState<ClientType>('primal');
  const config = CLIENT_CONFIG[client];
  const segments = parseContent(content, images);
  const displayName = metadata?.name || metadata?.display_name || 'You';
  const picture = metadata?.picture;
  const nip05 = metadata?.nip05;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Client selector */}
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Preview as:</span>
        <div className="flex gap-1">
          {(Object.keys(CLIENT_CONFIG) as ClientType[]).map(c => (
            <Button
              key={c}
              type="button"
              variant={client === c ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setClient(c)}
            >
              {CLIENT_CONFIG[c].name}
            </Button>
          ))}
        </div>
      </div>

      {/* Phone mockup */}
      <div className="flex justify-center">
        <div className={cn(
          'w-full max-w-[360px] rounded-[24px] border-2 border-gray-600/30 shadow-2xl overflow-hidden',
          config.bg,
        )}>
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 py-2 text-[10px] text-gray-400">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-4 h-2 border border-gray-500 rounded-[2px]">
                <div className="w-3/4 h-full bg-gray-400 rounded-[1px]" />
              </div>
            </div>
          </div>

          {/* App header */}
          <div className={cn('px-4 py-2 border-b', config.border)}>
            <p className={cn('text-sm font-semibold', config.text)}>
              {config.name === 'Primal' ? 'Home' : config.name === 'Damus' ? 'Home Feed' : 'Feed'}
            </p>
          </div>

          {/* Post */}
          <div className={cn('p-4 border-b', config.border)}>
            {/* Author row */}
            <div className="flex items-start gap-3">
              <Avatar className="w-10 h-10 shrink-0">
                <AvatarImage src={picture} alt={displayName} />
                <AvatarFallback className="text-xs bg-gray-700 text-gray-300">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-sm font-semibold truncate', config.text)}>{displayName}</span>
                  {nip05 && (
                    <Badge variant="outline" className={cn('text-[8px] px-1 py-0 h-4 border-none', config.secondary)}>
                      {nip05.startsWith('_@') ? nip05.slice(2) : nip05}
                    </Badge>
                  )}
                </div>
                <p className={cn('text-[11px]', config.secondary)}>just now</p>

                {/* Content segments */}
                <div className="mt-2 space-y-2">
                  {segments.length === 0 ? (
                    <p className={cn('text-[13px] leading-relaxed italic', config.secondary)}>
                      Your note will appear here...
                    </p>
                  ) : (
                    segments.map((seg, i) =>
                      seg.type === 'text' ? (
                        <p key={i} className={cn('text-[13px] leading-relaxed', config.text)}>
                          {renderText(seg.value, config.accent)}
                        </p>
                      ) : (
                        <div key={i} className="rounded-lg overflow-hidden border border-white/10">
                          <img
                            src={seg.value}
                            alt={seg.alt}
                            className="w-full h-auto max-h-48 object-cover"
                          />
                        </div>
                      )
                    )
                  )}
                </div>

                {/* Action bar */}
                <div className={cn('flex items-center justify-between mt-3 pt-2', config.secondary)}>
                  <div className="flex items-center gap-6">
                    <span className="text-[11px] flex items-center gap-1">💬 0</span>
                    <span className="text-[11px] flex items-center gap-1">🔁 0</span>
                    <span className="text-[11px] flex items-center gap-1">❤️ 0</span>
                    <span className="text-[11px] flex items-center gap-1">⚡ 0</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fake next post */}
          <div className={cn('p-4 opacity-30', config.border)}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-700 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-700 rounded w-24" />
                <div className="h-3 bg-gray-700/50 rounded w-full" />
                <div className="h-3 bg-gray-700/50 rounded w-3/4" />
              </div>
            </div>
          </div>

          {/* Bottom safe area */}
          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
