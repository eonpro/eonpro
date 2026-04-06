/**
 * Shared admin navigation config so sidebar is consistent on Home, admin routes, and patient profile.
 * Used by src/app/admin/layout.tsx and src/app/patients/layout.tsx.
 */

export interface AdminNavItemConfig {
  path: string;
  label: string;
  iconKey: string;
  /** Items sharing the same groupKey are rendered as a collapsible group in the sidebar. */
  groupKey?: string;
  /** Display label for the group header (only needed on the first item in the group). */
  groupLabel?: string;
  /** Icon key for the group header (only needed on the first item in the group). */
  groupIconKey?: string;
}

export const baseAdminNavConfig: AdminNavItemConfig[] = [
  { path: '/dashboard', label: 'Home', iconKey: 'Home' },
  { path: '/admin/intakes', label: 'Intakes', iconKey: 'UserPlus' },
  { path: '/admin/intake-templates', label: 'Form Templates', iconKey: 'FileText' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/verification-queue', label: 'ID Verification', iconKey: 'Shield' },
  { path: '/admin/messages', label: 'Messages', iconKey: 'MessageSquare' },
  { path: '/admin/scheduling', label: 'Telehealth', iconKey: 'Video' },
  { path: '/admin/refill-queue', label: 'Membership / Refills', iconKey: 'RefreshCw', groupKey: 'memberships', groupLabel: 'Memberships', groupIconKey: 'RefreshCw' },
  { path: '/admin/subscription-renewals', label: 'Renewals', iconKey: 'CreditCard', groupKey: 'memberships' },
  { path: '/admin/finance/pending-profiles', label: 'Pending Profiles', iconKey: 'ClipboardCheck', groupKey: 'memberships' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart', groupKey: 'orders', groupLabel: 'Orders', groupIconKey: 'ShoppingCart' },
  { path: '/admin/order-sets', label: 'Order Sets', iconKey: 'ClipboardList', groupKey: 'orders' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck', groupKey: 'orders' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3', groupKey: 'orders' },
  { path: '/admin/package-photos', label: 'Packages', iconKey: 'Camera', groupKey: 'orders' },
  { path: '/admin/vial-labels', label: 'Vial Labels', iconKey: 'ClipboardList', groupKey: 'orders' },
  { path: '/admin/addon-unmatched-sales', label: 'Addon Queue Gaps', iconKey: 'AlertTriangle', groupKey: 'orders' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  { path: '/admin/products', label: 'Products', iconKey: 'Store' },
  { path: '/admin/analytics', label: 'Analytics', iconKey: 'TrendingUp', groupKey: 'reporting', groupLabel: 'Reporting', groupIconKey: 'TrendingUp' },
  { path: '/admin/results', label: 'Results', iconKey: 'Award', groupKey: 'reporting' },
  { path: '/admin/sales-rep/commission-plans', label: 'Sales Rep Commissions', iconKey: 'DollarSign', groupKey: 'sales', groupLabel: 'Sales', groupIconKey: 'DollarSign' },
  { path: '/admin/sales-rep/links', label: 'Intake Links', iconKey: 'Link', groupKey: 'sales' },
  { path: '/admin/sales-rep/dispositions', label: 'Dispositions', iconKey: 'ClipboardCheck', groupKey: 'sales' },
  { path: '/admin/affiliates', label: 'Affiliates', iconKey: 'UserCheck', groupKey: 'sales' },
  { path: '/admin/finance', label: 'Finance', iconKey: 'DollarSign', groupKey: 'finance', groupLabel: 'Finance', groupIconKey: 'DollarSign' },
  { path: '/admin/stripe-dashboard', label: 'Stripe', iconKey: 'CreditCard', groupKey: 'finance' },
  { path: '/admin/registration-codes', label: 'Registration Codes', iconKey: 'Key', groupKey: 'finance' },
  { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
];

/** Clinics tab: shown for super_admin only, inserted after the Memberships group (index 10). */
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
 * Nav for sales reps: near-admin access minus company-level tabs
 * (affiliates, finance, sales rep commissions, products, analytics, stripe,
 * pending profiles, registration codes).
 */
/** Sales rep dispositions (sales_rep sees own, admin sees all). */
export const salesRepDispositionsNavConfig: AdminNavItemConfig = {
  path: '/admin/sales-rep/dispositions',
  label: 'Dispositions',
  iconKey: 'ClipboardCheck',
};

export const salesRepNavConfig: AdminNavItemConfig[] = [
  { path: '/dashboard', label: 'Home', iconKey: 'Home' },
  { path: '/admin/intakes', label: 'Intakes', iconKey: 'UserPlus' },
  { path: '/admin/intake-templates', label: 'Form Templates', iconKey: 'FileText' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/messages', label: 'Messages', iconKey: 'MessageSquare' },
  { path: '/admin/scheduling', label: 'Telehealth', iconKey: 'Video' },
  { path: '/admin/refill-queue', label: 'Membership / Refills', iconKey: 'RefreshCw', groupKey: 'memberships', groupLabel: 'Memberships', groupIconKey: 'RefreshCw' },
  { path: '/admin/subscription-renewals', label: 'Renewals', iconKey: 'CreditCard', groupKey: 'memberships' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart', groupKey: 'orders', groupLabel: 'Orders', groupIconKey: 'ShoppingCart' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck', groupKey: 'orders' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3', groupKey: 'orders' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  salesRepLinksNavConfig,
  salesRepDispositionsNavConfig,
  { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
];

/**
 * Staff nav: operational subset of admin nav.
 * No form templates, pending profiles, products, analytics, finance, stripe,
 * registration codes, affiliates, or sales rep commissions.
 */
export const staffNavConfig: AdminNavItemConfig[] = [
  { path: '/staff', label: 'Home', iconKey: 'Home' },
  { path: '/admin/intakes', label: 'Intakes', iconKey: 'UserPlus' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/verification-queue', label: 'ID Verification', iconKey: 'Shield' },
  { path: '/admin/messages', label: 'Messages', iconKey: 'MessageSquare' },
  { path: '/admin/scheduling', label: 'Telehealth', iconKey: 'Video' },
  { path: '/staff/appointments', label: 'Appointments', iconKey: 'Calendar' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart', groupKey: 'orders', groupLabel: 'Orders', groupIconKey: 'ShoppingCart' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck', groupKey: 'orders' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3', groupKey: 'orders' },
  { path: '/admin/package-photos', label: 'Packages', iconKey: 'Camera', groupKey: 'orders' },
  { path: '/admin/vial-labels', label: 'Vial Labels', iconKey: 'ClipboardList', groupKey: 'orders' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  { path: '/admin/sales-rep/links', label: 'Intake Links', iconKey: 'Link' },
  { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
];

/**
 * Pharmacy rep nav: global patient visibility + shipping workflows.
 */
export const pharmacyRepNavConfig: AdminNavItemConfig[] = [
  { path: '/admin', label: 'Home', iconKey: 'Home' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/vial-labels', label: 'Vial Labels', iconKey: 'ClipboardList' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3' },
  { path: '/admin/package-photos', label: 'Package Photos', iconKey: 'Camera' },
  { path: '/admin/clinics', label: 'Switch Clinic', iconKey: 'Building2' },
];

export function getAdminNavConfig(role: string | null): AdminNavItemConfig[] {
  if (role === 'sales_rep') {
    return [...salesRepNavConfig];
  }
  if (role === 'pharmacy_rep') {
    return [...pharmacyRepNavConfig];
  }
  if (role === 'staff') {
    return [...staffNavConfig];
  }
  const items = [...baseAdminNavConfig];
  if (role === 'super_admin') {
    items.splice(10, 0, clinicsNavConfig);
    items.push(controlCenterNavConfig);
  }
  return items;
}

/**
 * Reduced nav for provider/staff/support (no Intakes, Membership/Refills, Tickets, Affiliates, Stripe, Registration Codes).
 * Used so sidebar is consistent when same role visits /patients, /orders, or /intake-forms.
 */
export function getNonAdminNavConfig(userRole: string | null): AdminNavItemConfig[] {
  if (userRole === 'pharmacy_rep') {
    return [...pharmacyRepNavConfig];
  }
  if (userRole === 'staff') {
    return [
      { path: '/staff', label: 'Home', iconKey: 'Home' },
      { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
      { path: '/admin/messages', label: 'Messages', iconKey: 'MessageSquare' },
      { path: '/admin/scheduling', label: 'Telehealth', iconKey: 'Video' },
      { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart', groupKey: 'orders', groupLabel: 'Orders', groupIconKey: 'ShoppingCart' },
      { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck', groupKey: 'orders' },
      { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3', groupKey: 'orders' },
      { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
      { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
    ];
  }

  const patientsPath = userRole === 'provider' ? '/provider/patients' : '/admin/patients';
  return [
    { path: '/dashboard', label: 'Home', iconKey: 'Home' },
    { path: patientsPath, label: 'Patients', iconKey: 'Users' },
    { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart', groupKey: 'orders', groupLabel: 'Orders', groupIconKey: 'ShoppingCart' },
    { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck', groupKey: 'orders' },
    { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3', groupKey: 'orders' },
    { path: '/admin/products', label: 'Products', iconKey: 'Store' },
    { path: '/intake-forms', label: 'Intake Forms', iconKey: 'ClipboardList' },
    { path: '/admin/analytics', label: 'Analytics', iconKey: 'TrendingUp' },
    { path: '/admin/finance', label: 'Finance', iconKey: 'DollarSign' },
    { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
  ];
}
