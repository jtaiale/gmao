// ============================================================
// Vérification des droits admin par menu / niveau
// Utilisé en garde de route et dans les handlers
// ============================================================

export const PERMISSION_MENUS = [
  'tickets', 'planning', 'clients', 'sites', 'products', 'chantiers',
  'technicians', 'admins', 'accidents', 'derogations', 'bulletins',
  'stats', 'exports',
] as const;

export type PermissionMenu = typeof PERMISSION_MENUS[number];
export type PermissionLevel = 'none' | 'read' | 'write';

export interface AdminPermissions {
  [key: string]: PermissionLevel | undefined;
}

export function parsePermissions(raw: string | null | undefined): AdminPermissions {
  if (!raw) return {};
  try { return JSON.parse(raw) as AdminPermissions; } catch { return {}; }
}

export function checkAdminCan(
  superAdmin: boolean,
  permissions: AdminPermissions,
  menu: PermissionMenu,
  level: 'read' | 'write' = 'read'
): boolean {
  if (superAdmin) return true;
  const lvl = permissions[menu] ?? 'none';
  if (level === 'read')  return lvl === 'read' || lvl === 'write';
  if (level === 'write') return lvl === 'write';
  return false;
}
