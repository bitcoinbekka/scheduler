import { useState, useCallback, useMemo } from 'react';
import {
  Search,
  Tag,
  MapPin,
  Clock,
  User,
  ShoppingBag,
  Download,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  CalendarClock,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { TimePicker } from '@/components/TimePicker';
import { useMyListings, useAllListings, type ExistingListing } from '@/hooks/useMyListings';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { NostrMetadata } from '@nostrify/nostrify';
import { type ImportedListing, type UploadedImage } from '@/lib/types';
import { listingToImported } from '@/lib/listingImport';

export interface CampaignListing {
  content: string;
  media: UploadedImage[];
  importedListing: ImportedListing;
}

interface CampaignOptions {
  startDate: Date;
  startTime: string;
  intervalSeconds: number;
}

interface ListingBrowserProps {
  onImport: (data: { content: string; media: UploadedImage[]; importedListing: ImportedListing }) => void;
  onCampaign?: (listings: CampaignListing[], options?: CampaignOptions) => void;
}

type BrowseMode = 'mine' | 'all';

/** Small inline author badge */
function AuthorBadge({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = author.data?.metadata;
  const name = metadata?.display_name || metadata?.name || pubkey.slice(0, 10) + '...';

  return (
    <div className="flex items-center gap-1.5">
      <Avatar className="w-4 h-4">
        <AvatarImage src={metadata?.picture} alt={name} />
        <AvatarFallback className="text-[8px]">
          <User className="w-2.5 h-2.5" />
        </AvatarFallback>
      </Avatar>
      <span className="text-xs text-muted-foreground truncate max-w-[100px]">{name}</span>
    </div>
  );
}

/** Compact horizontal listing row */
function ListingCard({
  listing,
  onImport,
  showAuthor = false,
}: {
  listing: ExistingListing;
  onImport: () => void;
  showAuthor?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onImport}
      className={cn(
        'group flex items-center gap-3 w-full text-left p-2 rounded-lg border transition-all duration-150',
        'hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary/30'
      )}
    >
      {/* Thumbnail */}
      {listing.images.length > 0 ? (
        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
          <img
            src={listing.images[0].url}
            alt={listing.title}
            className="w-full h-full object-cover"
          />
          {listing.images.length > 1 && (
            <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] px-1 rounded-tl-sm">
              +{listing.images.length - 1}
            </span>
          )}
        </div>
      ) : (
        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
          <ShoppingBag className="w-5 h-5 text-muted-foreground/30" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium truncate">
            {listing.title || 'Untitled Listing'}
          </h3>
          {listing.price && (
            <Badge variant="secondary" className="shrink-0 text-[10px] font-mono h-5 px-1.5">
              {listing.price} {listing.currency}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {showAuthor && <AuthorBadge pubkey={listing.event.pubkey} />}
          {listing.location && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
              <MapPin className="w-2.5 h-2.5 shrink-0" />
              {listing.location}
            </span>
          )}
          {listing.categories.length > 0 && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 truncate">
              <Tag className="w-2.5 h-2.5 shrink-0" />
              {listing.categories.slice(0, 2).join(', ')}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground flex items-center gap-0.5 shrink-0 ml-auto">
            <Clock className="w-2.5 h-2.5" />
            {formatDistanceToNow(new Date(listing.event.created_at * 1000), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Import indicator */}
      <Download className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
    </button>
  );
}

/** Loading skeleton rows */
function ListingSkeletons() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 p-2 rounded-lg border">
          <Skeleton className="w-12 h-12 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

const INTERVAL_OPTIONS = [
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '3 hours', value: 10800 },
  { label: '6 hours', value: 21600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '2 days', value: 172800 },
  { label: '1 week', value: 604800 },
];

export function ListingBrowser({ onImport, onCampaign }: ListingBrowserProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [mode, setMode] = useState<BrowseMode>('mine');
  const [searchTerm, setSearchTerm] = useState('');
  const [allSearchInput, setAllSearchInput] = useState('');
  const [campaignMode, setCampaignMode] = useState(false);
  const [showCampaignConfig, setShowCampaignConfig] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [campaignStartDate, setCampaignStartDate] = useState<Date | undefined>(undefined);
  const [campaignStartTime, setCampaignStartTime] = useState('12:00');
  const [campaignInterval, setCampaignInterval] = useState(21600); // 6 hours default
  const [campaignDrafts, setCampaignDrafts] = useState<Map<string, string>>(new Map());
  const { user } = useCurrentUser();

  const { data: myListings, isLoading: myLoading } = useMyListings();
  const { data: allListings, isLoading: allLoading, isFetching: allFetching } = useAllListings(
    searchTerm,
    mode === 'all' && isOpen,
  );

  const handleImportListing = useCallback((listing: ExistingListing) => {
    onImport(listingToImported(listing));
  }, [onImport]);

  const toggleSelection = useCallback((eventId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }, []);

  const handleAllSearch = useCallback(() => {
    setSearchTerm(allSearchInput);
  }, [allSearchInput]);

  // Filter "My Listings" client-side
  const filteredMyListings = (myListings ?? []).filter(l => {
    if (!allSearchInput.trim() || mode !== 'mine') return true;
    const q = allSearchInput.toLowerCase();
    return (
      l.title.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q) ||
      l.content.toLowerCase().includes(q) ||
      l.categories.some(c => c.includes(q)) ||
      l.location.toLowerCase().includes(q)
    );
  });

  const currentListings = mode === 'mine' ? filteredMyListings : (allListings ?? []);
  const isLoading = mode === 'mine' ? myLoading : allLoading;

  // Build campaign listing data from selected listings
  const selectedCampaignListings = useMemo(() => {
    if (!campaignMode || selectedIds.size === 0) return [];
    return currentListings
      .filter(l => selectedIds.has(l.event.id))
      .map(listing => {
        const imported = listingToImported(listing);
        const customContent = campaignDrafts.get(listing.event.id);
        return {
          listing,
          content: customContent ?? imported.content,
          media: imported.media,
          importedListing: imported.importedListing,
        };
      });
  }, [campaignMode, selectedIds, currentListings, campaignDrafts]);

  const handleCreateCampaign = useCallback(() => {
    if (!onCampaign || selectedCampaignListings.length === 0) return;

    const campaignListings: CampaignListing[] = selectedCampaignListings.map(item => ({
      content: item.content,
      media: item.media,
      importedListing: item.importedListing,
    }));

    const options: CampaignOptions | undefined = campaignStartDate ? {
      startDate: campaignStartDate,
      startTime: campaignStartTime,
      intervalSeconds: campaignInterval,
    } : undefined;

    onCampaign(campaignListings, options);
    setCampaignMode(false);
    setShowCampaignConfig(false);
    setSelectedIds(new Set());
    setCampaignDrafts(new Map());
    setCampaignStartDate(undefined);
  }, [onCampaign, selectedCampaignListings, campaignStartDate, campaignStartTime, campaignInterval]);

  return (
    <Card className={cn('transition-all duration-300', isOpen && 'ring-1 ring-primary/20')}>
      <CardHeader className="pb-0">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full text-left group"
        >
          <CardTitle className="text-base flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </div>
            Import from Listing
          </CardTitle>
          <div className="flex items-center gap-2">
            {!isOpen && myListings && myListings.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {myListings.length} listing{myListings.length !== 1 ? 's' : ''}
              </Badge>
            )}
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            )}
          </div>
        </button>
        {!isOpen && (
          <p className="text-xs text-muted-foreground mt-1 ml-9">
            Import product data from your Plebeian Market listings to craft a promo post
          </p>
        )}
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-3 space-y-3">
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-muted rounded-md">
            <button
              type="button"
              onClick={() => setMode('mine')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200',
                mode === 'mine'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <User className="w-3 h-3" />
              My Listings
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all duration-200',
                mode === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Globe className="w-3 h-3" />
              All Listings
            </button>
          </div>

          {/* Campaign mode toggle */}
          {onCampaign && mode === 'mine' && (myListings?.length ?? 0) > 1 && (
            <div className="space-y-3">
              <div className={cn(
                'flex items-center justify-between p-2.5 rounded-lg border transition-all',
                campaignMode ? 'bg-primary/5 border-primary/20' : 'bg-muted/50 border-border hover:border-primary/20'
              )}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !campaignMode;
                    setCampaignMode(next);
                    if (!next) {
                      setSelectedIds(new Set());
                      setShowCampaignConfig(false);
                      setCampaignDrafts(new Map());
                    }
                  }}
                  className="flex items-center gap-2 text-xs font-medium transition-colors"
                >
                  <span className={cn(
                    'w-5 h-5 rounded flex items-center justify-center text-[10px] transition-colors',
                    campaignMode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {campaignMode ? '✓' : '📢'}
                  </span>
                  <span className={campaignMode ? 'text-primary' : 'text-foreground'}>
                    {campaignMode ? 'Campaign mode — select listings below' : 'Multi-listing campaign'}
                  </span>
                </button>
                {campaignMode && selectedIds.size > 0 && !showCampaignConfig && (
                  <Button
                    size="sm"
                    className="text-xs h-7 gap-1.5 shadow-sm"
                    onClick={() => setShowCampaignConfig(true)}
                  >
                    <CalendarClock className="w-3 h-3" />
                    Configure {selectedIds.size} posts
                  </Button>
                )}
              </div>

              {/* Campaign configuration panel */}
              {campaignMode && showCampaignConfig && selectedIds.size > 0 && (
                <Card className="border-primary/20 bg-primary/[0.02]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-primary" />
                        Campaign Schedule — {selectedIds.size} post{selectedIds.size !== 1 ? 's' : ''}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7"
                        onClick={() => setShowCampaignConfig(false)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Start date & time */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Start date & time</p>
                      <Calendar
                        mode="single"
                        selected={campaignStartDate}
                        onSelect={setCampaignStartDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="rounded-md border"
                      />
                      <TimePicker
                        value={campaignStartTime}
                        onChange={setCampaignStartTime}
                      />
                    </div>

                    <Separator />

                    {/* Frequency */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Post every</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {INTERVAL_OPTIONS.map(opt => (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant={campaignInterval === opt.value ? 'default' : 'outline'}
                            className="text-xs h-8"
                            onClick={() => setCampaignInterval(opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    {/* Per-post content editors */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground">Edit post content</p>
                      {selectedCampaignListings.map((item, i) => {
                        const scheduledTime = campaignStartDate
                          ? (() => {
                              const [h, m] = campaignStartTime.split(':').map(Number);
                              const d = new Date(campaignStartDate);
                              d.setHours(h, m, 0, 0);
                              d.setSeconds(d.getSeconds() + campaignInterval * i);
                              return format(d, 'MMM d, h:mm a');
                            })()
                          : `Post ${i + 1}`;
                        return (
                          <div key={item.listing.event.id} className="rounded-lg border bg-card p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              {item.listing.images.length > 0 && (
                                <img
                                  src={item.listing.images[0].url}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{item.listing.title || 'Untitled'}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                                  {scheduledTime}
                                </p>
                              </div>
                              <Badge variant="secondary" className="text-[10px] shrink-0">
                                #{i + 1}
                              </Badge>
                            </div>
                            <Textarea
                              value={item.content}
                              onChange={e => {
                                setCampaignDrafts(prev => {
                                  const next = new Map(prev);
                                  next.set(item.listing.event.id, e.target.value);
                                  return next;
                                });
                              }}
                              className="text-xs min-h-[80px]"
                              rows={4}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Schedule summary & action */}
                    <div className="flex items-center justify-between pt-1">
                      {campaignStartDate ? (
                        <p className="text-xs text-muted-foreground">
                          First post: {format(campaignStartDate, 'MMM d')} at {campaignStartTime}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Pick a start date above
                        </p>
                      )}
                      <Button
                        className="gap-2 shadow-lg shadow-primary/20"
                        onClick={handleCreateCampaign}
                        disabled={!campaignStartDate}
                      >
                        <CalendarClock className="w-4 h-4" />
                        Schedule {selectedIds.size} Posts
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Search bar */}
          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={mode === 'mine' ? 'Filter your listings...' : 'Search all NIP-99 listings on relays...'}
                value={allSearchInput}
                onChange={e => {
                  setAllSearchInput(e.target.value);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && mode === 'all') {
                    handleAllSearch();
                  }
                }}
                className="pl-9"
              />
            </div>
            {mode === 'all' && (
              <Button
                onClick={handleAllSearch}
                disabled={allFetching}
                className="gap-2 shrink-0"
              >
                {allFetching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Search
              </Button>
            )}
          </div>

          {/* Info text */}
          <p className="text-xs text-muted-foreground">
            {mode === 'all'
              ? `Search NIP-99 listings on your relays. Pick one to auto-generate a promo note.${user ? ' Results from all merchants.' : ''}`
              : 'Select a listing to auto-generate a promotional note with its title, price, images, and a link back.'
            }
          </p>

          {/* Results */}
          <ScrollArea className="max-h-[280px] -mx-1 px-1">
            {isLoading ? (
              <ListingSkeletons />
            ) : currentListings.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {mode === 'mine'
                    ? allSearchInput ? 'No listings match your filter' : 'No published listings found'
                    : searchTerm ? 'No listings found for that search' : 'Search for listings or browse recent ones'
                  }
                </p>
                {mode === 'mine' && !allSearchInput && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Publish a listing on Plebeian Market first, then import it here to promote.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {currentListings.map(listing => (
                  <div key={listing.event.id} className="flex items-center gap-2">
                    {campaignMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(listing.event.id)}
                        onChange={() => toggleSelection(listing.event.id)}
                        className="w-4 h-4 rounded border-border text-primary accent-primary shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <ListingCard
                        listing={listing}
                        onImport={() => campaignMode ? toggleSelection(listing.event.id) : handleImportListing(listing)}
                        showAuthor={mode === 'all'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Results count */}
          {!isLoading && currentListings.length > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Showing {currentListings.length} listing{currentListings.length !== 1 ? 's' : ''}
              {mode === 'mine' && ' from your account'}
              {mode === 'all' && ' from relays'}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
