import { createFileRoute } from '@tanstack/react-router';
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { Copy, UserPlus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { roleQuery } from '@/lib/kitchen';
import { grantManagerAccess, inviteTeamMember } from '@/lib/team.functions';

const teamQuery = queryOptions({
  queryKey: ['team'],
  queryFn: async () => {
    const { data: profiles, error } = await supabase.from('profiles').select('id, display_name').order('created_at');
    if (error) throw error;
    const { data: roles, error: roleError } = await supabase.from('user_roles').select('user_id, role');
    if (roleError) throw roleError;
    return profiles.map(p => ({ ...p, isManager: roles.some(r => r.user_id === p.id && r.role === 'admin') }));
  },
});

export const Route = createFileRoute('/_authenticated/team')({
  loader: async ({ context }) => {
    const role = await context.queryClient.ensureQueryData(roleQuery);
    if (role.isAdmin) await context.queryClient.ensureQueryData(teamQuery);
  },
  head: () => ({ meta: [
    { title: 'Team access — Mise' },
    { name: 'description', content: 'Manage kitchen managers and invited view-only staff in Mise.' },
    { property: 'og:title', content: 'Team access — Mise' },
    { property: 'og:description', content: 'Manage kitchen managers and invited view-only staff in Mise.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: TeamPage,
});

function TeamPage() {
  const { data: role } = useSuspenseQuery(roleQuery);
  return role.isAdmin ? <ManagerTeam /> : <><h1 className="text-3xl">Team access</h1><p className="mt-4 text-muted-foreground">Your staff account has view-only access.</p></>;
}

function ManagerTeam() {
  const { data: members, refetch } = useSuspenseQuery(teamQuery);
  const invite = useServerFn(inviteTeamMember);
  const promote = useServerFn(grantManagerAccess);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<'staff' | 'manager'>('staff');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setLink('');
    try {
      const result = await invite({ data: { email, access } });
      const url = new URL('/join', window.location.origin);
      url.hash = new URLSearchParams({ token_hash: result.tokenHash }).toString();
      setLink(url.toString()); await refetch();
      toast.success('Invitation ready to share.');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not create invitation.'); }
    finally { setBusy(false); }
  }
  async function makeManager(id: string) {
    if (!window.confirm('Give this person permission to edit everything and invite other managers?')) return;
    setBusy(true);
    try { await promote({ data: { userId: id } }); await refetch(); toast.success('Manager access granted.'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update access.'); }
    finally { setBusy(false); }
  }
  return <>
    <h1 className="text-3xl">Team access</h1>
    <form onSubmit={submit} className="mt-6 space-y-4 border-b pb-6">
      <h2 className="text-xl">Invite to the kitchen</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="invite-access">Access</Label><Select value={access} onValueChange={v => { if (v === 'staff' || v === 'manager') setAccess(v); }}><SelectTrigger id="invite-access"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="staff">Staff · view only</SelectItem><SelectItem value="manager">Manager · can edit and invite</SelectItem></SelectContent></Select></div>
      </div>
      <Button disabled={busy}><UserPlus className="h-4 w-4" />Create invitation</Button>
      {link && <div className="space-y-2"><Label htmlFor="invitation-link">Private invitation link · share only with the invited person</Label><div className="flex gap-2"><Input id="invitation-link" value={link} readOnly /><Button type="button" variant="outline" size="icon" aria-label="Copy invitation link" onClick={async () => { try { await navigator.clipboard.writeText(link); toast.success('Invitation copied.'); } catch { toast.error('Select the link and copy it.'); } }}><Copy className="h-4 w-4" /></Button></div></div>}
    </form>
    <h2 className="mt-6 text-xl">Kitchen team</h2>
    <ul className="mt-3 divide-y">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium break-words">{member.display_name || 'Team member'}</p><p className="text-sm text-muted-foreground">{member.isManager ? 'Manager · can edit and invite' : 'Staff · view only'}</p></div>{!member.isManager && <Button variant="outline" disabled={busy} onClick={() => makeManager(member.id)}><ShieldCheck className="h-4 w-4" />Make manager</Button>}</li>)}</ul>
  </>;
}