import { LOOKS, type Look } from '@/lib/looks';
import { cn } from '@/lib/utils';

interface LookPickerProps {
  value: Look;
  onChange: (look: Look) => void;
}

export function LookPicker({ value, onChange }: LookPickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {LOOKS.map((look) => {
        const selected = value === look.id;
        return (
          <button
            key={look.id}
            type="button"
            onClick={() => onChange(look.id)}
            className={cn(
              'text-left rounded-xl border-2 overflow-hidden transition-all',
              selected
                ? 'border-primary shadow-sm ring-2 ring-primary/20'
                : 'border-border hover:border-primary/40',
            )}
          >
            <div
              className="px-3 py-3"
              style={{
                background: look.preview.bg,
                color: look.preview.fg,
                fontFamily: look.preview.font,
                borderRadius: 0,
              }}
            >
              <p className="text-sm font-semibold tracking-tight">Plebeian</p>
              <p className="text-[11px] opacity-70 mt-0.5">The stall is open.</p>
              <div className="mt-3 flex items-center gap-1.5">
                <span
                  className="h-2 w-10"
                  style={{
                    background: look.preview.accent,
                    borderRadius: look.preview.radius,
                  }}
                />
                <span
                  className="h-2 w-16"
                  style={{
                    background: look.preview.muted,
                    borderRadius: look.preview.radius,
                  }}
                />
              </div>
            </div>
            <div className="px-3 py-2 bg-card border-t border-border">
              <p className="text-sm font-medium">{look.name}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{look.blurb}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
