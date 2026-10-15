import { useRef, useCallback, useState } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  Image,
  Minus,
  AtSign,
  Eye,
  FileCode,
  Pencil,
  Columns2,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { MentionLookup } from '@/components/MentionLookup';
import { cleanPastedMarkdown, markdownFromPaste, pasteNeedsClean } from '@/lib/articlePaste';
import { parsePubkeyInput } from '@/lib/npub';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Called when user wants to upload an image inline. Should return the URL. */
  onUploadImage?: (file: File) => Promise<string>;
}

interface ToolbarAction {
  icon: typeof Bold;
  label: string;
  shortcut?: string;
  action: 'wrap' | 'prefix' | 'insert' | 'custom';
  before?: string;
  after?: string;
  prefix?: string;
  text?: string;
  group?: string;
}

type EditorView = 'write' | 'split' | 'preview';

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { icon: Heading1, label: 'Heading 1', shortcut: 'Ctrl+1', action: 'prefix', prefix: '# ', group: 'heading' },
  { icon: Heading2, label: 'Heading 2', shortcut: 'Ctrl+2', action: 'prefix', prefix: '## ', group: 'heading' },
  { icon: Heading3, label: 'Heading 3', shortcut: 'Ctrl+3', action: 'prefix', prefix: '### ', group: 'heading' },
  { icon: Bold, label: 'Bold', shortcut: 'Ctrl+B', action: 'wrap', before: '**', after: '**', group: 'format' },
  { icon: Italic, label: 'Italic', shortcut: 'Ctrl+I', action: 'wrap', before: '*', after: '*', group: 'format' },
  { icon: Strikethrough, label: 'Strikethrough', shortcut: 'Ctrl+D', action: 'wrap', before: '~~', after: '~~', group: 'format' },
  { icon: Code, label: 'Inline code', action: 'wrap', before: '`', after: '`', group: 'format' },
  { icon: Quote, label: 'Blockquote', action: 'prefix', prefix: '> ', group: 'block' },
  { icon: List, label: 'Bullet list', action: 'prefix', prefix: '- ', group: 'block' },
  { icon: ListOrdered, label: 'Numbered list', action: 'prefix', prefix: '1. ', group: 'block' },
  { icon: Minus, label: 'Horizontal rule', action: 'insert', text: '\n\n---\n\n', group: 'block' },
  { icon: FileCode, label: 'Code block', action: 'wrap', before: '\n```\n', after: '\n```\n', group: 'block' },
];

const FONT_CLASS: Record<string, string> = {
  sans: 'font-ui',
  serif: 'font-article',
  mono: 'font-mono',
};

export function MarkdownEditor({ value, onChange, placeholder, className, onUploadImage }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<EditorView>('split');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [mentionNpub, setMentionNpub] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const { editorFont } = useTheme();
  const fontClass = FONT_CLASS[editorFont] ?? FONT_CLASS.sans;
  const editing = view === 'write' || view === 'split';

  const insertAtCursor = useCallback((textToInsert: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + textToInsert);
      return;
    }

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newValue = value.slice(0, start) + textToInsert + value.slice(end);
    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      const newPos = start + textToInsert.length;
      ta.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  const wrapSelection = useCallback((before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const placeholderText = selected || 'text';
    const wrapped = before + placeholderText + after;
    const newValue = value.slice(0, start) + wrapped + value.slice(end);
    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      if (!selected) {
        ta.setSelectionRange(start + before.length, start + before.length + placeholderText.length);
      } else {
        ta.setSelectionRange(start + wrapped.length, start + wrapped.length);
      }
    });
  }, [value, onChange]);

  const prefixLine = useCallback((prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(newValue);

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }, [value, onChange]);

  const executeAction = useCallback((action: ToolbarAction) => {
    switch (action.action) {
      case 'wrap':
        wrapSelection(action.before || '', action.after || '');
        break;
      case 'prefix':
        prefixLine(action.prefix || '');
        break;
      case 'insert':
        insertAtCursor(action.text || '');
        break;
    }
  }, [wrapSelection, prefixLine, insertAtCursor]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      insertAtCursor('  ');
      return;
    }

    if (!e.ctrlKey && !e.metaKey) return;

    const key = e.key.toLowerCase();
    let handled = false;

    if (key === 'b') {
      wrapSelection('**', '**');
      handled = true;
    } else if (key === 'i') {
      wrapSelection('*', '*');
      handled = true;
    } else if (key === 'd') {
      wrapSelection('~~', '~~');
      handled = true;
    } else if (key === 'k') {
      setLinkPopoverOpen(true);
      handled = true;
    } else if (key === '1') {
      prefixLine('# ');
      handled = true;
    } else if (key === '2') {
      prefixLine('## ');
      handled = true;
    } else if (key === '3') {
      prefixLine('### ');
      handled = true;
    }

    if (handled) {
      e.preventDefault();
    }
  }, [wrapSelection, prefixLine, insertAtCursor]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html') || '';
    const text = e.clipboardData.getData('text/plain') || '';
    if (!pasteNeedsClean(html, text)) return;

    const md = markdownFromPaste(html, text);
    if (!md) return;
    e.preventDefault();
    insertAtCursor(md);
  }, [insertAtCursor]);

  const handleCleanPaste = useCallback(() => {
    const cleaned = cleanPastedMarkdown(value);
    if (cleaned !== value) onChange(cleaned);
  }, [value, onChange]);

  const handleInsertLink = useCallback(() => {
    if (!linkUrl.trim()) return;
    const text = linkText.trim() || linkUrl.trim();
    insertAtCursor(`[${text}](${linkUrl.trim()})`);
    setLinkUrl('');
    setLinkText('');
    setLinkPopoverOpen(false);
  }, [linkUrl, linkText, insertAtCursor]);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadImage) return;

    setImageUploading(true);
    try {
      const url = await onUploadImage(file);
      insertAtCursor(`\n\n![](${url})\n\n`);
    } catch (error) {
      console.error('Image upload failed:', error);
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }, [onUploadImage, insertAtCursor]);

  const handleInsertMention = useCallback((npub: string) => {
    const parsed = parsePubkeyInput(npub);
    if (!parsed) return;
    insertAtCursor(`nostr:${parsed.npub}`);
    setMentionNpub('');
    setMentionPopoverOpen(false);
  }, [insertAtCursor]);

  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const groups: { group: string; actions: ToolbarAction[] }[] = [];
  for (const action of TOOLBAR_ACTIONS) {
    const existing = groups.find(g => g.group === (action.group || ''));
    if (existing) {
      existing.actions.push(action);
    } else {
      groups.push({ group: action.group || '', actions: [action] });
    }
  }

  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden shadow-sm', className)}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b bg-muted/30 flex-wrap">
        {groups.map((group, gi) => (
          <div key={group.group} className="flex items-center gap-0.5">
            {gi > 0 && <Separator orientation="vertical" className="h-6 mx-1" />}
            {group.actions.map(action => {
              const Icon = action.icon;
              return (
                <Tooltip key={action.label}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                      onClick={() => executeAction(action)}
                      disabled={!editing}
                    >
                      <Icon className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {action.label}
                    {action.shortcut && <span className="ml-2 text-muted-foreground">{action.shortcut}</span>}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  disabled={!editing}
                >
                  <Link2 className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Insert link <span className="ml-2 text-muted-foreground">Ctrl+K</span>
            </TooltipContent>
          </Tooltip>
          <PopoverContent className="w-72 space-y-3" align="start">
            <p className="text-sm font-medium">Insert Link</p>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Link text</Label>
                <Input
                  placeholder="Display text"
                  value={linkText}
                  onChange={e => setLinkText(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">URL</Label>
                <Input
                  placeholder="https://..."
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleInsertLink(); }}
                  className="mt-1"
                />
              </div>
            </div>
            <Button onClick={handleInsertLink} size="sm" className="w-full" disabled={!linkUrl.trim()}>
              Insert
            </Button>
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
              disabled={!editing || imageUploading}
              onClick={() => {
                if (onUploadImage) {
                  imageInputRef.current?.click();
                } else {
                  wrapSelection('![', '](url)');
                }
              }}
            >
              {imageUploading ? (
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Image className="w-4 h-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {onUploadImage ? 'Upload & insert image' : 'Insert image'}
          </TooltipContent>
        </Tooltip>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        <Popover open={mentionPopoverOpen} onOpenChange={setMentionPopoverOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  disabled={!editing}
                >
                  <AtSign className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Mention npub</TooltipContent>
          </Tooltip>
          <PopoverContent className="w-80" align="start">
            <MentionLookup
              value={mentionNpub}
              onChange={setMentionNpub}
              onInsert={handleInsertMention}
            />
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-foreground hover:bg-secondary"
              disabled={!value.trim()}
              onClick={handleCleanPaste}
            >
              <WandSparkles className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Clean pasted markdown
          </TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <div className="flex items-center rounded-md border bg-background p-0.5">
          {([
            { id: 'write' as const, icon: Pencil, label: 'Write' },
            { id: 'split' as const, icon: Columns2, label: 'Split' },
            { id: 'preview' as const, icon: Eye, label: 'Preview' },
          ]).map(opt => (
            <Tooltip key={opt.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={view === opt.id ? 'secondary' : 'ghost'}
                  size="icon"
                  className="w-7 h-7"
                  onClick={() => setView(opt.id)}
                >
                  <opt.icon className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{opt.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'grid overflow-hidden',
          view === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1',
        )}
      >
        {editing && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            className={cn(
              'w-full min-h-[280px] lg:min-h-[480px] max-h-[70vh] p-6 resize-y text-[15px] leading-relaxed',
              'bg-transparent border-0 outline-none focus:ring-0',
              'placeholder:text-muted-foreground/40',
              view === 'split' && 'lg:border-r lg:max-h-[70vh]',
              fontClass,
            )}
            spellCheck
          />
        )}

        {(view === 'preview' || view === 'split') && (
          <div
            className={cn(
              'min-h-[280px] lg:min-h-[480px] max-h-[70vh] overflow-y-auto p-6',
              view === 'split' && 'bg-muted/10 border-t lg:border-t-0',
              fontClass,
            )}
          >
            {view === 'split' && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Preview</p>
            )}
            <MarkdownPreview content={value} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/20 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>{value.length} chars</span>
          <span>{wordCount} words</span>
          <span>~{readingTime} min read</span>
        </div>
        <span className="opacity-60">Paste from Substack is cleaned automatically · Markdown · NIP-23</span>
      </div>
    </div>
  );
}
