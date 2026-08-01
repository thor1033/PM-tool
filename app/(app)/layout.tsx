import Link from "next/link";
import { Layers } from "lucide-react";
import { requireAuthContext } from "@/lib/auth/context";
import { UserMenu } from "@/components/app/user-menu";
import { signOutAction } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAuthContext();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/85 sticky top-0 z-30 flex h-16 items-center justify-between border-b px-5 backdrop-blur">
        <Link href="/projects" className="flex items-center gap-2.5">
          <span className="bg-foreground text-background shadow-xs grid size-8 place-items-center rounded-[9px]">
            <Layers className="size-4" />
          </span>
          <span className="font-serif-display text-[19px] leading-none font-semibold tracking-tight">
            Atlas
          </span>
          <span className="text-muted-foreground hidden text-sm font-normal sm:inline">
            / {ctx.orgName}
          </span>
        </Link>
        <UserMenu
          name={ctx.name}
          email={ctx.email}
          orgName={ctx.orgName}
          signOutAction={signOutAction}
        />
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
