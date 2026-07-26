import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { devAuthEnabled } from "@/lib/auth/dev";
import { Button } from "@/components/ui/button";
import { Layers, KanbanSquare, ShieldCheck, Sparkles } from "lucide-react";

const FEATURES = [
  {
    icon: KanbanSquare,
    title: "Delivery, end to end",
    body: "Kanban, milestones, dependencies, business cases, risks, stakeholders, org charts and change plans — one workspace per engagement.",
  },
  {
    icon: Sparkles,
    title: "AI-native setup",
    body: "Describe the engagement and Claude drafts the business case, plan, stakeholders and risk register for you to refine.",
  },
  {
    icon: ShieldCheck,
    title: "Enterprise from day one",
    body: "WorkOS SSO, per-tenant Postgres isolation with row-level security, and audit-ready foundations.",
  },
];

export default async function Home() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/projects");

  const dev = devAuthEnabled();
  // Single-user Google login: there's no self-serve sign-up, so every CTA goes
  // through the same AuthKit → Google flow.
  const signInUrl = dev ? "/dev-login" : "/sign-in";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <Layers className="text-primary size-5" />
          <span>Atlas</span>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href={signInUrl} prefetch={false}>Sign in with Google</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16">
        <div className="max-w-2xl">
          <span className="bg-primary/10 text-primary inline-flex rounded-full px-3 py-1 text-xs font-medium">
            The AI-native project delivery hub
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Run every client engagement from one intelligent workspace.
          </h1>
          <p className="text-muted-foreground mt-5 text-lg text-pretty">
            Atlas turns scattered project artefacts into a single source of truth
            — planned, tracked and drafted with Claude, secured for enterprise.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={signInUrl} prefetch={false}>Sign in with Google</Link>
            </Button>
          </div>
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border p-5">
              <f.icon className="text-primary size-6" />
              <h3 className="mt-3 font-medium">{f.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="text-muted-foreground mx-auto w-full max-w-6xl px-6 py-8 text-sm">
        © {new Date().getFullYear()} Atlas — Project Management Hub
      </footer>
    </div>
  );
}
