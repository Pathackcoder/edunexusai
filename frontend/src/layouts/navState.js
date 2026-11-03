/**
 * Sidebar group ownership. A group owns a route only when the route is one of its own
 * child links (or below one). A shared prefix is not enough: /admin/integrations is not
 * part of "Access Control" just because both start with /admin.
 */
export const groupOwnsPath = (section, pathname) =>
  (section.children ?? []).some((child) => pathname === child.path || pathname.startsWith(`${child.path}/`));
