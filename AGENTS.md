<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Permissions: admin vs staff via `user_roles` + `has_role()`; existing kitchen records are manager-write-only, while Misa project/task/source RLS permits all authenticated team members to write. Why: shared prep execution without widening recipe or team-access permissions.
- Data access goes through `src/lib/kitchen.ts` query options from the browser client (RLS enforces roles). Why: one place for query keys.
- Recipe photos live in private `recipe-photos` bucket, shown via signed URLs. Why: kitchen data stays private.
- Team invitations and role grants use authenticated server functions with a caller-side has_role check before loading the privileged client; native single-use auth invitations establish identity. Why: users cannot grant themselves editing access.
- The UI calls the existing admin role “Manager”; signup is closed and account creation defaults to staff. Why: retain existing RLS while supporting multiple trusted editors.
- Misa uses separate projects, reversible-status tasks, and private source attachments; task queries refresh periodically and updates compare the previous status. Why: shared progress stays current without silently overwriting another cook's move.
- Misa document reading uses authenticated server functions and request-local Responses helpers; browser extraction handles office/text formats. Why: keep credentials private and review AI transcription before saving.
