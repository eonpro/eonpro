/**
 * Shared admin navigation config so sidebar is consistent on Home, admin routes, and patient profile.
 * Used by src/app/admin/layout.tsx and src/app/patients/layout.tsx.
 */

export interface AdminNavItemConfig {
  path: string;
  label: string;
  iconKey: string;
}

export const baseAdminNavConfig: AdminNavItemConfig[] = [
  { path: '/', label: 'Home', iconKey: 'Home' },
  { path: '/admin/intakes', label: 'Intakes', iconKey: 'UserPlus' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/rx-queue', label: 'RX Queue', iconKey: 'Pill' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  { path: '/admin/products', label: 'Products', iconKey: 'Store' },
  { path: '/admin/analytics', label: 'Analytics', iconKey: 'TrendingUp' },
  { path: '/admin/affiliates', label: 'Affiliates', iconKey: 'UserCheck' },
  { path: '/admin/finance', label: 'Finance', iconKey: 'DollarSign' },
  { path: '/admin/stripe-dashboard', label: 'Stripe', iconKey: 'CreditCard' },
  { path: '/admin/registration-codes', label: 'Registration Codes', iconKey: 'Key' },
  { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
];

/** Clinics tab: shown for super_admin only, inserted after RX Queue (index 4). */
export const clinicsNavConfig: AdminNavItemConfig = {
  path: '/admin/clinics',
  label: 'Clinics',
  iconKey: 'Building2',
};

/**
 * Returns admin nav config for the given role. Inserts Clinics after RX Queue for super_admin.
 */
export function getAdminNavConfig(role: string | null): AdminNavItemConfig[] {
  const items = [...baseAdminNavConfig];
  if (role === 'super_admin') {
    items.splice(4, 0, clinicsNavConfig);
  }
  return items;
}

/**
 * Reduced nav for provider/staff/support (no Intakes, RX Queue, Tickets, Affiliates, Stripe, Registration Codes).
 * Used so sidebar is consistent when same role visits /patients, /orders, or /intake-forms.
 */
export function getNonAdminNavConfig(userRole: string | null): AdminNavItemConfig[] {
  const patientsPath = userRole === 'provider' ? '/provider/patients' : '/admin/patients';
  return [
    { path: '/', label: 'Home', iconKey: 'Home' },
    { path: patientsPath, label: 'Patients', iconKey: 'Users' },
    { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
    { path: '/admin/products', label: 'Products', iconKey: 'Store' },
    { path: '/intake-forms', label: 'Intake Forms', iconKey: 'ClipboardList' },
    { path: '/admin/analytics', label: 'Analytics', iconKey: 'TrendingUp' },
    { path: '/admin/finance', label: 'Finance', iconKey: 'DollarSign' },
    { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
  ];
}
