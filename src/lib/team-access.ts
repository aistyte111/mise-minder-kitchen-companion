import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export async function requireManager(client: SupabaseClient<Database>, userId: string) {
  const { data, error } = await client.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (error || data !== true) throw new Error('Only managers can manage team access.');
}

export function invitationRole(access: string): 'admin' | 'staff' {
  if (access === 'manager') return 'admin';
  if (access === 'staff') return 'staff';
  throw new Error('Choose manager or staff access.');
}