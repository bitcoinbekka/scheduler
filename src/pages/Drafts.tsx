import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  FileText,
  ShoppingBag,
  MessageSquare,
  Newspaper,
  Trash2,
  PenSquare,
  CalendarClock,
  Clock,
  Repeat2,
  Megaphone,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useScheduler } from '@/contexts/SchedulerContext';
import { useHoldSchedule } from '@/hooks/useHoldSchedule';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { SchedulerPost } from '@/lib/types';

/** Get a human-friendly title for a draft */
function getPostTitle(post: SchedulerPost): string {
  if (post.postType === 'long' && post.title) return post.title;
  if (post.importedListing?.title) return post.importedListing.title;
  return post.content.slice(0, 80) || 'Empty note';
}

/** Get the icon for a post type */
function getPostIcon(post: SchedulerPost) {
  if (post.postType === 'long') return Newspaper;
  if (post.postType === 'promo') {
    // Campaign = has an imported listing; regular promo = no listing
    return post.importedListing ? Megaphone : ShoppingBag;
  }
  return MessageSquare;
}

/** Get badge styling for a post type */
function getPostTypeBadge(post: SchedulerPost) {
  if (post.postType === 'long') return { label: 'Long-form Article', shortLabel: 'Article', kind: 'kind 30023', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' };
  if (post.postType === 'promo' && post.importedListing) {
    return { label: 'Campaign Promo', shortLabel: 'Campaign', kind: 'kind 1', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  }
  if (post.postType === 'promo') return { label: 'Promo Note', shortLabel: 'Promo', kind: 'kind 1', color: 'bg-primary/10 text-primary border-primary/20' };
  return { label: 'Short Note', shortLabel: 'Note', kind: 'kind 1', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
}

export default function Drafts() {
  useSeoMeta({
    title: 'Drafts - Plebeian Scheduler',
    description: 'Manage your draft promotional posts.',
  });

  const { posts } = useScheduler();
  const { deleteAndCancel } = useHoldSchedule();

  const drafts = posts
    .filter(p => p.status === 'draft')
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const handleDelete = (id: string) => {
    const post = posts.find(p => p.id === id);
    if (post) void deleteAndCancel(post);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Drafts</h1>
          <p className="text-muted-foreground mt-1">
            {drafts.length} draft{drafts.length !== 1 ? 's' : ''} saved locally
          </p>
        </div>
        <Link to="/compose">
          <Button className="gap-2">
            <PenSquare className="w-4 h-4" />
            New Note
          </Button>
        </Link>
      </div>

      {drafts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No drafts yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Start composing a promo note and save it as a draft to come back later.
                </p>
              </div>
              <Link to="/compose">
                <Button variant="outline" className="gap-2">
                  <PenSquare className="w-4 h-4" />
                  Create Your First Draft
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map(post => {
            const title = getPostTitle(post);
            const preview = post.postType === 'long' && post.title
              ? post.content.slice(0, 120) || 'No content'
              : post.content.slice(0, 120) || 'No content';
            const PostIcon = getPostIcon(post);
            const typeBadge = getPostTypeBadge(post);

            return (
              <Card key={post.id} className="hover:shadow-md transition-shadow duration-200 group">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                      post.postType === 'long' ? 'bg-violet-500/10' :
                      post.postType === 'promo' && post.importedListing ? 'bg-amber-500/10' :
                      post.postType === 'promo' ? 'bg-primary/10' :
                      'bg-blue-500/10'
                    )}>
                      <PostIcon className={cn(
                        'w-5 h-5',
                        post.postType === 'long' ? 'text-violet-500' :
                        post.postType === 'promo' && post.importedListing ? 'text-amber-500' :
                        post.postType === 'promo' ? 'text-primary' :
                        'text-blue-500'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm truncate">{title}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                            {preview}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge variant="outline" className={cn('text-[10px] border', typeBadge.color)}>
                            {typeBadge.shortLabel}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground/60 font-mono">
                            {typeBadge.kind}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-3 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(post.updatedAt * 1000), { addSuffix: true })}
                        </span>

                        {post.importedListing?.price && (
                          <span className="text-xs font-medium text-primary">
                            {post.importedListing.price} {post.importedListing.currency}
                          </span>
                        )}

                        {post.media.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {post.media.length} image{post.media.length !== 1 ? 's' : ''}
                          </span>
                        )}

                        {post.recurringInterval > 0 && (
                          <span className="flex items-center gap-1 text-xs text-violet-500">
                            <Repeat2 className="w-3 h-3" />
                            Recurring
                          </span>
                        )}

                        <div className="flex-1" />

                        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={`/compose?edit=${post.id}`}>
                            <Button variant="ghost" size="sm" className="gap-1.5 h-8">
                              <PenSquare className="w-3.5 h-3.5" />
                              Edit
                            </Button>
                          </Link>
                          <Link to={`/compose?edit=${post.id}`}>
                            <Button variant="ghost" size="sm" className="gap-1.5 h-8">
                              <CalendarClock className="w-3.5 h-3.5" />
                              Schedule
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete draft?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This draft will be permanently removed.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(post.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
