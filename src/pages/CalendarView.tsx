import { useState, useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  MessageSquare,
  Newspaper,
  Clock,
  PenSquare,
  Repeat2,
  Server,
  Monitor,
  Trash2,
  Send,
  FileText,
  PauseCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { isLiveAlarm } from '@/lib/holdSchedule';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
  formatDistanceToNow,
} from 'date-fns';
import { cn } from '@/lib/utils';
import type { SchedulerPost } from '@/lib/types';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-primary',
  published: 'bg-emerald-500',
  failed: 'bg-destructive',
  draft: 'bg-muted-foreground',
  queued: 'bg-amber-500',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getPostTitle(post: SchedulerPost): string {
  if (post.postType === 'long' && post.title) return post.title;
  if (post.importedListing?.title) return post.importedListing.title;
  return post.content.slice(0, 40) || 'Empty note';
}

function getPostIcon(post: SchedulerPost) {
  if (post.postType === 'long') return Newspaper;
  if (post.postType === 'promo') return ShoppingBag;
  return MessageSquare;
}

function getRecurringLabel(interval: number): string {
  if (interval === 86400) return 'Daily';
  if (interval === 604800) return 'Weekly';
  if (interval === 604800 * 2) return 'Bi-weekly';
  if (interval === 86400 * 30) return 'Monthly';
  if (interval < 3600) return `Every ${Math.round(interval / 60)} min`;
  if (interval < 86400) return `Every ${Math.round(interval / 3600)} hours`;
  if (interval < 604800) return `Every ${Math.round(interval / 86400)} days`;
  if (interval < 86400 * 30) {
    const weeks = Math.round(interval / 604800);
    return `Every ${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  const months = Math.round(interval / (86400 * 30));
  return `Every ${months} month${months !== 1 ? 's' : ''}`;
}

function getPostTypeBadge(post: SchedulerPost) {
  if (post.postType === 'long') return { label: 'Article', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20' };
  if (post.postType === 'promo') return { label: 'Promo', color: 'bg-primary/10 text-primary border-primary/20' };
  return { label: 'Note', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' };
}

export default function CalendarView() {
  useSeoMeta({
    title: 'Calendar - Plebeian Scheduler',
    description: 'View your scheduled posts in a calendar layout.',
  });

  const { posts } = useScheduler();
  const { holdAsDraft, deleteAndCancel } = useHoldSchedule();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Get all days to display in the calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentMonth]);

  // Group posts by date
  const postsByDate = useMemo(() => {
    const map = new Map<string, SchedulerPost[]>();
    for (const post of posts) {
      const ts = post.scheduledAt ?? post.createdAt;
      if (!ts) continue;
      const key = format(new Date(ts * 1000), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(post);
    }
    return map;
  }, [posts]);

  // Get posts for selected date
  const selectedDayPosts = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, 'yyyy-MM-dd');
    return (postsByDate.get(key) ?? []).sort((a, b) => {
      const tsA = a.scheduledAt ?? a.createdAt;
      const tsB = b.scheduledAt ?? b.createdAt;
      return tsA - tsB;
    });
  }, [selectedDate, postsByDate]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Calendar</h1>
        <p className="text-muted-foreground mt-1">
          Visualize your publishing schedule
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Calendar Grid */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <CardTitle className="text-lg font-display">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {calendarDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const dayPosts = postsByDate.get(key) ?? [];
                const isCurrentMonth = isSameMonth(day, currentMonth);
                const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                const today = isToday(day);

                  // Heatmap intensity based on post count
                  const intensity = dayPosts.length === 0 ? '' :
                    dayPosts.length === 1 ? 'bg-primary/10' :
                    dayPosts.length === 2 ? 'bg-primary/20' :
                    dayPosts.length >= 3 ? 'bg-primary/30' : '';

                  return (
                  <button
                    key={key}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      'relative min-h-[72px] md:min-h-[88px] p-1.5 text-left bg-card transition-colors',
                      !isCurrentMonth && 'opacity-40',
                      isSelected && 'ring-2 ring-primary ring-inset bg-primary/5',
                      !isSelected && intensity,
                      !isSelected && !intensity && 'hover:bg-secondary/50'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs font-medium',
                        today && 'bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center',
                        !today && 'px-1'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayPosts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {dayPosts.slice(0, 3).map(post => (
                          <div
                            key={post.id}
                            className={cn(
                              'h-1.5 rounded-full',
                              STATUS_COLORS[post.status] || 'bg-muted-foreground'
                            )}
                            title={getPostTitle(post)}
                          />
                        ))}
                        {dayPosts.length > 3 && (
                          <span className="text-[10px] text-muted-foreground leading-none">
                            +{dayPosts.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {[
                { label: 'Scheduled', color: 'bg-primary' },
                { label: 'Published', color: 'bg-emerald-500' },
                { label: 'Failed', color: 'bg-destructive' },
                { label: 'Draft', color: 'bg-muted-foreground' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={cn('w-2.5 h-2.5 rounded-full', item.color)} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Day Detail Panel */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            {selectedDate ? format(selectedDate, 'EEEE, MMM d') : 'Select a day'}
          </h2>

          {!selectedDate ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Click on a day to see scheduled posts
              </CardContent>
            </Card>
          ) : selectedDayPosts.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No posts on this day
              </CardContent>
            </Card>
          ) : (
            selectedDayPosts.map(post => {
              const PostIcon = getPostIcon(post);
              const ts = post.scheduledAt ?? post.createdAt;
              const isServer = !!post.serverEventId;
              const typeBadge = getPostTypeBadge(post);

              return (
                <Card key={post.id} className="hover:shadow-md transition-shadow group overflow-hidden">
                  <CardContent className="p-0">
                    {/* Clickable main area → opens editor */}
                    <Link to={`/compose?edit=${post.id}`} className="block p-3 pb-2">
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                          post.status === 'published' ? 'bg-emerald-500/10' :
                          post.status === 'failed' ? 'bg-destructive/10' :
                          'bg-primary/10'
                        )}>
                          <PostIcon className={cn(
                            'w-4 h-4',
                            post.status === 'published' ? 'text-emerald-500' :
                            post.status === 'failed' ? 'text-destructive' :
                            'text-primary'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate leading-tight">{getPostTitle(post)}</p>

                          {/* Metadata row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              {format(new Date(ts * 1000), 'h:mm a')}
                            </span>

                            <Badge variant="outline" className={cn('text-[10px] h-5 border', typeBadge.color)}>
                              {typeBadge.label}
                            </Badge>

                            <Badge
                              variant={post.status === 'published' ? 'default' : post.status === 'failed' ? 'destructive' : 'outline'}
                              className={cn(
                                'text-[10px] h-5',
                                post.status === 'published' && 'bg-emerald-500 hover:bg-emerald-500/90',
                              )}
                            >
                              {post.status}
                            </Badge>
                          </div>

                          {/* Recurring indicator */}
                          {post.recurringInterval > 0 && (
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <Repeat2 className="w-3 h-3 text-violet-500" />
                              <span className="text-[11px] text-violet-600 dark:text-violet-400 font-medium">
                                {getRecurringLabel(post.recurringInterval)}
                              </span>
                              {post.recurringCount > 0 && (
                                <span className="text-[10px] text-muted-foreground">
                                  ({post.recurringCount}/{post.recurringLimit || '∞'} published)
                                </span>
                              )}
                            </div>
                          )}

                          {/* Server/local indicator */}
                          {post.status === 'scheduled' && (
                            <span className={cn(
                              'flex items-center gap-1 text-[10px] mt-1',
                              isServer ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                            )}>
                              {isServer ? <Server className="w-2.5 h-2.5" /> : <Monitor className="w-2.5 h-2.5" />}
                              {isServer ? 'Server-side — safe to close browser' : 'Local — keep tab open'}
                            </span>
                          )}

                          {/* Content preview */}
                          {post.content && (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1.5 leading-relaxed">
                              {post.content.slice(0, 120)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 px-3 pb-2.5 pt-1 border-t border-transparent group-hover:border-border transition-colors">
                      <Link to={`/compose?edit=${post.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs">
                          <PenSquare className="w-3 h-3" />
                          Edit
                        </Button>
                      </Link>

                      {isLiveAlarm(post) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 h-7 text-xs"
                          disabled={busyId === post.id}
                          onClick={async () => {
                            setBusyId(post.id);
                            try {
                              await holdAsDraft(post);
                            } finally {
                              setBusyId(null);
                            }
                          }}
                        >
                          <PauseCircle className="w-3 h-3" />
                          Hold
                        </Button>
                      )}

                      {post.status === 'scheduled' && (
                        <Badge variant="secondary" className="text-[10px] h-5 ml-auto">
                          {post.scheduledAt && formatDistanceToNow(new Date(post.scheduledAt * 1000), { addSuffix: true })}
                        </Badge>
                      )}

                      {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed') && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive ml-auto">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {post.serverEventId
                                  ? 'This removes the post and cancels the server alarm.'
                                  : 'This will permanently remove the post from your schedule.'}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  setBusyId(post.id);
                                  try {
                                    await deleteAndCancel(post);
                                  } finally {
                                    setBusyId(null);
                                  }
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}

          {/* Add post for this day */}
          {selectedDate && (
            <Link to="/compose">
              <Button variant="outline" className="w-full gap-2 border-dashed text-muted-foreground hover:text-foreground">
                <PenSquare className="w-3.5 h-3.5" />
                New post for {format(selectedDate, 'MMM d')}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
