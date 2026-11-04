import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { invitationRole, requireManager } from '@/lib/team-access';

const client = (data: boolean | null, error: unknown = null) => ({ rpc: async () => ({ data, error }) }) as unknown as SupabaseClient<Database>;
describe('Team access rules', () => {
  it('invited staff are view-only staff', () => expect(invitationRole('staff')).toBe('staff'));
  it('additional managers receive the existing editing role', () => expect(invitationRole('manager')).toBe('admin'));
  it('staff cannot manage invitations or editing access', async () => {
    await expect(requireManager(client(false), 'staff-id')).rejects.toThrow('Only managers');
  });
  it('managers can manage team access', async () => {
    await expect(requireManager(client(true), 'manager-id')).resolves.toBeUndefined();
  });
  it('a failed role lookup never grants access', async () => {
    await expect(requireManager(client(null, new Error('offline')), 'user-id')).rejects.toThrow('Only managers');
  });
});