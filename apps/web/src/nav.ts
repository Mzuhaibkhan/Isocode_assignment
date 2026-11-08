export type AppRole = "operator" | "office_manager";

export type NavTabId =
  | "collect"
  | "members"
  | "prices"
  | "sync"
  | "review"
  | "payments"
  | "devices"
  | "sms"
  | "centres"
  | "slips";

export interface NavItem {
  id: NavTabId;
  marathi: string;
  en: string;
  badge?: number;
  roles: AppRole[];
}

const ALL_NAV_ITEMS: Array<Omit<NavItem, "badge">> = [
  { id: "collect", marathi: "नवीन खरेदी", en: "Collect", roles: ["operator"] },
  { id: "members", marathi: "सभासद", en: "Members", roles: ["operator", "office_manager"] },
  { id: "prices", marathi: "दर फलक", en: "Prices", roles: ["operator", "office_manager"] },
  { id: "sync", marathi: "सिंक स्थिती", en: "Sync", roles: ["operator"] },
  { id: "review", marathi: "पुनरावलोकन", en: "Review", roles: ["office_manager"] },
  { id: "payments", marathi: "देयक फाईल", en: "Payments", roles: ["office_manager"] },
  { id: "centres", marathi: "दैनिक साठा", en: "Stock", roles: ["office_manager"] },
  { id: "devices", marathi: "साधने", en: "Devices", roles: ["office_manager"] },
  { id: "sms", marathi: "SMS नोंदी", en: "SMS", roles: ["office_manager"] },
  { id: "slips", marathi: "नमुना पावती", en: "Slips", roles: ["office_manager"] },
];

/**
 * Tabs visible to a role (§ role-based UI). A logged-in operator never sees
 * office tabs and vice versa. The sync tab carries the pending-outbox badge.
 */
export function getNavItems(role: AppRole, pendingSyncCount = 0): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) =>
    item.id === "sync" ? { ...item, badge: pendingSyncCount } : item
  );
}
