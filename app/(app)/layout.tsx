import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { signOut } from "@workos-inc/authkit-nextjs";
import { requireAuthContext } from "@/lib/auth/context";
import { devAuthEnabled, DEV_COOKIE } from "@/lib/auth/dev";
import { UserMenu } from "@/components/app/user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAuthContext();

  async function signOutAction() {
    "use server";
    if (devAuthEnabled()) {
      (await cookies()).delete(DEV_COOKIE);
      redirect("/");
    }
    await signOut();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
        <Link href="/projects" className="flex items-center gap-2 font-semibold">
          <Layers className="text-primary size-5" />
          <span>Atlas</span>
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
