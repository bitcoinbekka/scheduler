import { useState, useCallback, useMemo, useRef } from 'react';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Save,
  CalendarClock,
  Send,
  Loader2,
  ArrowLeft,
  Trash2,
  ImageIcon,
  Clock,
  X,
  Sparkles,
  ShoppingBag,
  Info,
  ExternalLink,
  MessageSquare,
  FileText,
  Upload,
  Hash,
  Eye,
  BookOpen,
  Pencil,
  Repeat2,
  AtSign,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ImageUploader } from '@/components/ImageUploader';
import { ClientPreview } from '@/components/ClientPreview';
import { ListingBrowser, type CampaignListing } from '@/components/ListingBrowser';
import { AiGenerateDialog } from '@/components/AiGenerateDialog';
import { MarkdownEditor } from '@/components/MarkdownEditor';
import { TimePicker } from '@/components/TimePicker';
import { NoteContent } from '@/components/NoteContent';
import { useScheduler } from '@/contexts/SchedulerContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useMyPublishedPosts } from '@/hooks/useMyPublishedPosts';
import { useBatchEngagement } from '@/hooks/usePostEngagement';
import { useSmartHashtags } from '@/hooks/useSmartHashtags';
import { buildEvent } from '@/lib/eventBuilder';
import { scheduleEvent } from '@/lib/schedulerApi';
import { loadBunkerSettings, parseBunkerUri } from '@/lib/bunkerUri';
import { templateFromBuild } from '@/lib/fireTimeEvent';
import { createNewPost, type SchedulerPost, type PostType, type PostTemplate, type ImportedListing, type UploadedImage } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const POST_TYPES: { value: PostType; label: string; icon: typeof MessageSquare; description: string; kind: string }[] = [
  { value: 'short', label: 'Short Note', icon: MessageSquare, description: 'Quick update, announcement, or thought', kind: 'kind 1' },
  { value: 'long', label: 'Long-form Article', icon: FileText, description: 'Newsletter, blog post, or in-depth content', kind: 'kind 30023' },
  { value: 'promo', label: 'Promo Note', icon: ShoppingBag, description: 'Promote a product from your marketplace listing', kind: 'kind 1' },
];

export default function Compose() {
  useSeoMeta({
    title: 'Compose - Plebeian Scheduler',
    description: 'Craft and schedule Nostr posts — short notes, long-form articles, and product promotions.',
  });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { updatePost, removePost, posts } = useScheduler();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { data: authorData } = useAuthor(user?.pubkey);

  // Smart hashtag suggestions based on engagement data
  const { data: myRelayPosts } = useMyPublishedPosts();
  const relayEventIds = useMemo(() => (myRelayPosts || []).map(e => e.id), [myRelayPosts]);
  const { data: engagementMapForHashtags } = useBatchEngagement(relayEventIds);
  const smartHashtags = useSmartHashtags(myRelayPosts, engagementMapForHashtags);
  const { config } = useAppContext();

  const editId = searchParams.get('edit');
  const headerImageInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [headerImageUploading, setHeaderImageUploading] = useState(false);
  const [inlineImageUploading, setInlineImageUploading] = useState(false);

  const existingPost = useMemo(() => {
    if (editId) return posts.find(p => p.id === editId);
    return undefined;
  }, [editId, posts]);

  const [post, setPost] = useState<SchedulerPost>(() => {
    if (existingPost) return existingPost;
    return createNewPost(user?.pubkey ?? '');
  });

  // Load templates
  const templates = useMemo<PostTemplate[]>(() => {
    try {
      const raw = localStorage.getItem('plebeian-scheduler:templates');
      if (!raw) return [];
      return (JSON.parse(raw) as PostTemplate[]).sort((a, b) => b.createdAt - a.createdAt);
    } catch { return []; }
  }, []);

  const [persisted, setPersisted] = useState(!!editId);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(() => {
    if (existingPost?.scheduledAt) return new Date(existingPost.scheduledAt * 1000);
    return undefined;
  });
  const [scheduleTime, setScheduleTime] = useState(() => {
    if (existingPost?.scheduledAt) return format(new Date(existingPost.scheduledAt * 1000), 'HH:mm');
    return '12:00';
  });
  const [showScheduler, setShowScheduler] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hashtagInput, setHashtagInput] = useState('');
  const [showNotePreview, setShowNotePreview] = useState(false);
  const [customIntervalValue, setCustomIntervalValue] = useState('');
  const [customIntervalUnit, setCustomIntervalUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [mentionInput, setMentionInput] = useState('');

  const updateField = useCallback(<K extends keyof SchedulerPost>(field: K, value: SchedulerPost[K]) => {
    setPost(prev => ({ ...prev, [field]: value }));
  }, []);

  const setPostType = useCallback((postType: PostType) => {
    setPost(prev => ({ ...prev, postType }));
  }, []);

  /** Insert a nostr: mention at the cursor position in the short note textarea */
  const handleInsertMention = useCallback((npubOrHex: string) => {
    const input = npubOrHex.trim();
    if (!input) return;

    // Normalize to npub format for the nostr: URI
    let npub = input;
    if (!input.startsWith('npub1')) {
      try {
        npub = nip19.npubEncode(input);
      } catch {
        // If it's not valid hex, try using as-is
        npub = input;
      }
    }

    const mention = `nostr:${npub}`;
    const ta = noteTextareaRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      setPost(prev => {
        const before = prev.content.slice(0, start);
        const after = prev.content.slice(end);
        const prefix = before && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
        const suffix = after && !after.startsWith(' ') && !after.startsWith('\n') ? ' ' : '';
        return { ...prev, content: before + prefix + mention + suffix + after };
      });
      requestAnimationFrame(() => ta.focus());
    } else {
      setPost(prev => {
        const separator = prev.content && !prev.content.endsWith(' ') && !prev.content.endsWith('\n') ? ' ' : '';
        return { ...prev, content: prev.content + separator + mention + ' ' };
      });
    }

    setMentionInput('');
    setMentionPopoverOpen(false);
    toast({ title: 'Mention added', description: 'The tagged user will be notified when published.' });
  }, [toast]);

  /** Upload an image and insert its URL at the cursor position in the short note textarea */
  const handleInlineImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setInlineImageUploading(true);
    try {
      if (!user) throw new Error('Must be logged in to upload');

      // Upload directly using BlossomUploader (same as useUploadFile but inline)
      const { BlossomUploader } = await import('@nostrify/nostrify/uploaders');
      const uploader = new BlossomUploader({
        servers: ['https://blossom.primal.net/'],
        signer: user.signer,
      });
      const tags = await uploader.upload(file);

      if (!tags || !Array.isArray(tags)) throw new Error('Upload returned no data');

      // Extract URL — first tag is always ['url', 'https://...']
      const url = tags[0]?.[1];
      if (!url) throw new Error('No URL in upload response');

      // Build the UploadedImage for the media array
      const img: UploadedImage = { url };
      for (const tag of tags) {
        const [name, value] = tag;
        if (name === 'ox' || name === 'x') img.sha256 = value;
        else if (name === 'm') img.mimeType = value;
        else if (name === 'dim') img.dimensions = value;
        else if (name === 'size') img.size = parseInt(value);
        else if (name === 'blurhash') img.blurhash = value;
      }

      // Add to media array for imeta tags
      setPost(prev => ({ ...prev, media: [...prev.media, img] }));

      // Insert URL at cursor position in the content
      const ta = noteTextareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setPost(prev => {
          const before = prev.content.slice(0, start);
          const after = prev.content.slice(end);
          const prefix = before && !before.endsWith('\n') ? '\n' : '';
          const suffix = after && !after.startsWith('\n') ? '\n' : '';
          return { ...prev, content: before + prefix + url + suffix + after };
        });
        // Put cursor after the inserted URL
        requestAnimationFrame(() => {
          ta.focus();
        });
      } else {
        // Fallback: append to end
        setPost(prev => {
          const separator = prev.content && !prev.content.endsWith('\n') ? '\n' : '';
          return { ...prev, content: prev.content + separator + url + '\n' };
        });
      }

      toast({ title: 'Image uploaded', description: 'Image inserted into your note.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
    } finally {
      setInlineImageUploading(false);
      if (inlineImageInputRef.current) inlineImageInputRef.current.value = '';
    }
  }, [user, toast]);

  // Save as draft
  const handleSaveDraft = useCallback(() => {
    setIsSaving(true);
    const updated = { ...post, status: 'draft' as const, authorPubkey: user?.pubkey ?? post.authorPubkey };
    updatePost(updated);
    setPost(updated);
    setPersisted(true);
    toast({ title: 'Draft saved', description: 'Your draft has been saved locally.' });
    setIsSaving(false);
  }, [post, user, updatePost, toast]);

  // Core scheduling logic — pre-sign (default) or NIP-46 fire-time (Amber bunker)
  const submitSchedule = useCallback(async (scheduledAt: number) => {
    if (!user) return;

    const postToSchedule = { ...post, authorPubkey: user.pubkey };
    const eventData = buildEvent(postToSchedule);
    const writeRelays = config.relayMetadata.relays
      .filter(r => r.write)
      .map(r => r.url);
    const bunker = loadBunkerSettings();

    if (bunker.signAtFire) {
      parseBunkerUri(bunker.bunkerUri);
      const unsignedEvent = templateFromBuild(eventData, user.pubkey);
      try {
        const result = await scheduleEvent({
          mode: 'nip46',
          unsignedEvent,
          bunkerUri: bunker.bunkerUri,
          publishAt: scheduledAt,
          relays: writeRelays.length > 0 ? writeRelays : undefined,
        });
        const updated: SchedulerPost = {
          ...postToSchedule,
          status: 'scheduled',
          scheduledAt,
          serverEventId: result.id,
          publishedEventId: null,
        };
        updatePost(updated);
        setPost(updated);
        setPersisted(true);
        return { ok: true, eventId: result.id, nip46: true };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'NIP-46 schedule failed';
        toast({
          title: 'Could not schedule with Amber',
          description: msg,
          variant: 'destructive',
        });
        return { ok: false };
      }
    }

    const signedEvent = await user.signer.signEvent({
      kind: eventData.kind,
      content: eventData.content,
      tags: eventData.tags,
      created_at: eventData.created_at,
    });

    try {
      const result = await scheduleEvent({
        signedEvent,
        publishAt: scheduledAt,
        relays: writeRelays.length > 0 ? writeRelays : undefined,
      });

      const updated: SchedulerPost = {
        ...postToSchedule,
        status: 'scheduled',
        scheduledAt,
        serverEventId: result.id,
        publishedEventId: signedEvent.id,
      };
      updatePost(updated);
      setPost(updated);
      setPersisted(true);
      return { ok: true, eventId: signedEvent.id };
    } catch (error) {
      console.warn('[Scheduler] Server unavailable, falling back to local scheduling:', error);
      const updated: SchedulerPost = {
        ...postToSchedule,
        status: 'scheduled',
        scheduledAt,
        serverEventId: null,
      };
      updatePost(updated);
      setPost(updated);
      setPersisted(true);
      return { ok: false, local: true };
    }
  }, [post, user, updatePost, config.relayMetadata.relays, toast]);

  // Schedule for a specific date & time
  const [isScheduling, setIsScheduling] = useState(false);
  const handleSchedule = useCallback(async () => {
    if (!scheduleDate || !user || isScheduling) return;

    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const scheduledDate = new Date(scheduleDate);
    scheduledDate.setHours(hours, minutes, 0, 0);
    const scheduledAt = Math.floor(scheduledDate.getTime() / 1000);

    if (scheduledAt <= Math.floor(Date.now() / 1000)) {
      toast({ title: 'Invalid time', description: 'The selected date and time is in the past. Pick a future time.', variant: 'destructive' });
      // Don't close the popover — let user fix the time
      return;
    }

    setIsScheduling(true);
    setShowScheduler(false);

    try {
      const result = await submitSchedule(scheduledAt);

      if (result?.ok) {
        toast({
          title: 'Post scheduled!',
          description: `Will publish on ${format(scheduledDate, 'MMM d, yyyy')} at ${format(scheduledDate, 'h:mm a')}. You can close this tab.`,
        });
      } else {
        toast({
          title: 'Scheduled locally',
          description: `Server unavailable — keep this tab open for it to publish at ${format(scheduledDate, 'h:mm a')}.`,
          variant: 'destructive',
        });
      }
      navigate('/');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast({ title: 'Scheduling failed', description: msg, variant: 'destructive' });
    } finally {
      setIsScheduling(false);
    }
  }, [post, scheduleDate, scheduleTime, user, isScheduling, submitSchedule, toast, navigate]);

  // Quick schedule — offset in seconds from now
  const handleQuickSchedule = useCallback(async (offsetSeconds: number, label: string) => {
    if (!user) return;
    const scheduledAt = Math.floor(Date.now() / 1000) + offsetSeconds;

    setShowScheduler(false);
    const result = await submitSchedule(scheduledAt);

    if (result?.ok) {
      toast({
        title: `Scheduled in ${label}`,
        description: `Will publish at ${format(new Date(scheduledAt * 1000), 'h:mm a')}. You can close this tab.`,
      });
    } else {
      toast({
        title: `Scheduled locally in ${label}`,
        description: `Server unavailable — keep this tab open for it to publish at ${format(new Date(scheduledAt * 1000), 'h:mm a')}.`,
        variant: 'destructive',
      });
    }
    navigate('/');
  }, [user, submitSchedule, toast, navigate]);

  // Publish now — direct publish to relays
  const handlePublishNow = useCallback(async () => {
    if (!user) return;

    try {
      const postToPublish = { ...post, authorPubkey: user.pubkey };
      const event = buildEvent(postToPublish);

      const published = await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: event.created_at,
      });

      const updated: SchedulerPost = {
        ...postToPublish,
        status: 'published',
        publishedAt: Math.floor(Date.now() / 1000),
        publishedEventId: published.id,
      };
      updatePost(updated);
      setPersisted(true);
      toast({ title: 'Published!', description: `Your ${post.postType === 'long' ? 'article' : 'note'} is now live on Nostr.` });
      navigate('/');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const updated: SchedulerPost = { ...post, status: 'failed', errorMessage: errorMsg };
      updatePost(updated);
      setPersisted(true);
      toast({ title: 'Publish failed', description: errorMsg, variant: 'destructive' });
    }
  }, [post, user, publishEvent, updatePost, toast, navigate]);

  const handleDelete = useCallback(() => {
    if (persisted) removePost(post.id);
    toast({ title: 'Post deleted' });
    navigate('/');
  }, [post, persisted, removePost, toast, navigate]);

  // Import from listing browser
  const handleImport = useCallback((data: { content: string; media: UploadedImage[]; importedListing: ImportedListing }) => {
    setPost(prev => ({
      ...prev,
      postType: 'promo' as PostType,
      content: data.content,
      media: data.media,
      importedListing: data.importedListing,
    }));
    toast({ title: 'Listing imported!', description: 'A promo note has been drafted. Edit it to your liking.' });
  }, [toast]);

  // Insert AI-generated content
  const handleAiInsert = useCallback((text: string) => {
    setPost(prev => ({
      ...prev,
      content: prev.content ? prev.content + '\n\n' + text : text,
    }));
    toast({ title: 'Content inserted', description: 'AI-generated text added.' });
  }, [toast]);

  // Multi-listing campaign — create scheduled promo posts with user-specified timing
  const handleCampaign = useCallback((listings: CampaignListing[], options?: { startDate: Date; startTime: string; intervalSeconds: number }) => {
    if (!user || listings.length === 0) return;

    // Use provided options or default fallback
    let startTimestamp: number;
    let interval: number;

    if (options) {
      const [hours, minutes] = options.startTime.split(':').map(Number);
      const start = new Date(options.startDate);
      start.setHours(hours, minutes, 0, 0);
      startTimestamp = Math.floor(start.getTime() / 1000);
      interval = options.intervalSeconds;
    } else {
      startTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      interval = 6 * 3600;
    }

    for (let i = 0; i < listings.length; i++) {
      const item = listings[i];
      const newPost = createNewPost(user.pubkey, 'promo');
      newPost.content = item.content;
      newPost.media = item.media;
      newPost.importedListing = item.importedListing;
      newPost.status = 'scheduled';
      newPost.scheduledAt = startTimestamp + (interval * i);
      updatePost(newPost);
    }

    const intervalLabel = interval < 3600 ? `${interval / 60} min` :
      interval === 3600 ? '1 hour' :
      interval < 86400 ? `${interval / 3600} hours` :
      interval === 86400 ? '1 day' : `${interval / 86400} days`;

    toast({
      title: `Campaign created!`,
      description: `${listings.length} promo notes scheduled, one every ${intervalLabel}.`,
    });
    navigate('/');
  }, [user, updatePost, toast, navigate]);

  // Upload header image for articles
  const handleHeaderImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderImageUploading(true);
    try {
      const tags = await uploadFile(file);
      const url = tags.find(([name]) => name === 'url')?.[1] ?? '';
      if (url) {
        updateField('headerImage', url);
      }
    } catch (error) {
      console.error('Failed to upload header image:', error);
      toast({ title: 'Upload failed', description: 'Could not upload header image.', variant: 'destructive' });
    } finally {
      setHeaderImageUploading(false);
      if (headerImageInputRef.current) headerImageInputRef.current.value = '';
    }
  }, [uploadFile, updateField, toast]);

  // Add hashtag
  const addHashtag = useCallback(() => {
    const tag = hashtagInput.trim().toLowerCase().replace(/^#/, '');
    if (tag && !post.hashtags.includes(tag)) {
      updateField('hashtags', [...post.hashtags, tag]);
    }
    setHashtagInput('');
  }, [hashtagInput, post.hashtags, updateField]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const currentType = POST_TYPES.find(t => t.value === post.postType) ?? POST_TYPES[0];

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold truncate">
            {editId ? 'Edit Post' : 'Compose'}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Create and schedule content for your Nostr audience
          </p>
        </div>
        {post.status !== 'draft' && (
          <Badge variant={post.status === 'scheduled' ? 'default' : post.status === 'published' ? 'outline' : 'destructive'}>
            {post.status}
          </Badge>
        )}
      </div>

      {/* Post Type Selector */}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {POST_TYPES.map(type => {
          const Icon = type.icon;
          const isActive = post.postType === type.value;
          return (
            <button
              key={type.value}
              type="button"
              onClick={() => setPostType(type.value)}
              className={cn(
                'relative flex flex-col items-center gap-1.5 sm:gap-2 p-2.5 sm:p-4 rounded-xl border-2 transition-all duration-200 text-center',
                isActive
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-secondary/50'
              )}
            >
              <div className={cn(
                'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-colors',
                isActive ? 'bg-primary/15' : 'bg-muted'
              )}>
                <Icon className={cn('w-4 h-4 sm:w-5 sm:h-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div>
                <p className={cn('text-xs sm:text-sm font-medium', isActive && 'text-primary')}>{type.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight hidden sm:block">{type.description}</p>
              </div>
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 hidden sm:inline-flex">{type.kind}</Badge>
            </button>
          );
        })}
      </div>

      {/* Template selector — only show if templates exist and not editing */}
      {!editId && templates.length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Load from template</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {templates.slice(0, 6).map((tpl, i) => (
                <Button
                  key={`${tpl.name}-${i}`}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5"
                  onClick={() => {
                    setPost(prev => ({
                      ...prev,
                      content: tpl.content,
                      postType: (tpl.postType as PostType) || prev.postType,
                    }));
                    toast({ title: 'Template loaded', description: `"${tpl.name}" applied.` });
                  }}
                >
                  {tpl.name.slice(0, 25)}{tpl.name.length > 25 ? '...' : ''}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Promo: Listing Browser */}
      {post.postType === 'promo' && (
        <ListingBrowser onImport={handleImport} onCampaign={handleCampaign} />
      )}

      {/* Imported listing reference */}
      {post.importedListing && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  Promoting: {post.importedListing.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {post.importedListing.price && `${post.importedListing.price} ${post.importedListing.currency}`}
                  {post.importedListing.location && ` · ${post.importedListing.location}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7 shrink-0"
                onClick={() => setPost(prev => {
                  const { importedListing: _, ...rest } = prev;
                  return rest as SchedulerPost;
                })}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
            {post.importedListing.marketplaceUrl && (
              <a
                href={post.importedListing.marketplaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline ml-11"
              >
                <ExternalLink className="w-3 h-3" />
                View on Plebeian Market
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* ===== LONG-FORM ARTICLE FIELDS ===== */}
      {post.postType === 'long' && (
        <div className="space-y-4">
          {/* Title */}
          <div>
            <Input
              placeholder="Article title"
              value={post.title}
              onChange={e => updateField('title', e.target.value)}
              className="text-xl font-bold font-display border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:font-normal placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Summary */}
          <div>
            <Input
              placeholder="Brief summary or subtitle (shown in previews)"
              value={post.summary}
              onChange={e => updateField('summary', e.target.value)}
              className="text-sm border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Header Image */}
          <div>
            {post.headerImage ? (
              <div className="relative rounded-xl overflow-hidden border group">
                <img src={post.headerImage} alt="Header" className="w-full h-48 object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => headerImageInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => updateField('headerImage', '')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="w-full border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 hover:bg-primary/5 transition-all group"
                onClick={() => headerImageInputRef.current?.click()}
                disabled={headerImageUploading}
              >
                {headerImageUploading ? (
                  <Loader2 className="w-6 h-6 mx-auto animate-spin text-primary" />
                ) : (
                  <>
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground group-hover:text-primary transition-colors" />
                    <p className="text-sm text-muted-foreground mt-2">Add a header image</p>
                  </>
                )}
              </button>
            )}
            <input
              ref={headerImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleHeaderImageUpload}
            />
          </div>

          {/* Hashtags */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Add hashtags (e.g. bitcoin, farming)"
                  value={hashtagInput}
                  onChange={e => setHashtagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }}
                  className="pl-9 text-sm"
                />
              </div>
              <Button variant="outline" size="sm" onClick={addHashtag} disabled={!hashtagInput.trim()}>
                Add
              </Button>
            </div>
            {post.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {post.hashtags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1 text-xs pr-1">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => updateField('hashtags', post.hashtags.filter(t => t !== tag))}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== CONTENT EDITOR (all post types) ===== */}
      {post.postType === 'long' ? (
        /* Long-form: rich Markdown editor with toolbar */
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Article Content</p>
            <AiGenerateDialog
              currentContent={post.content}
              listingTitle={post.title || undefined}
              listingContext={undefined}
              onInsert={handleAiInsert}
            >
              <Button variant="outline" size="sm" className="gap-2 text-xs">
                <Sparkles className="w-3.5 h-3.5" />
                AI Generate
              </Button>
            </AiGenerateDialog>
          </div>
          <MarkdownEditor
            value={post.content}
            onChange={val => updateField('content', val)}
            placeholder="Start writing your article...\n\nUse the toolbar above for formatting, or write Markdown directly. Keyboard shortcuts: Ctrl+B for bold, Ctrl+I for italic, Ctrl+K for links."
            onUploadImage={async (file) => {
              if (!user) throw new Error('Must be logged in');

              const { BlossomUploader } = await import('@nostrify/nostrify/uploaders');
              const uploader = new BlossomUploader({
                servers: ['https://blossom.primal.net/'],
                signer: user.signer,
              });
              const tags = await uploader.upload(file);

              if (!tags || !Array.isArray(tags)) throw new Error('Upload returned no data');

              const url = tags[0]?.[1];
              if (!url) throw new Error('No URL in upload response');

              // Also add to media array for imeta tags
              const img: UploadedImage = { url };
              for (const tag of tags) {
                const [name, value] = tag;
                if (name === 'ox' || name === 'x') img.sha256 = value;
                else if (name === 'm') img.mimeType = value;
                else if (name === 'dim') img.dimensions = value;
                else if (name === 'size') img.size = parseInt(value);
                else if (name === 'blurhash') img.blurhash = value;
              }
              setPost(prev => ({ ...prev, media: [...prev.media, img] }));

              return url;
            }}
          />
        </div>
      ) : (
        /* Short / Promo: simple card editor with edit/preview toggle */
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Your Note</CardTitle>
              <div className="flex items-center gap-2">
                <AiGenerateDialog
                  currentContent={post.content}
                  listingTitle={post.importedListing?.title}
                  listingContext={
                    post.importedListing
                      ? [
                          post.importedListing.summary && `Summary: ${post.importedListing.summary}`,
                          post.importedListing.price && `Price: ${post.importedListing.price} ${post.importedListing.currency}`,
                          post.importedListing.location && `Location: ${post.importedListing.location}`,
                          post.importedListing.categories.length > 0 && `Categories: ${post.importedListing.categories.join(', ')}`,
                        ].filter(Boolean).join('. ')
                      : undefined
                  }
                  onInsert={handleAiInsert}
                >
                  <Button variant="outline" size="sm" className="gap-2 text-xs">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Generate
                  </Button>
                </AiGenerateDialog>
                {/* Edit / Preview toggle */}
                <Button
                  variant={showNotePreview ? 'secondary' : 'ghost'}
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowNotePreview(!showNotePreview)}
                >
                  {showNotePreview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showNotePreview ? 'Edit' : 'Preview'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {showNotePreview ? (
              /* Preview mode — client mockup */
              <ClientPreview
                content={post.content}
                images={post.media.map(m => m.url)}
                metadata={authorData?.metadata}
              />
            ) : (
              /* Edit mode — textarea with inline image upload */
              <div className="relative">
                <Textarea
                  ref={noteTextareaRef}
                  placeholder={
                    post.postType === 'promo'
                      ? "Write your promotional note... e.g. 'Check out my fresh Christmas Cakes! 50,000 sats 🎄'"
                      : "What's on your mind? Share an update, announcement, or thought..."
                  }
                  value={post.content}
                  onChange={e => updateField('content', e.target.value)}
                  className="min-h-[160px] text-sm pb-12"
                  rows={8}
                />
                {/* Inline toolbar at bottom of textarea */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => inlineImageInputRef.current?.click()}
                        disabled={inlineImageUploading}
                      >
                        {inlineImageUploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="w-3.5 h-3.5" />
                        )}
                        {inlineImageUploading ? 'Uploading...' : 'Image'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Upload and insert image at cursor</TooltipContent>
                  </Tooltip>
                  <input
                    ref={inlineImageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleInlineImageUpload}
                  />

                  {/* @Mention button */}
                  <Popover open={mentionPopoverOpen} onOpenChange={setMentionPopoverOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <AtSign className="w-3.5 h-3.5" />
                            Tag
                          </Button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">Tag a Nostr user</TooltipContent>
                    </Tooltip>
                    <PopoverContent className="w-80 space-y-3" align="start" side="top">
                      <div>
                        <p className="text-sm font-medium">Tag a Nostr user</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          They'll be notified when your post is published
                        </p>
                      </div>
                      <div>
                        <Label className="text-xs">npub or hex pubkey</Label>
                        <Input
                          placeholder="npub1... or paste a hex pubkey"
                          value={mentionInput}
                          onChange={e => setMentionInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleInsertMention(mentionInput);
                            }
                          }}
                          className="mt-1 font-mono text-xs"
                          autoFocus
                        />
                      </div>
                      <Button
                        onClick={() => handleInsertMention(mentionInput)}
                        size="sm"
                        className="w-full"
                        disabled={!mentionInput.trim()}
                      >
                        Insert @mention
                      </Button>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {post.content.length} characters
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="w-3 h-3" />
                Publishes as kind 1 note
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== MEDIA / IMAGE ATTACHMENTS ===== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Media {post.media.length > 0 && <Badge variant="secondary" className="text-xs">{post.media.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageUploader
            images={post.media}
            onImagesChange={imgs => updateField('media', imgs)}
            onInsertUrl={(url) => {
              const separator = post.content && !post.content.endsWith('\n') ? '\n' : '';
              updateField('content', post.content + separator + url);
              toast({ title: 'Image URL inserted', description: 'URL added to your note content.' });
            }}
          />
        </CardContent>
      </Card>

      {/* ===== HASHTAG INPUT + SUGGESTIONS ===== */}
      {post.postType !== 'long' && (
        <Card className="bg-muted/20">
          <CardContent className="p-3 space-y-3">
            {/* Custom hashtag input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Type a hashtag and press Enter"
                  value={hashtagInput}
                  onChange={e => setHashtagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const tag = hashtagInput.trim().replace(/^#/, '');
                      if (tag) {
                        const hashtag = `#${tag}`;
                        if (!post.content.toLowerCase().includes(hashtag.toLowerCase())) {
                          const separator = post.content && !post.content.endsWith('\n') && !post.content.endsWith(' ') ? ' ' : '';
                          updateField('content', post.content + separator + hashtag);
                        }
                        setHashtagInput('');
                      }
                    }
                  }}
                  className="pl-9 text-sm"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!hashtagInput.trim()}
                onClick={() => {
                  const tag = hashtagInput.trim().replace(/^#/, '');
                  if (tag) {
                    const hashtag = `#${tag}`;
                    if (!post.content.toLowerCase().includes(hashtag.toLowerCase())) {
                      const separator = post.content && !post.content.endsWith('\n') && !post.content.endsWith(' ') ? ' ' : '';
                      updateField('content', post.content + separator + hashtag);
                    }
                    setHashtagInput('');
                  }
                }}
              >
                Add
              </Button>
            </div>
            {/* Smart suggestions (based on engagement) + fallback suggestions */}
            <div>
              {smartHashtags.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    Top performing hashtags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {smartHashtags.slice(0, 8).map(ht => {
                      const isInContent = post.content.toLowerCase().includes(`#${ht.tag.toLowerCase()}`);
                      return (
                        <Tooltip key={ht.tag}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={isInContent ? 'secondary' : 'outline'}
                              size="sm"
                              className={cn(
                                'text-xs h-7 px-2.5 gap-1 transition-all border-amber-500/20',
                                isInContent && 'opacity-50 cursor-default',
                                !isInContent && 'hover:border-amber-500/40 hover:bg-amber-500/5',
                              )}
                              disabled={isInContent}
                              onClick={() => {
                                const hashtag = `#${ht.tag}`;
                                const separator = post.content && !post.content.endsWith('\n') && !post.content.endsWith(' ') ? ' ' : '';
                                updateField('content', post.content + separator + hashtag);
                              }}
                            >
                              #{ht.tag}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            Used in {ht.postCount} post{ht.postCount !== 1 ? 's' : ''} · avg {ht.avgEngagement} engagement
                            {ht.totalSats > 0 && ` · ${ht.totalSats.toLocaleString()} sats`}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Quick suggestions</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ...(post.postType === 'promo'
                  ? ['PlebeianMarket', 'Bitcoin', 'Nostr', 'CircularEconomy', 'V4V', 'BuyWithBitcoin', 'NostrMarket', 'Plebchain', 'SupportPlebs', 'PermissionlessCommerce', 'SatsEconomy', 'BitcoinMerchant']
                  : ['Bitcoin', 'Nostr', 'Plebchain', 'V4V', 'BTC', 'Zap', 'BuildOnNostr', 'StackSats', 'PlebeianMarket', 'CircularEconomy']
                ),
                ...(post.importedListing?.categories ?? []).map(c => c.replace(/\s+/g, '')),
              ]
              // Filter out smart hashtags already shown above
              .filter((tag, i, arr) => arr.indexOf(tag) === i)
              .filter(tag => !smartHashtags.some(sh => sh.tag.toLowerCase() === tag.toLowerCase()))
              .map(tag => {
                const isInContent = post.content.toLowerCase().includes(`#${tag.toLowerCase()}`);
                return (
                  <Button
                    key={tag}
                    variant={isInContent ? 'secondary' : 'outline'}
                    size="sm"
                    className={cn(
                      'text-xs h-7 px-2.5 gap-1 transition-all',
                      isInContent && 'opacity-50 cursor-default'
                    )}
                    disabled={isInContent}
                    onClick={() => {
                      const hashtag = `#${tag}`;
                      const separator = post.content && !post.content.endsWith('\n') && !post.content.endsWith(' ') ? ' ' : '';
                      updateField('content', post.content + separator + hashtag);
                    }}
                  >
                    <Hash className="w-2.5 h-2.5" />
                    {tag}
                  </Button>
                );
              })}
            </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* ===== ACTION BAR ===== */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pb-8">
        <div className="flex-1 flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleSaveDraft}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Draft
          </Button>

          <Button
            variant="ghost"
            className="gap-2 text-muted-foreground"
            onClick={handlePublishNow}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Publish Now
          </Button>
        </div>

        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The draft will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Schedule — the main action */}
          <Button
            className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30"
            onClick={() => setShowScheduler(true)}
          >
            <CalendarClock className="w-4 h-4" />
            Schedule
          </Button>

          {/* Schedule Dialog */}
          <AlertDialog open={showScheduler} onOpenChange={setShowScheduler}>
            <AlertDialogContent className="max-w-md p-0 gap-0 overflow-hidden">
              <div className="p-5 pb-3">
                <AlertDialogHeader className="pb-0">
                  <AlertDialogTitle className="flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-primary" />
                    Schedule Post
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Choose when to publish this {post.postType === 'long' ? 'article' : 'note'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </div>

              <div className="px-5 pb-5 space-y-4">
                {/* Quick schedule */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quick schedule</p>
                  <div className="grid grid-cols-4 gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-10 flex-col gap-0.5 py-1" onClick={() => handleQuickSchedule(300, '5 minutes')}>
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      5 min
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-10 flex-col gap-0.5 py-1" onClick={() => handleQuickSchedule(3600, '1 hour')}>
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      1 hour
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-10 flex-col gap-0.5 py-1" onClick={() => handleQuickSchedule(86400, '24 hours')}>
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      24 hrs
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-10 flex-col gap-0.5 py-1" onClick={() => handleQuickSchedule(604800, '1 week')}>
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      1 week
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground">or pick a date & time</span>
                  <Separator className="flex-1" />
                </div>

                {/* Custom date & time */}
                <div className="space-y-3">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    className="rounded-md border mx-auto"
                  />
                  <TimePicker
                    value={scheduleTime}
                    onChange={setScheduleTime}
                  />
                </div>

                {/* Recurring toggle */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (post.recurringInterval > 0) {
                        updateField('recurringInterval', 0);
                        setCustomIntervalValue('');
                      } else {
                        updateField('recurringInterval', 86400);
                      }
                    }}
                    className={cn(
                      'flex items-center gap-2.5 w-full p-2.5 rounded-lg border text-left transition-all text-sm',
                      post.recurringInterval > 0
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-muted/30 border-border hover:border-primary/20'
                    )}
                  >
                    <div className={cn(
                      'w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 transition-colors',
                      post.recurringInterval > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}>
                      {post.recurringInterval > 0 ? '✓' : <Repeat2 className="w-3 h-3" />}
                    </div>
                    <div className="flex-1">
                      <p className={cn('font-medium text-sm', post.recurringInterval > 0 && 'text-primary')}>
                        Make this a recurring post
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Auto-reschedule after each publish
                      </p>
                    </div>
                  </button>

                  {post.recurringInterval > 0 && (
                    <div className="space-y-2.5 pl-7">
                      {/* Quick presets */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { label: 'Daily', value: 86400 },
                          { label: 'Weekly', value: 604800 },
                          { label: 'Bi-weekly', value: 604800 * 2 },
                          { label: 'Monthly', value: 86400 * 30 },
                        ].map(opt => (
                          <Button
                            key={opt.value}
                            size="sm"
                            variant={post.recurringInterval === opt.value ? 'default' : 'outline'}
                            className="text-xs h-8"
                            onClick={() => {
                              updateField('recurringInterval', opt.value);
                              setCustomIntervalValue('');
                            }}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>

                      {/* Custom interval */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Or set a custom interval
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">Every</span>
                          <Input
                            type="number"
                            min={1}
                            max={365}
                            placeholder="e.g. 3"
                            value={customIntervalValue}
                            onChange={e => {
                              const val = e.target.value;
                              setCustomIntervalValue(val);
                              const num = parseInt(val);
                              if (num > 0) {
                                const multiplier = customIntervalUnit === 'days' ? 86400
                                  : customIntervalUnit === 'weeks' ? 604800
                                  : 86400 * 30;
                                updateField('recurringInterval', num * multiplier);
                              }
                            }}
                            className="w-20 h-8 text-xs text-center"
                          />
                          <Select
                            value={customIntervalUnit}
                            onValueChange={(val: 'days' | 'weeks' | 'months') => {
                              setCustomIntervalUnit(val);
                              const num = parseInt(customIntervalValue);
                              if (num > 0) {
                                const multiplier = val === 'days' ? 86400
                                  : val === 'weeks' ? 604800
                                  : 86400 * 30;
                                updateField('recurringInterval', num * multiplier);
                              }
                            }}
                          >
                            <SelectTrigger className="w-24 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="days">days</SelectItem>
                              <SelectItem value="weeks">weeks</SelectItem>
                              <SelectItem value="months">months</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Current setting summary */}
                      <div className="flex items-center gap-1.5 py-1">
                        <Repeat2 className="w-3 h-3 text-primary" />
                        <span className="text-[11px] text-primary font-medium">
                          {post.recurringInterval < 86400
                            ? `Every ${Math.round(post.recurringInterval / 3600)} hours`
                            : post.recurringInterval === 86400 ? 'Every day'
                            : post.recurringInterval < 604800
                              ? `Every ${Math.round(post.recurringInterval / 86400)} days`
                            : post.recurringInterval === 604800 ? 'Every week'
                            : post.recurringInterval < 86400 * 30
                              ? `Every ${Math.round(post.recurringInterval / 604800)} weeks`
                            : post.recurringInterval === 86400 * 30 ? 'Every month'
                            : `Every ${Math.round(post.recurringInterval / (86400 * 30))} months`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer with actions */}
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-t bg-muted/30">
                <Button variant="ghost" size="sm" onClick={() => setShowScheduler(false)}>
                  Cancel
                </Button>
                <Button
                  className="gap-2"
                  onClick={handleSchedule}
                  disabled={!scheduleDate || isScheduling}
                >
                  {isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
                  {isScheduling
                    ? 'Scheduling...'
                    : scheduleDate
                      ? (() => {
                          const [h, m] = scheduleTime.split(':').map(Number);
                          const d = new Date(scheduleDate);
                          d.setHours(h, m);
                          return `Schedule for ${format(d, 'MMM d')} at ${format(d, 'h:mm a')}`;
                        })()
                      : 'Pick a date first'}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
