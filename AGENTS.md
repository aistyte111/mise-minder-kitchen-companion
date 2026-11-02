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

- Permissions: admin vs staff via `user_roles` + `has_role()`; RLS lets all signed-in users read and only admins write. Why: kitchen lead edits, team views.
- Data access goes through `src/lib/kitchen.ts` query options from the browser client (RLS enforces roles). Why: one place for query keys.
- Recipe photos live in private `recipe-photos` bucket, shown via signed URLs. Why: kitchen data stays private.
