import { useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/useToast';
import {
  loadBunkerSettings,
  saveBunkerSettings,
  clearBunkerSettings,
  parseBunkerUri,
  redactBunkerUri,
} from '@/lib/bunkerUri';

export function SchedulerBunkerSettings() {
  const { toast } = useToast();
  const initial = loadBunkerSettings();
  const [bunkerUri, setBunkerUri] = useState(initial.bunkerUri);
  const [signAtFire, setSignAtFire] = useState(initial.signAtFire);

  const handleSave = () => {
    try {
      if (signAtFire || bunkerUri.trim()) {
        parseBunkerUri(bunkerUri);
      }
      saveBunkerSettings({ bunkerUri: bunkerUri.trim(), signAtFire });
      toast({
        title: signAtFire ? 'Fire-time signing on' : 'Bunker saved',
        description: signAtFire
          ? 'Scheduled notes will be signed by your bunker at publish time. Keep the bunker running.'
          : 'Saved on this device only. Not published to Nostr.',
      });
    } catch (err) {
      toast({
        title: 'Invalid bunker URI',
        description: err instanceof Error ? err.message : 'Could not parse bunker://',
        variant: 'destructive',
      });
    }
  };

  const handleClear = () => {
    clearBunkerSettings();
    setBunkerUri('');
    setSignAtFire(false);
    toast({ title: 'Bunker connection cleared from this device' });
  };

  let preview = '';
  try {
    if (bunkerUri.trim()) preview = redactBunkerUri(bunkerUri);
  } catch {
    preview = '';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4" />
          Sign at fire time (NIP-46 bunker)
        </CardTitle>
        <CardDescription>
          Optional. Paste a bunker:// URI from Plebeian Bunker (recommended), nsec.app, or Amber.
          The scheduler asks that bunker to sign at publish time so created_at is now,
          not when you clicked Schedule. Plebeian Signer stays NIP-07 for this website.
          The URI never goes to Nostr. It is stored on this device and encrypted on the scheduler server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="sign-at-fire">Sign at fire time</Label>
            <p className="text-xs text-muted-foreground">
              Off = pre-sign now. On = unsigned template; your bunker signs at 08:00.
            </p>
          </div>
          <Switch
            id="sign-at-fire"
            checked={signAtFire}
            onCheckedChange={setSignAtFire}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bunker-uri">Bunker URI</Label>
          <Input
            id="bunker-uri"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="bunker://…?relay=wss://…&secret=…"
            value={bunkerUri}
            onChange={(e) => setBunkerUri(e.target.value)}
          />
          {preview && (
            <p className="text-[11px] font-mono text-muted-foreground truncate">{preview}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave}>Save bunker</Button>
          <Button variant="ghost" className="gap-2" onClick={handleClear}>
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
