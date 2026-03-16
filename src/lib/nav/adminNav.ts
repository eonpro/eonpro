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
  { path: '/dashboard', label: 'Home', iconKey: 'Home' },
  { path: '/admin/intakes', label: 'Intakes', iconKey: 'UserPlus' },
  { path: '/admin/intake-templates', label: 'Form Templates', iconKey: 'FileText' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/verification-queue', label: 'ID Verification', iconKey: 'Shield' },
  { path: '/admin/messages', label: 'Messages', iconKey: 'MessageSquare' },
  { path: '/admin/scheduling', label: 'Telehealth', iconKey: 'Video' },
  { path: '/admin/refill-queue', label: 'Membership / Refills', iconKey: 'RefreshCw' },
  { path: '/admin/subscription-renewals', label: 'Renewals', iconKey: 'CreditCard' },
  { path: '/admin/finance/pending-profiles', label: 'Pending Profiles', iconKey: 'ClipboardCheck' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3' },
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

/** Clinics tab: shown for super_admin only, inserted after Pending Profiles (index 8). */
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
export const salesRepNavConfig: AdminNavItemConfig[] = [
  { path: '/dashboard', label: 'Home', iconKey: 'Home' },
  { path: '/admin/intakes', label: 'Intakes', iconKey: 'UserPlus' },
  { path: '/admin/intake-templates', label: 'Form Templates', iconKey: 'FileText' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
  { path: '/admin/verification-queue', label: 'ID Verification', iconKey: 'Shield' },
  { path: '/admin/messages', label: 'Messages', iconKey: 'MessageSquare' },
  { path: '/admin/scheduling', label: 'Telehealth', iconKey: 'Video' },
  { path: '/admin/refill-queue', label: 'Membership / Refills', iconKey: 'RefreshCw' },
  { path: '/admin/subscription-renewals', label: 'Renewals', iconKey: 'CreditCard' },
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  salesRepLinksNavConfig,
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
  { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
  { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck' },
  { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3' },
  { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
  { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
];

/**
 * Pharmacy rep nav: global patient visibility + shipping workflows.
 */
export const pharmacyRepNavConfig: AdminNavItemConfig[] = [
  { path: '/admin', label: 'Home', iconKey: 'Home' },
  { path: '/admin/patients', label: 'Patients', iconKey: 'Users' },
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
    items.splice(8, 0, clinicsNavConfig);
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
      { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
      { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck' },
      { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3' },
      { path: '/tickets', label: 'Tickets', iconKey: 'Ticket' },
      { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
    ];
  }

  const patientsPath = userRole === 'provider' ? '/provider/patients' : '/admin/patients';
  return [
    { path: '/dashboard', label: 'Home', iconKey: 'Home' },
    { path: patientsPath, label: 'Patients', iconKey: 'Users' },
    { path: '/admin/orders', label: 'Orders', iconKey: 'ShoppingCart' },
    { path: '/admin/shipping', label: 'Shipping', iconKey: 'Truck' },
    { path: '/admin/shipment-monitor', label: 'Shipments', iconKey: 'BarChart3' },
    { path: '/admin/products', label: 'Products', iconKey: 'Store' },
    { path: '/intake-forms', label: 'Intake Forms', iconKey: 'ClipboardList' },
    { path: '/admin/analytics', label: 'Analytics', iconKey: 'TrendingUp' },
    { path: '/admin/finance', label: 'Finance', iconKey: 'DollarSign' },
    { path: '/admin/settings', label: 'Settings', iconKey: 'Settings' },
  ];
}
