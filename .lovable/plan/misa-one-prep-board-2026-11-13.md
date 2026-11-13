# Misa: one prep board

## What changes for you
1. **No more projects.** The "New project" button and "Project" picker go away. Misa shows one list: header "Misa", subtitle "Kitchen prep", "X / Y ready" with a thin progress bar. All existing tasks and attachments from every project show together — nothing is deleted.
2. **Import list (managers only).** Photos (including iPhone HEIC), PDF, Word, Excel/CSV. The app reads each task's name, dish, allergens and notes. You check, edit, remove or add rows before saving. Imported tasks start in "To do". The file is kept as an attachment.
3. **Add / edit task (managers only).** Task name, dish (with suggestions from dishes already used), allergens (same picker as recipes, shown as small badges; old text like "G,L" still shows as written), notes. The pencil opens the same form.
4. **Attachments with preview.** Tapping a file chip opens a preview: photos full size (zoomable on phones), PDFs inline, Word/Excel with a "Download" button. Managers can remove a file. There's also an "Attach file" button.
5. **Notes on Misa.** A "Notes" section above the columns with "Add note" (managers). Three types: Important (⚠ yellow), Prep, Event, each with a date (today by default). Shows today plus the next 7 days, grouped by day. Today's Prep and Event notes also appear on the Today page.
6. **Confirm before deleting.** Every delete (task, note, file) opens a confirmation with Cancel and a red Delete button, then a "Deleted" message.
7. **Cards and columns.** The dropdown is replaced by one forward arrow (To do → In process → Ready) plus a back arrow for mistakes. Dish filter and task search above the columns. Each column shows 15 cards, then "Show more (N)". On phones: To do / In process / Ready tabs.
8. **Who can do what.** Staff can only move tasks forward or back. Managers add, edit and delete tasks, notes and files. This is **stricter than today**: right now staff can also add, edit and delete Misa tasks and files.

## Database changes (SQL to be applied)
```sql
-- Notes get a type; existing notes become 'note'
ALTER TABLE public.notes ADD COLUMN kind text NOT NULL DEFAULT 'note';
ALTER TABLE public.notes ADD CONSTRAINT notes_kind_check CHECK (kind IN ('note','prep','event'));

-- Tasks get dish and allergens (old details text stays as notes)
ALTER TABLE public.misa_tasks ADD COLUMN dish text NOT NULL DEFAULT '';
ALTER TABLE public.misa_tasks ADD COLUMN allergens text[] NOT NULL DEFAULT '{}';

-- Managers only for adding/editing/deleting Misa tasks, files and projects
-- (existing team-member write policies on misa_projects, misa_tasks,
--  misa_sources and misa-files storage are replaced by has_role(auth.uid(),'admin')
--  versions; team-member read policies stay unchanged)

-- Staff may update tasks, but a trigger only lets non-managers change status
CREATE FUNCTION public.misa_tasks_staff_status_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND
     (NEW.title, NEW.details, NEW.dish, NEW.allergens, NEW.project_id)
     IS DISTINCT FROM (OLD.title, OLD.details, OLD.dish, OLD.allergens, OLD.project_id) THEN
    RAISE EXCEPTION 'Only managers can edit prep tasks';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER misa_tasks_staff_status_only BEFORE UPDATE ON public.misa_tasks
  FOR EACH ROW EXECUTE FUNCTION public.misa_tasks_staff_status_only();
```
Notes already allow writes by managers only, so no policy change is needed there.

## Technical notes
- Project rows stay in the database; new tasks/files go into the oldest existing project (one "Misa" project is created automatically if none exist), so storage folder rules keep working.
- Task query loads all tasks once; filters/search are memoised; moves update the cache optimistically instead of refetching everything.
- New import server function mirrors the recipe import: manager check, AI extraction with dish + allergens from the shared allergen list.
- Tests: staff-only-status rule, forward/back stage moves, note kinds.
- Verification: import a photo, edit rows, save; add task; move through all stages; preview image and PDF; cancel then confirm a delete; add each note type; check a staff view has no add/edit/delete.
