import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface NostrMentionProps {
  pubkey: string;
  className?: string;
  /** `link` navigates to the profile page. `span` is for compose previews. */
  as?: 'link' | 'span';
}

/** Resolve a pubkey to @displayName, falling back to a generated name while metadata loads. */
export function NostrMention({ pubkey, className, as = 'link' }: NostrMentionProps) {
  const author = useAuthor(pubkey);
  const npub = nip19.npubEncode(pubkey);
  const realName = author.data?.metadata?.display_name || author.data?.metadata?.name;
  const hasRealName = !!realName;
  const displayName = realName || genUserName(pubkey);

  const cls = cn(
    'font-medium hover:underline',
    hasRealName
      ? 'text-blue-500'
      : 'text-gray-500 hover:text-gray-700',
    className,
  );
  const label = `@${displayName}`;

  if (as === 'span') {
    return <span className={cls}>{label}</span>;
  }

  return (
    <Link to={`/${npub}`} className={cls}>
      {label}
    </Link>
  );
}
