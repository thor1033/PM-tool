# Parity Notes — Atlas HTML → PM-tool

Tracks new dependencies, deviations, and phase completion status.

## Taxonomy/naming standardization — "Category" → "Track", "Action" → "Task"
User request: unify vocabulary so the taxonomy grouping is always called a "Track" and work
items are always called "Tasks," never "Actions," everywhere a user reads it. Also rename the
module itself: nav label "Actions & timeline" → **"Tasks"** (picked over the user's first
suggestion, "Task overview," because it read as a near-duplicate of the dashboard's existing
"Overview" nav item — flagged to the user, who confirmed "Tasks").

**Scope — copy only, no data/routing migration:**
- Renamed every *user-visible* string: "Category"/"Categories" → "Track"/"Tracks" and
  "Action(s)" (as a task synonym) → "Task(s)", across `actions.tsx` (header title, "Action
  list" tab, Filter popover eyebrow, Sort-by option, "Edit categories" button), `list-view.tsx`
  (toolbar/inline "Add category"/"Add action" controls, undefined-track bucket, hint text),
  `kanban-view.tsx` (Filter popover eyebrow), `timeline-view.tsx` (empty state, row-label
  header), `card-modal.tsx` ("create a track first" gate, track-required validation error),
  `milestone-modal.tsx` (gate/track field label + validation copy), `taxonomy.tsx`
  (`CategoryRow`/`CategorySection` → `TrackRow`/`TrackSection`, section title, delete-confirm
  copy, page description), `catalogue.tsx` ("Linked tasks", linked-task counts), `dashboard.tsx`
  (empty-state copy, panel link label), and `lib/nav.ts` (nav item label).
- **Deliberately left unchanged** (internal plumbing, not user-facing): the `category` DB
  column/field, `entityConfig.categories` entity name, `/api/projects/[id]/categories` routes,
  the `/projects/[id]/actions` URL slug, and file/folder names (`actions.tsx`,
  `components/modules/actions/*`, `lib/nav.ts`'s `slug: "actions"`). Renaming these would be a
  schema/routing migration, which wasn't what was asked — only the words users actually read.
- Deleted `components/project/categories-modal.tsx`: this file was already documented above as
  retired when "Edit categories" was repointed at the Taxonomy page, but it had never actually
  been removed from disk and nothing imported it. Removed it for real during this pass's sweep,
  since a stale unreferenced file with un-renamed "Category" copy in it would otherwise
  contradict its own file-level rename if ever resurrected.
- Verified: `tsc --noEmit` clean, `next build` succeeds, dev server serves `/projects/[id]/actions`
  and `/projects/[id]/taxonomy` with HTTP 200 and no error markers, dev log has no real errors.

## Actions & timeline — reconciled against the exact functional + design spec
A precise, numbered spec (4-view switcher, header Filter/Sort-by/Edit-categories controls,
specific localStorage key names) arrived after two prior Actions-module sessions. Did a full
audit first — most of the spec (task card, milestone/gate editor, Timeline gantt incl. drag/
resize/baseline/critical-path, Calendar, Kanban's filter+nesting) was already built and
correct, so this pass **only touched the real deltas**, confirmed with the user before
building:

1. **Removed the Milestones/Gates tabs** added in the previous session. This spec is explicit
   about exactly 4 views (List/Kanban/Timeline/Calendar) with gates/milestones living *inside*
   List (gate bars + milestone strip), Timeline (◆/▐ glyphs + guide lines), and Calendar
   (markers) — which they already did. Deleted `milestones-view.tsx`/`gates-view.tsx`; nothing
   else referenced them.
2. **New header `Filter` popover** (`actions.tsx`) replacing the two plain `<Select>` track/
   assignee dropdowns: one purple (`bg-primary/10`) button with a count badge when active,
   opening a popover with two pill groups — "Assigned to" (every member + "Unassigned") and
   "Category" (every track) — both multi-select, with a "Clear" reset. Same `taskMatchesFilter`
   under the hood as before; only the control's presentation changed to match the spec/screenshot.
3. **"Edit categories" now navigates to the existing Taxonomy page** (`/projects/[id]/taxonomy`)
   instead of opening the bespoke `CategoriesModal` dialog from the previous session — the spec
   says this button "opens the taxonomy editor (categories, tags, phases)," which is exactly
   what `TaxonomyModule` already is. Retired `categories-modal.tsx` (deleted; nothing else
   referenced it) since it's now a strict subset of the taxonomy page.
   - **Carried the safety fix over, not dropped**: `TaxonomyModule`'s category delete used to
     be a bare `del.mutate(id)` with no reassignment step — fine before categories were
     mandatory, wrong after. Gave it the same reassign-before-delete flow the retired modal had
     (instant delete if the category has zero tasks; otherwise a "move N tasks to → [picker]"
     step; blocked outright if it's the only category and has tasks). Tags/Phases keep their
     original bare-delete behavior since nothing requires a task to have one.
4. **New header `Sort by` dropdown** (Category | Sequence), shared by List and Timeline per
   spec — replacing List's previous internal 3-way "By track / By date / By dependency" toggle
   from the prior session, which didn't match this spec's simpler 2-option model.
   - **"Sequence" = date then dependency, undated last** (`sequenceTasks` in `lib/tasks.ts`,
     shared by both views so the two never disagree on order): tasks sort by `start` date, then
     a stabilizing pass pulls any predecessor ahead of its dependent if it would otherwise land
     later despite an equal/earlier start date; undated tasks sort last. This replaces both the
     flat date-only sort and the separate dependency-wave grouping from last session — the spec
     asked for one merged concept, not two.
   - **List** in Sequence mode renders a flat table (no track grouping) with a "Depends on"
     column (⛔ open / ✓ done prefixes) and blocked-row tinting — this is now the *only* place
     that table exists (previously duplicated across a "By date" and "By dependency" view).
   - **Timeline** in Sequence mode keeps its track-row grouping (a gantt fundamentally needs a
     Y-position per track) but reorders tasks *within* each track by `sequenceTasks`, and
     reorders the track rows themselves by each track's earliest task date — so the whole
     chart reads top-to-bottom in delivery order instead of category-creation order.
5. **localStorage keys renamed to match the spec exactly**: `atlas.actions.view` →
   `atlas.actions.mode`; added `atlas.actions.sort`; the per-project collapse-state key changed
   from `atlas.actions.collapsed.<id>` to `atlas.actions.expanded.<id>`; added
   `atlas.actions.opensubs.<id>` for the subtask open/closed set, which previously reset on
   every page load (component-local `useState({})`) — it's now a genuine persisted feature per
   spec ("open set persisted, atlas.actions.opensubs").
6. **"Add category" quick-add restored** in List's toolbar (inline name input + Add button)
   alongside the spec's exact hint copy — "Drag actions between categories to re-bucket them ·
   order top-to-bottom = sequence" — which had been dropped when the header "Categories" button
   was added last session.

Everything else — task card (dep editor incl. all 4 dep types + violation banner + conflict
warning, risk linker, comments), milestone/gate editor, Timeline's drag-move/resize/baseline/
critical-path/SVG connectors, Calendar's Monday-first grid, Kanban's search+tag-pills+filter-
popover+nested-subtasks — was already correct against this spec and was **not** touched, per
the instruction to skip anything already in place.

Verified via the dev server: seeded a fresh project (two categories, a member, a violated
task-dependency chain), confirmed both `/actions` and `/taxonomy` render with no server errors,
and re-ran the reassign-then-delete category flow end-to-end through the real API to confirm
moving the safety logic into `TaxonomyModule` didn't regress it — the category was removed and
both its tasks landed in the target category with zero orphans.

## Actions: categories default-expanded, "By dependency" view, Milestones/Gates views
User-requested follow-up on the List view screenshot: categories should stay open unless
explicitly closed, no task should silently disappear into an unlabelled bucket, dependency
order should be its own view, and milestones/gates need dedicated project-wide views (not
just the per-track strip/inline-gate-bar inside List).

- **Categories default expanded** (`list-view.tsx`): flipped `collapsed[g.key] ?? true` →
  `?? false` in both the render check and the toggle handler. A group only collapses once
  the user explicitly closes it — that choice is still persisted to `localStorage`
  (`atlas.actions.collapsed.<projectId>`) exactly as before, so a user's manual collapses
  survive reloads; only the *default* for never-touched groups changed.
- **"Undefined category" replaces "Uncategorised"** — a task with no category is a data
  problem now that categories are mandatory (from the prior session's change), not a normal
  organizational bucket, so it's styled to read that way: dashed red border, "Data problem"
  eyebrow instead of "Track", a warning icon, an explanatory line ("every task should belong
  to one — open each and set a track to clear this"), and no "+" / "Add gate-milestone"
  affordances (it's not a real track to add work into). Per your answer: this bucket is
  **not** hidden and orphaned tasks are **not** silently auto-assigned — it only appears when
  a task genuinely has `category: null`, so it stays visible as something to go fix rather
  than being swept under the rug either way.
- **"By dependency" view** — third List sort mode alongside By track / By date
  (`components/modules/actions/list-view.tsx`, `dependencyWaves`). Tasks are grouped into
  completion "waves": wave 0 ("Ready now") has no unmet task-dependencies; wave 1 becomes
  ready once every wave-0 predecessor is done; and so on — a straightforward topological
  sort over `task`-type deps (a satisfied/`done` predecessor doesn't push the wave). Each row
  shows what it's still waiting on. Circular dependencies are guarded against (treated as
  wave 0 rather than infinite-looping) — an edge case the data model allows even though nothing
  in the UI should normally create one.
- **Dedicated Milestones view** (`components/modules/actions/milestones-view.tsx`) — every
  milestone across the whole project (not just one track's strip), ordered by date, each row
  showing its ◆ glyph, title, note, track chip, and date; past milestones are visually
  muted. "Add milestone" opens `MilestoneModal` pre-set to milestone type.
- **Dedicated Gates view** (`components/modules/actions/gates-view.tsx`) — every gate across
  the project, in the same visual language as the inline gate bar inside List view's track
  groups (red left-border checkpoint card, "GATE" badge, "everything above must pass"
  copy) — but flattened across all tracks instead of interleaved into one track's task rows.
  Overdue gates get a stronger red treatment. "Add gate" opens `MilestoneModal` pre-set to
  gate type.
  - `MilestoneModal` gained a `defaultType` prop (`"milestone" | "gate"`) so these two
    entry points open in the right mode instead of always defaulting to milestone — this
    didn't exist before since every prior entry point was already track-scoped.
- **View switcher** grew from List/Timeline/Calendar/Kanban to include Milestones and Gates
  (6 total). The track/assignee filter bar only shows for the three task-oriented views
  (List/Timeline/Calendar) — Milestones, Gates, and Kanban each have their own scope/filters
  and don't share that bar. The header's "Add task" button is similarly scoped to the three
  task views; Milestones/Gates get their own "Add milestone"/"Add gate" buttons instead.
- Verified via the dev server against a fresh fixture project: one real category with a
  two-task dependency chain, a milestone, a gate, and one deliberately uncategorized task —
  confirmed the working set shape is exactly what each new view's logic expects (undefined-
  category bucket populated correctly, dependency chain forms two waves, milestone/gate both
  attached to the category). Page renders with no server errors.

## Actions: dedicated "Categories" management dialog
Added `components/project/categories-modal.tsx` and a "Categories" button in
`ActionsModule`'s header (visible on every view — List/Timeline/Calendar/Kanban), so
categories no longer need a page navigation to Taxonomy or List view's inline controls to
manage.

- **Add / rename / recolor**: same pattern as `TaxSection` in `taxonomy.tsx` (inline `Input`
  with on-blur save, `ACCENTS` color-dot picker) — one more place using the existing
  entity-hook conventions, not a new one.
- **Delete requires reassignment**, per the mandatory-category rule from the previous
  session: deleting a category with zero tasks is instant; deleting one with tasks shows an
  inline "N tasks will move to → [dropdown of other categories]" step before it's allowed.
  If it's the *only* category and has tasks, deletion is blocked outright with an explanatory
  message (create another category first) — there's nowhere valid to reassign to.
  Reassignment PATCHes every affected task's `category` before the category DELETE fires, so
  no task is ever left orphaned mid-operation.
- **`list-view.tsx` simplified to match**: removed its own `addTrack`/`removeTrack` (which
  used to uncategorise-on-delete, a behavior that's now wrong under the mandatory-category
  rule) and the per-group trash-icon button and "Add category" quick-link — those are
  superseded by the new modal, which is the one place category deletion happens correctly.
  Kept the inline double-click-to-rename on group headers (renaming never orphans a task, so
  it's still safe as a fast path).
- **Found and left alone, flagged**: the seeded "Intranet Refresh" and "Helios Platform
  Modernisation" projects (`scripts/seed-projects.json`) have tasks referencing category ids
  (`ct_plat`, `ct_enable`, etc.) that don't exist as actual category rows — a pre-existing
  data-integrity gap in the fixture data, not something introduced by this change. The UI
  degrades safely (those tasks fall into the "Uncategorised" display bucket, page still
  renders, confirmed via a live request), but it means new task creation on those two
  projects will need a real category selected since none of their in-use category ids
  resolve to actual rows. Not fixed here since editing seed fixtures wasn't asked for and
  the app-level behavior is already correct.
- Verified end-to-end via the dev server: created a fresh project, added two categories,
  created two tasks in one, reassigned + deleted that category via the exact API calls the
  modal makes, and confirmed both tasks landed in the surviving category with zero orphans.

## Actions: category made mandatory; Sequence merged into List as a date sort
User-requested change, post-Module-3: categories (tracks) are now required on every task,
and the standalone Sequence view was folded into List as a sort toggle rather than a
dependency-ordered view.

- **Category is now mandatory.** `components/project/card-modal.tsx`:
  - The Track `Select` no longer offers "No track" — it's a required field (marked with a
    red `*`), defaulting to `defaultCategoryId` → the project's first category.
  - `save()` refuses to submit with `category === "none"` (toast: "Every task needs a
    category.") — a client-side guard, since `tasks.category` is still a nullable DB column
    (existing/imported rows can be uncategorised; new ones can't).
  - **New-project gate**: if a project has zero categories and the user opens `CardModal` to
    create a task, the dialog shows `CreateCategoryPrompt` instead of the task form — a name
    + 8-hue color picker that creates the category, then falls through to the normal form
    with it pre-selected. This is the single choke point for the rule: every "add task"
    action in every view (List's per-track "+"/"Add action", the header "Add task" button,
    Kanban's per-column "Add task") opens `CardModal`, so the gate can't be bypassed.
  - `list-view.tsx`'s two remaining direct-create paths (`addTask` for a track's quick-add,
    `addSubtask`) were re-examined: `addTask` was **removed** — it used to instant-create
    with `category: null` for the Uncategorised/Communications/Change-management groups,
    which is no longer valid, so those "+"/"Add action" affordances now only render for real
    track groups and route through `onEdit(null, g.key)` → `CardModal` (always a valid
    category). `addSubtask` was left as an instant `useCreateEntity` call since a subtask
    always inherits its parent's (already-valid) category — no gate needed there.
  - Drag-and-drop in List view: dropping a task onto the "Uncategorised" group is now a
    no-op (there's no valid category to assign). Dropping onto the Communications/Change-
    management groups no longer nulls out the task's category — it only changes `origin`,
    since those groups key off origin, not category, and a task keeps its (mandatory)
    category when it gets tagged as comms/change work.
  - "Uncategorised" **still renders** in List view (for legacy rows that predate this rule,
    or anything that arrives via JSON import with no category) — it's now read-only: no
    "+" button, not a valid drop target. This surfaces orphaned data instead of hiding it,
    without letting new orphans get created.
- **Sequence merged into List.** Deleted `components/modules/actions/sequence-view.tsx` and
  its tab. List view (`list-view.tsx`) gained a "By track / By date" segmented toggle
  (persisted per-project to `localStorage`, same pattern as the collapse-state). "By date" is
  a flat, ungrouped table sorted by `start || end` (undated tasks sort last) — a literal
  date sort, not the dependency-topological-sort the old Sequence view did. The "Depends on"
  column and the topological-ordering logic (`sequenceTasks`, Kahn's-algorithm-over-deps)
  were dropped entirely rather than kept as a hidden third mode — the request was for a
  simpler view, not an additional one.
  - `ActionsModule`'s view switcher is now List · Timeline · Calendar · Kanban (four, not
    five) — `lib` types (`ActionsView` in `shared.ts`) and the header description updated
    to match.
- Verified via the dev server + real API against a freshly created project with zero
  categories (confirms the gate fires) and the existing seeded project with categories
  (confirms nothing regressed) — both render with no server errors.

## Module 3 (Product Catalogue) — full rebuild
Rebuilt `components/modules/catalogue.tsx` against the spec: type-colored deliverable
grid, a drag-drop/upload/link-from-drive add flow, a richer product modal, and bidirectional
task↔deliverable linking.

- **File types**: replaced the old free-text `TYPES` list (`pdf/excel/image/doc/link/other`)
  with the spec's exact 5 (`doc/pdf/excel/slides/image`), each with its spec'd thumbnail
  color (image=pink, pdf=red, excel=green, slides=amber, doc=blue) via the existing
  `lib/colors.ts` accent system. No migration needed — `products.type` was always a free-text
  column; old values (none existed in seed data) fall back to the `doc` thumbnail.
  `inferType(url)` guesses a type from the URL's extension when a link is pasted, so the
  picker defaults to something sensible instead of always landing on "doc".
- **Two ways to add**, per spec: a drag-drop zone accepts a dropped file (or "Choose file")
  and seeds the deliverable's name from the filename, then hands off into the same
  "Link from drive" form — since local upload has no backing store yet (see the standing
  scoping decision below), the file's bytes are never read, only its name. "Link from drive"
  is a plain name+URL form, fully functional.
  - **Deviation, reconfirmed from the earlier scoping decision**: local file storage
    (≤30MB, stored blob) is **not implemented** — this repo has no S3/Vercel-Blob wiring and
    Postgres/JSONB is a poor fit for file bytes at that size. The drop zone and "Choose
    file" button are real UI (they accept a file and pre-fill the name) but do not persist
    file contents; the user still supplies the actual drive link. Copy in the empty-state
    and drop zone says this explicitly rather than pretending upload works. Flagged as a
    follow-up needing a permissive-OSS blob provider if local upload becomes a hard
    requirement.
- **Grid cards**: type-colored thumbnail icon, name, type chip, a "Drive" chip when a URL is
  set, "N linked actions" count, note preview. Click → product modal. Empty state when none.
- **Product modal**: type icon + editable name, type, phase, date, notes; an editable URL row
  with an "Open" button; a linked-actions picker (add/remove) and delete.
  - **No local-file preview/download**, consistent with the links-only scoping above — there
    is nothing stored to preview. If/when blob storage is added, this is the natural place
    for an inline image preview and a download button for local files.
- **Bidirectional linking, fixed to be genuinely bidirectional**: `product.taskIds` (the
  catalogue's fast reverse-index, read directly by the grid/modal) and `task.deps` entries of
  `type: "deliverable"` (read by `resolveDep`/the Timeline/List views) now stay in sync from
  **both** directions — linking/unlinking from the catalogue's "Linked actions" picker writes
  both sides, and linking/unlinking a deliverable dependency from `CardModal`'s `DepEditor`
  (built in the Module 1/2 pass) now also writes `product.taskIds` reciprocally via a new
  `useUpdateEntity(projectId, "products")` call inside `DepEditor`. Before this fix, adding a
  deliverable dependency from the task side would not have updated the catalogue's linked-
  action count — caught and fixed during this module's build, not left as a known gap.

## Module 1 (Actions & Timeline) + Module 2 (Kanban) — full functional rebuild
Second, larger rebuild of the Actions area against a detailed functional handoff (shared
domain model: tasks/categories/milestones-gates/externals/deliverables, a 4-type dependency
model with `blocked`/`violated` resolution, and per-view behavioural specs for List/
Sequence/Timeline/Calendar/Kanban). This superseded the previous "visual restyle" pass —
same visual system, substantially more real functionality.

**Schema changes** (migrations `0003_dry_dark_phoenix`, `0004_hesitant_marten_broadcloak`):
- New `externals` table (registered external inputs: title/party/owner/due/status/note),
  wired into `lib/entities.ts`, `lib/types.ts` (`WorkingSet.externals`), `getWorkingSet`,
  and the Atlas JSON importer (`lib/import/atlas.ts`) — with RLS `tenant_isolation` policy
  applied the same way as every other entity table (see migration file; `activity` is the
  only table that intentionally skips this, since it's append-only via its own route, not
  the generic entity route).
- `TaskDep.type` extended from `"task" | "external"` to `"task" | "deliverable" | "ext" |
  "external"` — `deliverable` refs a `products` row, `ext` refs a registered `externals` row,
  `external` stays the free-text fallback.
- `tasks.origin` column added (`text`, nullable) — needed for the List view's pinned
  "Communications"/"Change management" synthetic groups, which key off task origin, not
  category. Didn't exist anywhere in the schema before this.

**New shared modules:**
- `lib/tasks.ts` — the single source of truth for `resolveDep` (blocked = referenced
  thing isn't done/received; violated/"dependency block" = blocked AND the dependent's
  start is before the predecessor's end/due), `assigneesOf`, `taskMatchesFilter`,
  `wouldConflict`, `COLUMNS`/`PRIO` constants, date/initials helpers. Used by every view in
  both modules so the block rule is defined exactly once.
- `components/project/card-modal.tsx` — the rich shared task editor (status segmented
  control, priority/track/dates/assignees, a 4-type dependency editor with a live
  "Dependency block" banner, a risk linker writing `risk.taskIds` bidirectionally, optional
  phase/tags, custom-fields readout, comment thread). Opened from every List/Sequence/
  Timeline/Calendar/Kanban row or card — one editor, one behavior, everywhere.
- `components/project/milestone-modal.tsx` — shared milestone/gate editor (type toggle,
  date, category — required for gates, with the same copy as the spec: "a gate validates a
  category's work"), note, delete.

**`components/modules/actions/` (new subdirectory — the only module large enough to
warrant splitting into files; every other module stays a single flat file per the
existing convention):**
- `list-view.tsx` — tracks as collapsible groups (default collapsed, collapse-state
  persisted to `localStorage` per project), pinned Communications/Change-management groups
  last, milestone strip pinned at the top of each group, gates interleaved into the task
  rows by date (rendered as a full-width "GATE · Checkpoint · everything above must pass"
  bar), inline track rename (double-click), track delete with an uncategorise-not-delete
  confirm, subtask expand/collapse with done/total count, native HTML5 drag-and-drop
  (reorder via `position`, cross-group drop re-buckets category/origin).
- `sequence-view.tsx` — flat table, topologically ordered by dependency then date (Kahn's
  algorithm over `task`-type deps, date as the tiebreak/fallback), "Depends on" column with
  ⛔/✓ prefixes, blocked-row tinting.
- `timeline-view.tsx` — the gantt. Absolutely-positioned bars + one SVG connector overlay
  (no gantt library, per the licensing constraint), S-curve connectors colored by the
  predecessor's track, red + thicker when violated, hover tooltip with the exact reference
  copy ("⚠ Dependency block — X starts <date> but "Y" isn't finished until <date> · double-
  click to inspect"), double-click opens the dependent's `CardModal`. Drag-to-move and
  drag-to-resize via pointer events (no library), committed on pointerup via
  `useUpdateEntity`. Gate (▐) / milestone (◆) glyphs in the header + guide lines through
  rows, both clickable to `MilestoneModal`. "Set baseline"/"Update"/"Clear" persists a
  `{at, bars}` snapshot to `project.settings.timelineBaseline` (no schema column needed —
  `settings` JSONB already exists for exactly this kind of per-project UI state) and renders
  a ghost bar under each task. "Critical path" toggle highlights the longest task→task
  dependency chain (same longest-path-over-DAG approach as the reference).
- `calendar-view.tsx` — Monday-first 6-week grid, tasks chipped on their end date
  (track-colored, red if overdue), milestone/gate markers, today highlight, prev/next/Today.
- `kanban-view.tsx` — search (title+desc+assignees) + tag pills (AND-together) + a filter
  popover (assignee incl. "Unassigned" / phase / category, all AND'd), three status columns,
  cards with a priority-tinted left border, avatar-stack footer, comment-count row. Subtasks
  render nested inside their parent card (inline checkbox toggling done/backlog, struck-
  through name, assignee initials) and are filtered out of the top level whenever their
  parent is visible in the same filtered set — never floating as their own card.
- `shared.ts` — the `ActionsView` type and localStorage key names shared across files.

**View switcher**: List · Sequence · Timeline · Calendar · Kanban as one segmented control;
the choice persists to `localStorage` (`atlas.actions.view`) and restores on reload, per
spec. Kanban intentionally stayed a *view inside* Actions rather than a separate nav tab —
the repo already redirects the legacy `board` slug to `ActionsModule`, so this keeps that
precedent instead of adding nav surface for something the spec said could go either way.
The assigned-to/track filter bar is shared across List/Sequence/Timeline/Calendar (Kanban
keeps its own richer filter bar per the spec); **dependency resolution always reads the full
unfiltered task/product/external lists**, so a block still resolves correctly even when the
current view is filtered down to a subset — filtering only changes what's rendered.

## Deviations / scoped-down from the functional handoff (flagged, not silently dropped)
- **Catalogue file uploads**: per an explicit scoping decision, Module 3 (not yet built as
  of this entry) will ship "Link from drive" only — no local blob storage. This repo has no
  S3/Vercel-Blob wiring today and Postgres/JSONB is a poor place for file bytes at the
  spec'd 30MB ceiling. Flagged as a follow-up needing a permissive-OSS blob provider
  (e.g. `@vercel/blob`) added as a new dependency if local upload becomes a real requirement.
- Everything else in the functional handoff (dependency model, List/Sequence/Timeline/
  Calendar/Kanban behavior, baseline, critical path) was built in full — no other cuts.

## Actions & timeline — full rebuild to Atlas visual + dependency spec
Rebuilt `components/modules/actions.tsx` against `reference-html/bundle.jsx` (`function
Kanban`, `function Timeline`, `function CalendarView`, `resolveDep`) and `components.css`
(`.kcard`/`.kcol`/`.gantt-*`), following a functional handoff prompt covering dependency
visualization and Kanban design in detail.

- **Dependency editor added** — the task dialog previously had no way to create/inspect
  `task.deps` at all. Added `DepEditor`: an "Add" popover listing other tasks (with a ⚠ if
  adding them would immediately conflict — dependent starts before the candidate predecessor
  ends) plus a form for external dependencies (label + optional owner/scope). Existing deps
  render as removable chips, red-bordered when in a "dependency block" state.
- **`resolveDep` ported**, scoped to this repo's `TaskDep` shape (`type: "task" | "external"`
  — no `deliverable`/`ext`-register types, since this repo has no products-as-deps or an
  externals register the way the prototype does). A dep is "blocked" if it points to a
  non-done task; "violated" (dependency block) if the dependent's start date is before the
  predecessor's end date and the predecessor isn't done yet — same rule as the reference.
- **Filters**: added status + priority filters and a text search alongside the existing
  track/assignee filters (search matches title, description, assignees — mirrors the
  prototype's Kanban search). All five apply identically across all four views, per spec.
  Also added an explicit "Unassigned" option to the assignee filter (`__unassigned` token,
  matching `taskMatchesFilter` in the reference).
- **Kanban**: cards rebuilt on the reference's exact visual grammar — left border colored by
  priority (`--prio` custom property, 3px), avatar-stack footer, subtasks nested *inside*
  the parent card (never as separate top-level cards — filtered out of column `items` the
  same way `Kanban()`'s `visibleIds` check does it), a small ⚠ badge when the card has an
  unmet dependency block, comment-count footer. Drag-and-drop unchanged (native HTML5 DnD,
  optimistic status PATCH) but column chrome (dot + serif title + mono count) now matches
  `.kcol-hd`.
- **Timeline (gantt)**: kept the existing absolutely-positioned-divs + one SVG overlay
  architecture (no gantt library, per the licensing/complexity constraint) but reworked the
  visuals: bars now use `color-mix(in oklch, <track-color> 88%, white)` per `.gantt-bar`
  instead of flat Tailwind bg classes; S-curve dependency connector math is unchanged
  (`taskLayout`/`depLines`) but color/opacity now follow the reference exactly — quiet
  track-colored line at 0.85 opacity normally, solid red at 0.95 opacity + thicker stroke
  when `violated`; double-click any connector (red or not) opens the dependent task's dialog,
  where the block is now visible and fixable via `DepEditor`. Added external-dependency
  inbound markers (small indigo dot at the dependent bar's start) — the reference draws these
  differently (tied to an externals register this repo doesn't have) so this is an
  equivalent, not a port. Added a legend row (in-progress / done / milestone / gate /
  external dep / dependency-block) per spec.
  - **Deviation**: did not port the reference's drag-to-resize/move gantt bars
    (`onBarDown`/`onMove`/`onUp` pointer-drag), critical-path highlighting, or baseline
    snapshot/compare features — none of those were asked for in the functional handoff
    (which scoped Timeline to: axis, today line, bars, dependency connectors + blocked
    state, gates/milestones, legend). Flagging in case that's expected next.
- **Table**: mono-uppercase column heads, status-dot + priority-pip inline (matches the rest
  of the Atlas system rather than the old colored-badge style), a ⚠ inline on any row whose
  task has a dependency block.
- **Calendar**: unchanged structure, retoned to Atlas tokens (mono day headers, serif month
  label, today = primary-filled circle, overdue tasks get a red chip instead of track color).
- Kept the existing entity-hook wiring (`useCreateEntity`/`useUpdateEntity`/`useDeleteEntity`)
  and comments/optional-fields work from P6 — this was a visual + dependency-feature rebuild,
  not a data-layer change. No new dependencies added.

## Visual design system — Atlas parity restyle
Applied `design_handoff_atlas_parity/DESIGN-SPEC.md` (note: this file only exists in the
`Documents\design_handoff_atlas_parity` copy of the handover packet, not the `Skrivebord`
one — use the Documents copy as source of truth going forward).

- **Fonts** (`app/layout.tsx`): swapped Geist/Geist Mono for `next/font/google` `Newsreader`
  (→ `--font-serif`), `Hanken Grotesk` (→ `--font-sans`), `Spline Sans Mono` (→ `--font-mono`).
- **Theme tokens** (`app/globals.css`): replaced the generic radix-nova neutral palette with
  the Atlas token set verbatim from `reference-html/styles.css` (`--paper*`, `--ink*`,
  `--line*`, `--t-*` 8-hue palette, `--sh-*` shadows), both `:root` and a new hand-authored
  `.dark` block (the prototype has no dark mode — dark values are extrapolated to preserve
  the same hue/contrast relationships). `--radius` set to `0.6rem` per spec §2.
  - **Token naming collision**: the spec's raw purple accent is `--accent` in the prototype,
    but shadcn already owns `--accent`/`--accent-foreground` for a *muted highlight* role
    (distinct from `--primary`). Kept the raw purple under a new name, `--accent-c`, and
    mapped shadcn's `--primary` → `--accent-c` per spec §2 ("map this onto shadcn's
    `--primary`"); shadcn's own `--accent` now points at `--accent-soft`/`--accent-deep`,
    which is a reasonable semantic fit and keeps existing shadcn components (which read
    `--accent` for hover/muted states) on-palette.
  - Added `.eyebrow` and `.font-serif-display` utilities in `@layer utilities` for the
    mono-uppercase-label and serif-display type primitives (spec §1, §3).
- **`lib/colors.ts`**: the repo's existing 8 accent names (blue/indigo/teal/green/amber/red/
  pink/purple) already matched the spec's 8 track hues 1:1, so no renaming was needed — only
  the class values changed, from generic Tailwind color steps (`bg-blue-500` etc, with
  separate hardcoded `dark:` variants) to Tailwind v4 arbitrary values reading the `--t-*`
  CSS vars directly (`bg-[var(--t-blue)]`, `color-mix(in oklch, var(--t-blue) 14%, var(--panel))`
  for `.soft`). Since `--panel`/`--ink` already flip between `:root`/`.dark`, this removes
  the need for hardcoded dark-mode class pairs — one value, both themes. Added `accentVar()`
  for inline-style use (SVG strokes, chart bars) alongside the existing class-returning `accent()`.
- **`components/project/ui.tsx`**: `ModuleHeader` gained an optional `eyebrow` prop, switched
  the title to `.font-serif-display`, added a bottom border under the header block (spec §4
  "thin `--line` bottom border"). `SectionCard` title switched to the `.card-hd` weight/size
  (13px/700) and card radius bumped to match `--r-lg` (`rounded-2xl`).
- **`app/(app)/layout.tsx`**: top bar brand mark restyled to the `--ink`-filled rounded-square
  logo mark + serif wordmark from spec §4/`components.css` `.brand-mark`/`.brand-name`.
- **`components/project/project-shell.tsx`**: sidebar nav restyled per spec §4 — active item
  is now a filled `--ink`/`--paper` pill (was a tinted `bg-primary/10` chip); group labels
  switched to `.eyebrow` styling; favourites star adapts contrast when sitting on the active
  filled pill.
- **`components/modules/dashboard.tsx`**: full rebuild of the front page to match
  `reference-html/bundle.jsx` `function Dashboard` + `components.css` `.dash-*`/`.up-*`:
  serif hero title + serif lead paragraph + primary/secondary CTA row, a **View box** (project
  view / per-person view switcher), an accent-bordered **"Update the plan" command bar**
  (deep-links into the existing `PlanModule` via the same `sessionStorage` draft-handoff key
  the old dashboard used), an **"Upcoming — the road ahead"** mini-gantt (month ticks, today
  line, task bars, gate/milestone glyphs tied to their nearest same-track task row), two-column
  **"In progress now" / "Top risks"** panels (project view groups active tasks by assignee;
  personal view groups by status), and a **"Dependencies & blockers"** card grid.
  - **Deviation**: the prototype's `resolveDep`/`remediation`/`externals` helpers don't exist
    in this repo's data model (no `externals` list, no remediation-tracking on risks) — the
    dependency-status and risk-score logic here is a from-scratch equivalent built on the
    repo's actual `Task.deps`/`Risk` shape (blocked = predecessor task not done; external =
    `dep.type === "external"`), not a port of those functions.
  - Milestone gate/milestone glyphs are ported (`▐` gate, `◆` milestone) with the same
    nearest-same-category task association as the prototype.
  - The "task peek" opened by clicking a road-ahead/risk/dependency row is a minimal read-only
    dialog (title + description), not the full `CardModal` from the prototype — wiring the
    dashboard's click-through into the repo's real `TaskDialog` (in `actions.tsx`, which is
    edit-capable and entity-hook-wired) is a reasonable follow-up but out of scope for a
    visual-parity pass.

## New dependencies

| Package | Version | License | Added in | Reason |
|---------|---------|---------|----------|--------|
| `date-fns` | latest | MIT | P2 | Calendar month math (eachDayOfInterval, startOfWeek, etc.) |

## Phase log

### P0 — Schema & scaffolding ✅
- Added `parentId`, `comments`, `custom` to `tasks` table
- Added `capacityHours`, `availability` to `members` table
- Added `financials`, `forecast`, `startup`, `settings` JSONB columns to `projects`
- Added `activity` table (audit trail, append-only, dedicated route in P5)
- Added `TaskComment`, `Activity` types; extended `WorkingSet` with `activity`
- Migration: `drizzle/0002_sharp_ultimates.sql` — applied

### P1 — AI "Update plan from chat" engine ✅
- Server route: `app/api/projects/[id]/plan/route.ts`
  - Keyword-gated context digest (token-lean)
  - Full op-catalog prompt (verbatim from AI-OP-CATALOG.md)
  - Normalize: resolves T#/R# refs, drops invalid ops, adds display fields
  - Cascade-annotate: 12 cascade rules from prototype
- Client module: `components/modules/plan.tsx`
  - 40+ op types dispatched through existing entity hooks
  - Grouped review UI: quote highlight, checkbox per op, cascade badge (amber ⚡)
  - `answer` ops render as read-only info bubbles
  - Apply loop: top-to-bottom, toast on completion
- Dashboard launcher: compact prompt box on `dashboard.tsx` → deep-links to plan tab
- Nav: `plan` slug added to `PROJECT_NAV`
- shadcn added: `alert`, `hover-card`
- Deviation: audit log (POST to `/audit` after each applied op) deferred to P5 when the audit route exists; `muteAudit` equivalent not needed since we don't have a generic differ yet

### P6 — Cross-cutting polish ✅
- **Task comments** — `components/modules/actions.tsx`
  - `TaskDialog` now has a comment thread (author avatar initials, text, relative timestamp) writing to `task.comments` via `useUpdateEntity`
  - Author picked from `ws.members`; Enter posts, Shift+Enter newline
  - Comment counts shown on Kanban cards (already present) and now on table rows (new column)
- **Members = source of truth** — `lib/api/hooks.ts` + `components/modules/capacity.tsx`
  - `useDeleteMember(projectId)`: optimistically drops the member and strips their name from every `task.assignees`, then PATCHes each affected task server-side
  - `useUpdateMember(projectId)`: on rename, propagates the new name through all `task.assignees` (optimistic + server cascade)
  - Capacity module gained a "Team members" card: add / inline-rename / delete with the cascade wired in
- **Sidebar nav groups** — `lib/nav.ts` + `components/project/project-shell.tsx`
  - `NavItem` gained an optional `group` field (`overview` | `strategy` | `delivery`); ungrouped items (dashboard/workspace/actions) stay always-visible at the top
  - Groups render as shadcn `Collapsible`, default collapsed; the group containing the active slug opens on mount
  - Favourites: star button per grouped item, persisted to `project.settings.navFavs`, rendered in a "Pinned" block above the groups
- **Glossary tooltips** — `components/project/glossary-text.tsx` (new)
  - `<GlossaryText text={…} terms={…} />` splits body text on a case-insensitive alternation of glossary terms (longest-first) and wraps matches in a shadcn `HoverCard` showing term + definition
  - Wired into every read-only body-text surface: Risks (mitigation), Pre-analysis (finding summary), Catalogue (product note), Stakeholders (responsibility), Workspace (task description)
  - Deliberately **not** applied to headings/titles, per PORT-SPEC ("everywhere except titles")
  - Business case and Scope have no read-only body text — they are all-`Textarea`/`Input` editors, so there is nothing to wrap there
- **Optional per-task fields** — `TaskDialog` has a "Optional:" chip row toggling Phase and Tags sections; they default on when the task already has a value

### P5 — Audit trail + Workspace ✅
- **`app/api/projects/[id]/audit/route.ts`** — new route
  - GET: returns all activity entries for the last 5 weeks (pruning older rows on each fetch)
  - POST: appends `{ kind, text, actor, key }` with server-side coalescing — if an entry with same text and actor within 5 min exists, updates ts instead of inserting
  - Both endpoints: `requireApiAuth()` + `withTenant`
- **`lib/api/hooks.ts`** — added `useAudit`, `useLogActivity`
  - `useAudit(projectId)`: query with 60s refetch interval
  - `useLogActivity(projectId)`: returns `log(text, opts?)` with client-side coalescing (same key within 5-min window is dropped)
- **`components/modules/plan.tsx`** — wired `useLogActivity`; apply loop logs one `kind:"import"` entry per apply batch
- **`components/modules/audit.tsx`** → `AuditModule`
  - Entries grouped by day (Today / Yesterday / formatted date)
  - Filter box (text search); kind badges (Edit / Plan update / Automation / Reminder) with per-kind icons
- **`components/modules/workspace.tsx`** → `WorkspaceModule`
  - Person picker (all members + Everyone view), person avatar displayed when selected
  - Left panel: tasks grouped by status (In progress / To do / Done) with overdue flag, badge chips for deps/deliverables/risks/comments counts
  - Right panel (task hub): header with status quick-change, assignee chips, track/phase/priority badges; subtasks card; depends-on card (blocked/waiting/ready tags); deliverables card with external link; risks-mitigated card with score; pre-analysis insights; gate ahead
- Nav: added `workspace` (after Overview), `audit` (before plan)
- Deviation: full `auditDiff` diff engine (watching every entity list) not implemented — entries are written explicitly from the plan apply loop. Module-level save handlers can call `useLogActivity` to add more coverage in P6.

### P4 — Strategy + Feature suite ✅
- **`components/modules/strategy.tsx`** → `StrategyModule`
  - 7-tab layout: Mission/Vision/Values · Value Prop Canvas · BMC · Lean Canvas · Personas · Market & Competition · Go-to-Market
  - All tabs read/write `project.startup` JSONB via `useStartup` hook → `useUpdateProject`
  - `StrList`: inline bullet-list editor (Enter = new item, Backspace on empty = delete, × to remove)
  - `AutoTextarea`: ref-based auto-grow textarea (height auto on every value change)
  - BMC: 9 blocks in explicit CSS grid (5-col × 3-row) with per-block list/notes mode toggle; list mode = StrList, notes mode = AutoTextarea
  - Lean Canvas: same grid structure, all blocks as StrList
  - Value Prop Canvas: two-column per segment (Their world / How we answer it), each with 3 lists; add/remove segments
  - Personas: card grid with goals/pains/notes per persona
  - Market: TAM/SAM/SOM boxes + positioning statement + competitor table
  - GTM: sales motion + channels + pricing tiers grid + launch plan
- **`components/modules/features.tsx`** → `FeaturesModule`
  - Library tab: collapsible groups, each with FeatureCards; each card shows name/desc + outcome chip-tags + expandable How/What/Audience fields
  - Packages tab: bundle cards with inline feature picker Dialog (search + select from library); features shown in order with X to remove
  - Both tabs write to `project.startup.features` via `useUpdateProject`
- Nav: added `strategy`, `features` slugs
- shadcn added: none new (collapsible was already added in P2)
- Deviation: GTM pricing tiers added to match prototype (PORT-SPEC only listed `launch`; prototype had `pricing` too — kept both)

### P3 — Capacity · Financials · Forecast ✅
- **`components/modules/capacity.tsx`** → `CapacityModule`
  - Per-member load computed from task overlap with each forward week (load in hours vs `capacityHours`)
  - Heatmap table (green/amber/red) + per-member bar chart cards; overload shown in red
  - Tasks without dates excluded from load calc; tasks assigned to multiple people split hours equally
- **`components/modules/financials.tsx`** → `FinancialsModule`
  - Contract card (title, party, value, signed/start/end, notes, currency picker) — editable, saved via `useUpdateProject`
  - Budget line table (add/edit/remove lines) — saved to `financials.budget`
  - Budget-vs-progress chart: work-complete bar + time-elapsed bar + budget breakdown bars (div bars, no lib, overflow-hidden containers)
  - On-track verdict: work% ≥ time% (−10% tolerance) → TrendingUp green / TrendingDown red
- **`components/modules/forecast.tsx`** → `ForecastModule`
  - Buffer % slider (0–50%) saves to `forecast.bufferPct`; buffer in working days shown
  - Timeline bar: done (green) / remaining (blue) / buffer zone (amber) with today line
  - Per-task delay table: working-day input → preview new end → Apply shifts task + BFS downstream tasks
- Nav: added `capacity`, `financials`, `forecast` slugs
- shadcn added: `slider`

### P2 — Actions view ✅
- New `components/modules/actions.tsx` → `ActionsModule`
  - **Table view**: tasks grouped by track (collapsible, default collapsed), subtask expand/collapse, inline add/edit/delete, priority + status badges
  - **Kanban view**: three columns (Backlog / In progress / Done), drag-and-drop between columns via native HTML5 drag, subtask preview inside cards
  - **Timeline (gantt)**: horizontal bars per task positioned by start→end over a date axis; S-curve dependency connectors coloured by source track; connector turns red when successor starts before predecessor ends (violated); double-click connector or bar opens task dialog; month labels + today line + milestone diamonds
  - **Calendar view**: month grid with `date-fns` (eachDayOfInterval); tasks appear on their end date; prev/next month navigation
  - **Filters**: "Assigned to" + "Category (track)" apply across all four views
  - `TaskDialog`: shared create/edit modal used by all four views
- Nav: replaced `board` slug with `actions` ("Actions & timeline"); `board` slug kept as alias in module-view for any stored URLs
- `BoardModule` retained in codebase (not deleted); no existing modules touched

## Deviations from PORT-SPEC
- P1: Audit log entries per applied op are written in P5 (when `useLogActivity` hook exists). The apply loop is ready to call it — just needs the hook added.
