import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { parsePubkeyInput } from '@/lib/npub';
import { genUserName } from '@/lib/genUserName';

interface MentionLookupProps {
  value: string;
  onChange: (value: string) => void;
  onInsert: (npub: string) => void;
}

/** npub / hex input that looks up the profile name before inserting a NIP-27 mention. */
export function MentionLookup({ value, onChange, onInsert }: MentionLookupProps) {
  const parsed = useMemo(() => parsePubkeyInput(value), [value]);
  const author = useAuthor(parsed?.hex);
  const metadata = author.data?.metadata;
  const displayName = metadata?.display_name || metadata?.name;
  const picture = metadata?.picture;
  const isLoading = !!parsed && (author.isFetching || author.isPending);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Tag a Nostr user</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          They will be notified when your post is published
        </p>
      </div>
      <div>
        <Label className="text-xs">npub, nprofile, or hex</Label>
        <Input
          placeholder="npub1..."
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && parsed) {
              e.preventDefault();
              onInsert(parsed.npub);
            }
          }}
          className="mt-1 font-mono text-xs"
          autoFocus
        />
      </div>
      {parsed && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <Avatar className="w-8 h-8">
            <AvatarImage src={picture} alt={displayName || parsed.npub} />
            <AvatarFallback className="text-[10px]">
              {(displayName || 'np').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {isLoading && !displayName ? 'Looking up profile…' : displayName || genUserName(parsed.hex)}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{parsed.npub}</p>
          </div>
        </div>
      )}
      {value.trim() && !parsed && (
        <p className="text-[11px] text-destructive">That does not look like an npub or hex key.</p>
      )}
      <Button
        type="button"
        onClick={() => parsed && onInsert(parsed.npub)}
        size="sm"
        className="w-full"
        disabled={!parsed}
      >
        {displayName ? `Tag @${displayName}` : 'Insert @mention'}
      </Button>
    </div>
  );
}
