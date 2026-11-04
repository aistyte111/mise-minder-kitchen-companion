import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { invitationRole, requireManager } from '@/lib/team-access';

export const inviteTeamMember = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ email: z.email(), access: z.enum(['staff', 'manager']) }))
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: invitation, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite', email: data.email.trim().toLowerCase(),
    });
    if (error) throw new Error(error.message);
    if (!invitation.user || !invitation.properties?.hashed_token) throw new Error('Could not create invitation.');
    const role = invitationRole(data.access);
    if (role === 'admin') {
      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({ user_id: invitation.user.id, role });
      if (roleError) throw new Error('Invitation was not completed. Please try again.');
    }
    return { tokenHash: invitation.properties.hashed_token };
  });

export const grantManagerAccess = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.uuid() }))
  .handler(async ({ data, context }) => {
    await requireManager(context.supabase, context.userId);
    const { data: profile, error } = await context.supabase.from('profiles').select('id').eq('id', data.userId).maybeSingle();
    if (error || !profile) throw new Error('Team member not found.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error: updateError } = await supabaseAdmin.from('user_roles').upsert({ user_id: data.userId, role: 'admin' }, { onConflict: 'user_id,role' });
    if (updateError) throw new Error('Could not grant manager access.');
    return { success: true };
  });