import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/join')({
  head: () => ({ meta: [
    { title: 'Join your kitchen — Mise' },
    { name: 'description', content: 'Accept your private invitation to the Mise kitchen team.' },
    { property: 'og:title', content: 'Join your kitchen — Mise' },
    { property: 'og:description', content: 'Accept your private invitation to the Mise kitchen team.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }), component: JoinPage,
});

function JoinPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const tokenHash = new URLSearchParams(window.location.hash.slice(1)).get('token_hash');
    window.history.replaceState(null, '', '/join');
    if (!tokenHash) { setError('This invitation is missing or has expired. Ask your manager for a new link.'); setStatus('error'); return; }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' }).then(({ error }) => {
      if (error) { setError('This invitation has expired or was already used. Ask your manager for a new link.'); setStatus('error'); }
      else setStatus('ready');
    });
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setBusy(false); return; }
    navigate({ to: '/today', replace: true });
  }
  return <main className="flex min-h-screen items-center justify-center px-4"><div className="w-full max-w-sm"><p className="font-display text-3xl text-primary">Mise</p><h1 className="mt-3 text-3xl">Join the kitchen</h1>{status === 'checking' && <p className="mt-4 text-muted-foreground">Checking invitation…</p>}{error && <p role="alert" className="mt-4 text-destructive">{error}</p>}{status === 'ready' && <form onSubmit={submit} className="mt-6 space-y-4"><div className="space-y-2"><Label htmlFor="join-password">Choose your password</Label><Input id="join-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></div><Button className="w-full" disabled={busy}>Join team</Button></form>}</div></main>;
}