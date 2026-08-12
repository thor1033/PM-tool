"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Timer,
  UserMinus,
} from "lucide-react";
import type { Health, AttentionItem, Severity } from "@/lib/project-health";
import type { Task, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

/* The health strip and the attention list — the two things an overview owes
 * its reader: "are we OK?" and "what needs me?".
 *
 * Status is always an icon plus a written word. Red and amber sit close
 * enough that hue can't be the only channel — under protanopia they're
 * nearly the same colour — so the label carries the meaning and the colour
 * only reinforces it. */

// ── progress meter ──────────────────────────────────────────────────────────

/** Segmented meter: finished and in-flight are fills, the remainder is a
 *  track rather than a third series. A neutral grey at series weight tests
 *  as indistinguishable from the blue, so it stays deliberately recessive. */
function ProgressMeter({ health }: { health: Health }) {
  const { done, inProgress, remaining, total } = health;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const segs = [
    { key: "done", n: done, label: "Done", color: "var(--hue-done)" },
    { key: "prog", n: inProgress, label: "In progress", color: "var(--hue-progress)" },
  ].filter((s) => s.n > 0);

  return (
    <div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--line)]"
        role="img"
        aria-label={`${done} of ${total} tasks done, ${inProgress} in progress, ${remaining} not started`}
      >
        {segs.map((s) => (
          <span
            key={s.key}
            // A 2px surface gap separates fills instead of a border.
            className="h-full first:rounded-l-full"
            style={{
              width: `${pct(s.n)}%`,
              background: s.color,
              marginRight: 2,
            }}
          />
        ))}
      </div>
      <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
        <LegendDot color="var(--hue-done)" label={`${done} done`} />
        <LegendDot color="var(--hue-progress)" label={`${inProgress} in progress`} />
        <LegendDot color="var(--line)" label={`${remaining} not started`} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── stat tile ───────────────────────────────────────────────────────────────

const TONE: Record<Severity | "good" | "neutral", { fg: string; icon: typeof AlertTriangle }> = {
  critical: { fg: "var(--t-red)", icon: AlertTriangle },
  warning: { fg: "var(--t-amber)", icon: Ban },
  info: { fg: "var(--t-blue)", icon: CalendarClock },
  good: { fg: "var(--hue-done)", icon: CheckCircle2 },
  neutral: { fg: "var(--ink-faint)", icon: CircleDashed },
};

function StatTile({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  tone: keyof typeof TONE;
  icon?: typeof AlertTriangle;
  href?: string;
}) {
  const t = TONE[tone];
  const Ico = Icon ?? t.icon;
  const active = tone !== "neutral";
  const body = (
    <>
      <div className="mb-1 flex items-center gap-1.5">
        <Ico className="size-3.5 shrink-0" style={{ color: active ? t.fg : undefined }} />
        <span className="text-muted-foreground text-[11.5px] font-medium">{label}</span>
      </div>
      {/* Proportional figures: tabular-nums loosens a standalone number. */}
      <div
        className="text-[26px] font-semibold leading-none tracking-tight"
        style={{ color: active ? `color-mix(in oklch, ${t.fg} 78%, var(--ink))` : undefined }}
      >
        {value}
      </div>
      <div className="text-muted-foreground mt-1.5 text-[11.5px] leading-snug">{hint}</div>
    </>
  );

  const cls = cn(
    "min-w-0 rounded-[var(--radius-md)] border bg-[var(--panel)] px-3.5 py-3 transition",
    href && "hover:border-[var(--line-strong)] hover:shadow-sm",
  );
  return href ? (
    <Link href={href} className={cls}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function HealthStrip({
  health,
  projectId,
}: {
  health: Health;
  projectId: string;
}) {
  const { pctOnTime, measured, medianSlip, overdue, blocked, dueSoon, total } = health;

  return (
    <section className="bg-card shadow-xs mb-4 rounded-2xl border p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(230px,300px)_1fr]">
        {/* The one hero figure on the page, in sans — a serif face here would
            read as decoration rather than a number. */}
        <div className="lg:border-r lg:pr-5">
          <p className="eyebrow mb-2">Progress</p>
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-[52px] font-semibold leading-none tracking-tight">
              {health.pctDone}
              <span className="text-muted-foreground text-[24px] font-medium">%</span>
            </span>
            <span className="text-muted-foreground text-[12.5px]">
              {health.done} of {total} tasks
            </span>
          </div>
          <ProgressMeter health={health} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Delivered on time"
            value={pctOnTime === null ? "—" : `${pctOnTime}%`}
            hint={
              pctOnTime === null
                ? "No finished task has a planned end to compare against yet"
                : medianSlip > 0
                  ? `${measured} measured · typically ${medianSlip}d late when it slips`
                  : `${measured} measured · nothing has slipped`
            }
            tone={pctOnTime === null ? "neutral" : pctOnTime >= 80 ? "good" : "warning"}
            icon={Timer}
          />
          <StatTile
            label="Overdue"
            value={String(overdue.length)}
            hint={overdue.length ? "Past the planned end and not done" : "Nothing has run past its date"}
            tone={overdue.length ? "critical" : "good"}
            icon={AlertTriangle}
            href={overdue.length ? `/projects/${projectId}/actions` : undefined}
          />
          <StatTile
            label="Blocked"
            value={String(blocked.length)}
            hint={blocked.length ? "Waiting on an unfinished task" : "Nothing is waiting on other work"}
            tone={blocked.length ? "warning" : "good"}
            icon={Ban}
            href={blocked.length ? `/projects/${projectId}/actions` : undefined}
          />
          <StatTile
            label="Due this week"
            value={String(dueSoon.length)}
            hint={dueSoon.length ? "Planned to finish within 7 days" : "Nothing lands in the next 7 days"}
            tone={dueSoon.length ? "info" : "neutral"}
            icon={CalendarClock}
          />
        </div>
      </div>
    </section>
  );
}

// ── attention list ──────────────────────────────────────────────────────────

const SEV_ICON: Record<Severity, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: Ban,
  info: CalendarClock,
};

const SEV_FG: Record<Severity, string> = {
  critical: "var(--t-red)",
  warning: "var(--t-amber)",
  info: "var(--t-blue)",
};

function AttentionRow({
  item,
  trackLabel,
  onOpen,
}: {
  item: AttentionItem;
  trackLabel: string | null;
  onOpen: (t: Task) => void;
}) {
  const Icon = item.label === "Unassigned" ? UserMinus : SEV_ICON[item.severity];
  const fg = SEV_FG[item.severity];

  return (
    <li
      onClick={() => onOpen(item.task)}
      // Fixed first column: the labels differ in width, and letting the chip
      // size itself left every task title starting at a different x.
      className="group grid cursor-pointer grid-cols-[96px_1fr_auto] items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition hover:bg-[var(--paper-2)]"
    >
      {/* Icon + word together: the colour is reinforcement, never the signal. */}
      <span
        className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-semibold"
        style={{
          color: `color-mix(in oklch, ${fg} 72%, var(--ink))`,
          background: `color-mix(in oklch, ${fg} 11%, var(--panel))`,
        }}
      >
        <Icon className="size-3" />
        {item.label}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] font-medium">{item.task.title}</span>
        <span className="text-muted-foreground block truncate text-[11.5px]">
          {item.detail}
        </span>
      </span>
      {trackLabel && (
        <span className="text-muted-foreground shrink-0 text-[11.5px]">{trackLabel}</span>
      )}
    </li>
  );
}

export function AttentionList({
  items,
  categories,
  onOpen,
  limit = 7,
}: {
  items: AttentionItem[];
  categories: Category[];
  onOpen: (t: Task) => void;
  limit?: number;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-2">
        <CheckCircle2 className="size-4 shrink-0 text-[var(--hue-done)]" />
        <p className="text-[13px]">
          Nothing needs attention — nothing overdue, blocked, or due in the next week.
        </p>
      </div>
    );
  }

  const shown = items.slice(0, limit);
  const trackOf = (t: Task) =>
    t.category ? categories.find((c) => c.id === t.category)?.label ?? null : null;

  return (
    <>
      <ul className="-mx-2 flex flex-col">
        {shown.map((item) => (
          <AttentionRow
            key={item.task.id}
            item={item}
            trackLabel={trackOf(item.task)}
            onOpen={onOpen}
          />
        ))}
      </ul>
      {items.length > shown.length && (
        <p className="text-muted-foreground mt-2 px-2 text-[12px]">
          and {items.length - shown.length} more
        </p>
      )}
    </>
  );
}
