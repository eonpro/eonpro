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
  { path: '/admin/intake-templates', label: 'Form Templates', iconKey: 'FileText' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/refill-queue', label: 'Membership / Refills', iconKey: 'RefreshCw' },
  { path: '/admin/finance/pending-profiles', label: 'Pending Profiles', iconKey: 'ClipboardCheck' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  { path: '/admin/products', label: 'Products', iconKey: 'Store' },
  { path: '/admin/analytics', label: 'Analytics', iconKey: 'TrendingUp' },
  { path: '/admin/sales-rep/commission-plans', label: 'Sales Rep Commissions', iconKey: 'DollarSign' },
  { path: '/admin/affiliates', label: 'Affiliates', iconKey: 'UserCheck' },
  { path: '/admin/finance', label: 'Finance', iconKey: 'DollarSign' },
  { path: '/admin/stripe-dashboard', label: 'Stripe', iconKey: 'CreditCard' },
  { path: '/admin/registration-codes', label: 'Registration Codes', iconKey: 'Key' },
  { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
];

/** Clinics tab: shown for super_admin only, inserted after Pending Profiles (index 6). */
export const clinicsNavConfig: AdminNavItemConfig = {
  path: '/admin/clinics',
  label: 'Clinics',
  iconKey: 'Building2',
};

/** Control Center (monitoring): super_admin only – platform health and all functions. */
export const controlCenterNavConfig: AdminNavItemConfig = {
  path: '/admin/monitoring',
  label: 'Control Center',
  iconKey: 'Gauge',
};

/**
 * Returns admin nav config for the given role. Inserts Clinics after Membership/Refills for super_admin;
 * adds Control Center at the end for super_admin only.
 */
/** Sales rep intake links (sales_rep only). */
export const salesRepLinksNavConfig: AdminNavItemConfig = {
  path: '/admin/sales-rep/links',
  label: 'My Intake Links',
  iconKey: 'Link',
};

/**
 * Nav for sales reps: only Home, My Patients (assigned), and My Intake Links.
 * No intake-templates, orders, products, analytics, affiliates, finance, stripe, registration codes.
 */
export const salesRepNavConfig: AdminNavItemConfig[] = [
  { path: '/', label: 'Home', iconKey: 'Home' },
  { path: '/admin/patients', label: 'My Patients', iconKey: 'Users' },
  salesRepLinksNavConfig,
];

export function getAdminNavConfig(role: string | null): AdminNavItemConfig[] {
  if (role === 'sales_rep') {
    return [...salesRepNavConfig];
  }
  const items = [...baseAdminNavConfig];
  if (role === 'super_admin') {
    items.splice(6, 0, clinicsNavConfig);
    items.push(controlCenterNavConfig);
  }
  return items;
}

/**
 * Reduced nav for provider/staff/support (no Intakes, Membership/Refills, Tickets, Affiliates, Stripe, Registration Codes).
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
