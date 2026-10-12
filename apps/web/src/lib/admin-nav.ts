export const SETTINGS_NAV = [
  { group: "Personal", items: [["profile", "Profile"], ["billing", "Billing"], ["notifications", "Notifications"]] },
  { group: "Workspace", items: [["general", "General"], ["branding", "Branding"], ["access", "Access"], ["team", "Team"]] },
  { group: "Product", items: [["public-board", "Public board"], ["boards", "Boards & tags"], ["statuses", "Statuses"], ["widget", "Public widget"], ["private-widget", "Private widget"]] },
  { group: "Developers", items: [["api-keys", "API keys"], ["integrations", "Integrations"], ["export", "Import & export"]] },
] as const;

// Teammates with private feedback access but no admin role reach only these.
export const TEAMMATE_SETTINGS = ["notifications", "private-widget"] as const;

export function teammateAllowed(pathname: string): boolean {
  if (pathname === "/dashboard/private" || pathname.startsWith("/dashboard/private/")) return true;
  return TEAMMATE_SETTINGS.some((slug) => pathname === `/dashboard/settings/${slug}`);
}
