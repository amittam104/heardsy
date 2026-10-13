import { MonitorIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@openheard/ui/components/dropdown-menu";
import { cn } from "@openheard/ui/lib/utils";
import { saveThemeChoice, type ThemeChoice, useVisitorTheme } from "@/lib/visitor-theme";

const OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "auto", label: "System", icon: MonitorIcon },
] as const;

// Light, Dark or System, saved under `storageKey`.
export function ThemeSwitch({ storageKey, fallback, className }: { storageKey: string; fallback: "light" | "dark"; className?: string }) {
  const { choice } = useVisitorTheme(storageKey, fallback);
  const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[1];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${current.label}`}
        title={`Theme: ${current.label}`}
        className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground md:size-8", className)}
      >
        <Icon aria-hidden className="size-[18px] md:size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={choice} onValueChange={(v) => saveThemeChoice(storageKey, v as ThemeChoice)}>
            {OPTIONS.map(({ value, label, icon: I }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                <I aria-hidden className="size-4" />
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
