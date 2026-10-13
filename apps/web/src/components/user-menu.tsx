import { Button } from "@openheard/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@openheard/ui/components/dropdown-menu";
import { GearSixIcon, LockSimpleIcon } from "@phosphor-icons/react";
import { Link, useLoaderData, useRouter } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { DEMO_ADMIN_ID, isDemo } from "@/lib/demo";

import { Avatar } from "./bits";

export default function UserMenu() {
  const router = useRouter();
  const data = useLoaderData({ from: "__root__" });
  const user = data?.user;

  // Nobody signs up for the demo; one click puts them in its dashboard. A
  // customer who is signed in elsewhere arrives here as a guest and needs the
  // same button.
  if (isDemo(data?.workspace) && user?.id !== DEMO_ADMIN_ID) {
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<a href="/demo" />}>
        Open dashboard
      </Button>
    );
  }

  if (!user) {
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/login" />}>
        Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Account: ${user.name}`} className="inline-flex size-10 items-center justify-center rounded-full outline-none md:size-8">
        <Avatar name={user.name} image={user.image} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="text-[13px] font-semibold text-foreground">{user.name}</div>
            <div className="truncate">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.role === "admin" ? (
            <DropdownMenuItem render={<Link to="/dashboard/inbox" />}>
              <GearSixIcon className="size-4" /> Dashboard
            </DropdownMenuItem>
          ) : user.privateAccess ? (
            <DropdownMenuItem render={<Link to="/dashboard/private" />}>
              <LockSimpleIcon className="size-4" /> Private feedback
            </DropdownMenuItem>
          ) : data.localDashboard ? (
            <DropdownMenuItem render={<a href={data.localDashboard} />}>
              <GearSixIcon className="size-4" /> Dashboard
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() =>
              authClient.signOut({ fetchOptions: { onSuccess: () => router.invalidate().then(() => router.navigate({ to: data.boardPath })) } })
            }
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
