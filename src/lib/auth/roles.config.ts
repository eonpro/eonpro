/**
 * Role-Based Access Control Configuration
 * Defines features, permissions, and UI layouts for each user role
 */

export type UserRole = 'super_admin' | 'admin' | 'provider' | 'staff' | 'support' | 'patient' | 'influencer';

export interface RoleConfig {
  role: UserRole;
  displayName: string;
  description: string;
  defaultPath: string;
  theme: {
    primaryColor: string;
    secondaryColor: string;
    iconColor: string;
    bgGradient: string;
  };
  features: {
    // Patient Management
    viewAllPatients: boolean;
    editPatients: boolean;
    deletePatients: boolean;
    viewPatientPHI: boolean;
    exportPatientData: boolean;

    // Clinical Features
    createSoapNotes: boolean;
    prescribeRx: boolean;
    orderLabs: boolean;
    viewMedicalRecords: boolean;
    uploadDocuments: boolean;

    // Administrative
    manageUsers: boolean;
    manageClinics: boolean;
    viewAnalytics: boolean;
    viewFinancials: boolean;
    manageSubscriptions: boolean;

    // Communication
    internalMessaging: boolean;
    patientMessaging: boolean;
    ticketManagement: boolean;
    supportTickets: boolean;

    // System
    systemSettings: boolean;
    auditLogs: boolean;
    apiAccess: boolean;
    bulkOperations: boolean;

    // Commerce
    manageOrders: boolean;
    processPayments: boolean;
    manageInventory: boolean;
    viewCommissions: boolean;
  };
  navigation: {
    primary: NavigationItem[];
    secondary?: NavigationItem[];
    quick?: QuickAction[];
  };
  widgets: DashboardWidget[];
  restrictions?: string[];
}

export interface NavigationItem {
  label: string;
  path: string;
  icon: string;
  badge?: 'new' | 'count' | 'alert';
  subItems?: NavigationItem[];
}

export interface QuickAction {
  label: string;
  action: string;
  icon: string;
  color: string;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'stat' | 'chart' | 'list' | 'calendar' | 'activity' | 'alert';
  size: 'small' | 'medium' | 'large' | 'full';
  position: number;
}

// SUPER ADMIN - Full system access
export const SUPER_ADMIN_CONFIG: RoleConfig = {
  role: 'super_admin',
  displayName: 'Super Administrator',
  description: 'Complete system control and multi-clinic oversight',
  defaultPath: '/super-admin/dashboard',
  theme: {
    primaryColor: '#DC2626', // Red
    secondaryColor: '#991B1B',
    iconColor: '#FCA5A5',
    bgGradient: 'from-red-600 to-red-800'
  },
  features: {
    // All features enabled
    viewAllPatients: true,
    editPatients: true,
    deletePatients: true,
    viewPatientPHI: true,
    exportPatientData: true,
    createSoapNotes: true,
    prescribeRx: true,
    orderLabs: true,
    viewMedicalRecords: true,
    uploadDocuments: true,
    manageUsers: true,
    manageClinics: true,
    viewAnalytics: true,
    viewFinancials: true,
    manageSubscriptions: true,
    internalMessaging: true,
    patientMessaging: true,
    ticketManagement: true,
    supportTickets: true,
    systemSettings: true,
    auditLogs: true,
    apiAccess: true,
    bulkOperations: true,
    manageOrders: true,
    processPayments: true,
    manageInventory: true,
    viewCommissions: true,
  },
  navigation: {
    primary: [
      { label: 'Dashboard', path: '/super-admin/dashboard', icon: 'LayoutDashboard' },
      { label: 'Clinics', path: '/admin/clinics', icon: 'Building2' },
      { label: 'Global Users', path: '/super-admin/users', icon: 'Users' },
      { label: 'System Health', path: '/super-admin/system', icon: 'Activity' },
      { label: 'Security', path: '/super-admin/security', icon: 'Shield' },
      { label: 'Financials', path: '/super-admin/financials', icon: 'DollarSign' },
      { label: 'API Management', path: '/super-admin/api', icon: 'Code2' },
      { label: 'Audit Trail', path: '/super-admin/audit', icon: 'FileSearch' },
    ],
    quick: [
      { label: 'Create Clinic', action: 'create-clinic', icon: 'Plus', color: 'green' },
      { label: 'System Backup', action: 'system-backup', icon: 'Download', color: 'blue' },
      { label: 'Emergency Stop', action: 'emergency-stop', icon: 'AlertTriangle', color: 'red' },
    ]
  },
  widgets: [
    { id: 'system-overview', title: 'System Overview', type: 'stat', size: 'large', position: 1 },
    { id: 'clinic-performance', title: 'Clinic Performance', type: 'chart', size: 'large', position: 2 },
    { id: 'security-alerts', title: 'Security Alerts', type: 'alert', size: 'medium', position: 3 },
    { id: 'revenue-analytics', title: 'Platform Revenue', type: 'chart', size: 'large', position: 4 },
  ]
};

// ADMIN - Clinic-level administrator
export const ADMIN_CONFIG: RoleConfig = {
  role: 'admin',
  displayName: 'Clinic Administrator',
  description: 'Manage clinic operations, staff, and settings',
  defaultPath: '/admin',
  theme: {
    primaryColor: '#7C3AED', // Purple
    secondaryColor: '#6D28D9',
    iconColor: '#C4B5FD',
    bgGradient: 'from-purple-600 to-indigo-700'
  },
  features: {
    viewAllPatients: true,
    editPatients: true,
    deletePatients: true,
    viewPatientPHI: true,
    exportPatientData: true,
    createSoapNotes: false,
    prescribeRx: false,
    orderLabs: true,
    viewMedicalRecords: true,
    uploadDocuments: true,
    manageUsers: true,
    manageClinics: false, // Can only manage their clinic
    viewAnalytics: true,
    viewFinancials: true,
    manageSubscriptions: true,
    internalMessaging: true,
    patientMessaging: true,
    ticketManagement: true,
    supportTickets: true,
    systemSettings: false,
    auditLogs: true,
    apiAccess: false,
    bulkOperations: true,
    manageOrders: true,
    processPayments: true,
    manageInventory: true,
    viewCommissions: true,
  },
  navigation: {
    primary: [
      { label: 'Dashboard', path: '/admin', icon: 'Home' },
      {
        label: 'Patients',
        path: '/patients',
        icon: 'Users',
        subItems: [
          { label: 'All Patients', path: '/patients', icon: 'UserCheck' },
          { label: 'New Intake', path: '/admin/patients/new', icon: 'UserPlus' },
          { label: 'Reports', path: '/admin/patients/reports', icon: 'FileText' },
        ]
      },
      {
        label: 'Staff',
        path: '/providers',
        icon: 'Briefcase',
        subItems: [
          { label: 'Providers', path: '/providers', icon: 'Stethoscope' },
          { label: 'Manage Users', path: '/settings/users', icon: 'Users' },
        ]
      },
      { label: 'Orders', path: '/orders', icon: 'ShoppingCart' },
      { label: 'Intake Forms', path: '/intake-forms', icon: 'ClipboardList' },
      { label: 'Analytics', path: '/admin/analytics', icon: 'TrendingUp' },
      { label: 'Billing', path: '/admin/billing', icon: 'DollarSign' },
      { label: 'Settings', path: '/settings', icon: 'Settings' },
    ],
    quick: [
      { label: 'Add Patient', action: 'add-patient', icon: 'UserPlus', color: 'blue' },
      { label: 'Create Order', action: 'create-order', icon: 'ShoppingBag', color: 'green' },
      { label: 'View Reports', action: 'view-reports', icon: 'FileBarChart', color: 'purple' },
    ]
  },
  widgets: [
    { id: 'clinic-stats', title: 'Clinic Overview', type: 'stat', size: 'full', position: 1 },
    { id: 'recent-patients', title: 'Recent Patients', type: 'list', size: 'medium', position: 2 },
    { id: 'revenue-chart', title: 'Revenue', type: 'chart', size: 'medium', position: 3 },
    { id: 'staff-activity', title: 'Staff Activity', type: 'activity', size: 'medium', position: 4 },
    { id: 'pending-tasks', title: 'Pending Tasks', type: 'list', size: 'medium', position: 5 },
  ]
};

// PROVIDER - Medical professionals
export const PROVIDER_CONFIG: RoleConfig = {
  role: 'provider',
  displayName: 'Healthcare Provider',
  description: 'Medical professionals providing patient care',
  defaultPath: '/provider',
  theme: {
    primaryColor: '#059669', // Green
    secondaryColor: '#047857',
    iconColor: '#6EE7B7',
    bgGradient: 'from-green-600 to-teal-700'
  },
  features: {
    viewAllPatients: true, // Only assigned patients
    editPatients: true,
    deletePatients: false,
    viewPatientPHI: true,
    exportPatientData: true,
    createSoapNotes: true,
    prescribeRx: true,
    orderLabs: true,
    viewMedicalRecords: true,
    uploadDocuments: true,
    manageUsers: false,
    manageClinics: false,
    viewAnalytics: false,
    viewFinancials: false,
    manageSubscriptions: false,
    internalMessaging: true,
    patientMessaging: true,
    ticketManagement: true,
    supportTickets: true,
    systemSettings: false,
    auditLogs: false,
    apiAccess: false,
    bulkOperations: false,
    manageOrders: true,
    processPayments: false,
    manageInventory: false,
    viewCommissions: true,
  },
  navigation: {
    primary: [
      { label: 'Dashboard', path: '/provider', icon: 'Home' },
      { label: 'My Patients', path: '/provider/patients', icon: 'Users' },
      { label: 'Calendar', path: '/provider/calendar', icon: 'Calendar' },
      { label: 'Consultations', path: '/provider/consultations', icon: 'Video' },
      { label: 'Prescriptions', path: '/provider/prescriptions', icon: 'Pill' },
      { label: 'Lab Results', path: '/provider/labs', icon: 'TestTube' },
      { label: 'SOAP Notes', path: '/provider/soap-notes', icon: 'FileText' },
      { label: 'Messages', path: '/provider/messages', icon: 'MessageSquare' },
      { label: 'Resources', path: '/provider/resources', icon: 'BookOpen' },
    ],
    quick: [
      { label: 'Start Consultation', action: 'start-consultation', icon: 'Video', color: 'green' },
      { label: 'Write SOAP Note', action: 'create-soap', icon: 'PenTool', color: 'blue' },
      { label: 'E-Prescribe', action: 'prescribe', icon: 'Pill', color: 'purple' },
    ]
  },
  widgets: [
    { id: 'todays-schedule', title: "Today's Schedule", type: 'calendar', size: 'large', position: 1 },
    { id: 'patient-queue', title: 'Patient Queue', type: 'list', size: 'medium', position: 2 },
    { id: 'recent-labs', title: 'Recent Lab Results', type: 'list', size: 'medium', position: 3 },
    { id: 'pending-rx', title: 'Pending Prescriptions', type: 'list', size: 'small', position: 4 },
    { id: 'messages', title: 'Unread Messages', type: 'list', size: 'small', position: 5 },
  ],
  restrictions: ['Cannot delete patients', 'Cannot access financial data', 'Cannot manage other users']
};

// STAFF - General staff members / Agents
export const STAFF_CONFIG: RoleConfig = {
  role: 'staff',
  displayName: 'Staff Member / Agent',
  description: 'Support staff and administrative agents',
  defaultPath: '/staff',
  theme: {
    primaryColor: '#0891B2', // Cyan
    secondaryColor: '#0E7490',
    iconColor: '#67E8F9',
    bgGradient: 'from-cyan-600 to-blue-700'
  },
  features: {
    viewAllPatients: true,
    editPatients: true,
    deletePatients: false,
    viewPatientPHI: false, // Limited PHI access
    exportPatientData: false,
    createSoapNotes: false,
    prescribeRx: false,
    orderLabs: false,
    viewMedicalRecords: false,
    uploadDocuments: true,
    manageUsers: false,
    manageClinics: false,
    viewAnalytics: false,
    viewFinancials: false,
    manageSubscriptions: false,
    internalMessaging: true,
    patientMessaging: true,
    ticketManagement: true,
    supportTickets: true,
    systemSettings: false,
    auditLogs: false,
    apiAccess: false,
    bulkOperations: false,
    manageOrders: true,
    processPayments: true,
    manageInventory: true,
    viewCommissions: false,
  },
  navigation: {
    primary: [
      { label: 'Dashboard', path: '/staff', icon: 'Home' },
      { label: 'Patient Intake', path: '/staff/intake', icon: 'ClipboardList' },
      { label: 'Appointments', path: '/staff/appointments', icon: 'Calendar' },
      { label: 'Orders', path: '/staff/orders', icon: 'Package' },
      { label: 'Documents', path: '/staff/documents', icon: 'FileText' },
      { label: 'Tickets', path: '/staff/tickets', icon: 'Ticket' },
      { label: 'Messages', path: '/staff/messages', icon: 'MessageSquare' },
      { label: 'Resources', path: '/staff/resources', icon: 'HelpCircle' },
    ],
    quick: [
      { label: 'New Intake', action: 'new-intake', icon: 'UserPlus', color: 'blue' },
      { label: 'Schedule Appointment', action: 'schedule', icon: 'Calendar', color: 'green' },
      { label: 'Process Order', action: 'process-order', icon: 'Package', color: 'orange' },
    ]
  },
  widgets: [
    { id: 'pending-intakes', title: 'Pending Intakes', type: 'list', size: 'medium', position: 1 },
    { id: 'todays-appointments', title: "Today's Appointments", type: 'list', size: 'medium', position: 2 },
    { id: 'open-tickets', title: 'Open Tickets', type: 'list', size: 'medium', position: 3 },
    { id: 'order-queue', title: 'Order Queue', type: 'list', size: 'medium', position: 4 },
    { id: 'quick-stats', title: 'Daily Stats', type: 'stat', size: 'full', position: 5 },
  ],
  restrictions: ['No PHI access', 'Cannot prescribe', 'Cannot view medical records']
};

// SUPPORT - Customer support team
export const SUPPORT_CONFIG: RoleConfig = {
  role: 'support',
  displayName: 'Support Specialist',
  description: 'Customer support and ticket management',
  defaultPath: '/support',
  theme: {
    primaryColor: '#F59E0B', // Amber
    secondaryColor: '#D97706',
    iconColor: '#FCD34D',
    bgGradient: 'from-amber-600 to-orange-700'
  },
  features: {
    viewAllPatients: true, // Limited view
    editPatients: false,
    deletePatients: false,
    viewPatientPHI: false,
    exportPatientData: false,
    createSoapNotes: false,
    prescribeRx: false,
    orderLabs: false,
    viewMedicalRecords: false,
    uploadDocuments: false,
    manageUsers: false,
    manageClinics: false,
    viewAnalytics: false,
    viewFinancials: false,
    manageSubscriptions: true,
    internalMessaging: true,
    patientMessaging: true,
    ticketManagement: true,
    supportTickets: true,
    systemSettings: false,
    auditLogs: false,
    apiAccess: false,
    bulkOperations: false,
    manageOrders: true,
    processPayments: false,
    manageInventory: false,
    viewCommissions: false,
  },
  navigation: {
    primary: [
      { label: 'Dashboard', path: '/support', icon: 'Home' },
      { label: 'Tickets', path: '/support/tickets', icon: 'Ticket', badge: 'count' },
      { label: 'Live Chat', path: '/support/chat', icon: 'MessageCircle', badge: 'alert' },
      { label: 'Knowledge Base', path: '/support/kb', icon: 'BookOpen' },
      { label: 'Customers', path: '/support/customers', icon: 'Users' },
      { label: 'FAQs', path: '/support/faqs', icon: 'HelpCircle' },
      { label: 'Reports', path: '/support/reports', icon: 'BarChart3' },
    ],
    quick: [
      { label: 'Create Ticket', action: 'create-ticket', icon: 'Plus', color: 'blue' },
      { label: 'Start Chat', action: 'start-chat', icon: 'MessageCircle', color: 'green' },
      { label: 'Search KB', action: 'search-kb', icon: 'Search', color: 'purple' },
    ]
  },
  widgets: [
    { id: 'ticket-queue', title: 'Ticket Queue', type: 'list', size: 'large', position: 1 },
    { id: 'live-chats', title: 'Active Chats', type: 'list', size: 'medium', position: 2 },
    { id: 'sla-status', title: 'SLA Status', type: 'stat', size: 'small', position: 3 },
    { id: 'customer-satisfaction', title: 'CSAT Score', type: 'chart', size: 'small', position: 4 },
    { id: 'trending-issues', title: 'Trending Issues', type: 'list', size: 'medium', position: 5 },
  ],
  restrictions: ['No PHI access', 'Cannot edit patient data', 'View-only customer information']
};

// PATIENT - Patient portal access
export const PATIENT_CONFIG: RoleConfig = {
  role: 'patient',
  displayName: 'Patient',
  description: 'Patient portal with personal health information',
  defaultPath: '/patient-portal',
  theme: {
    primaryColor: '#3B82F6', // Blue
    secondaryColor: '#2563EB',
    iconColor: '#93C5FD',
    bgGradient: 'from-blue-500 to-indigo-600'
  },
  features: {
    viewAllPatients: false, // Only themselves
    editPatients: false, // Limited edit of own profile
    deletePatients: false,
    viewPatientPHI: true, // Only their own
    exportPatientData: true, // Only their own
    createSoapNotes: false,
    prescribeRx: false,
    orderLabs: false,
    viewMedicalRecords: true, // Only their own
    uploadDocuments: true,
    manageUsers: false,
    manageClinics: false,
    viewAnalytics: false,
    viewFinancials: false,
    manageSubscriptions: true, // Their own
    internalMessaging: false,
    patientMessaging: true,
    ticketManagement: false,
    supportTickets: true,
    systemSettings: false,
    auditLogs: false,
    apiAccess: false,
    bulkOperations: false,
    manageOrders: true, // Their own
    processPayments: true, // Their own
    manageInventory: false,
    viewCommissions: false,
  },
  navigation: {
    primary: [
      { label: 'My Health', path: '/patient-portal', icon: 'Heart' },
      { label: 'Appointments', path: '/patient-portal/appointments', icon: 'Calendar' },
      { label: 'Medications', path: '/patient-portal/medications', icon: 'Pill' },
      { label: 'Lab Results', path: '/patient-portal/labs', icon: 'TestTube' },
      { label: 'Documents', path: '/patient-portal/documents', icon: 'FileText' },
      { label: 'Messages', path: '/patient-portal/messages', icon: 'MessageSquare' },
      { label: 'Orders', path: '/patient-portal/orders', icon: 'Package' },
      { label: 'Billing', path: '/patient-portal/billing', icon: 'CreditCard' },
      { label: 'Profile', path: '/patient-portal/profile', icon: 'User' },
    ],
    quick: [
      { label: 'Book Appointment', action: 'book-appointment', icon: 'CalendarPlus', color: 'green' },
      { label: 'Message Provider', action: 'message-provider', icon: 'MessageSquare', color: 'blue' },
      { label: 'Refill Rx', action: 'refill-rx', icon: 'Pill', color: 'purple' },
    ]
  },
  widgets: [
    { id: 'health-summary', title: 'Health Summary', type: 'stat', size: 'full', position: 1 },
    { id: 'upcoming-appointments', title: 'Upcoming Appointments', type: 'list', size: 'medium', position: 2 },
    { id: 'medications', title: 'Active Medications', type: 'list', size: 'medium', position: 3 },
    { id: 'recent-labs', title: 'Recent Lab Results', type: 'list', size: 'medium', position: 4 },
    { id: 'health-goals', title: 'Health Goals', type: 'chart', size: 'medium', position: 5 },
  ],
  restrictions: ['Can only view own data', 'Cannot access other patient information', 'Cannot prescribe or order tests']
};

// INFLUENCER - Referral partners
export const INFLUENCER_CONFIG: RoleConfig = {
  role: 'influencer',
  displayName: 'Referral Partner',
  description: 'Influencers and referral partners',
  defaultPath: '/influencer',
  theme: {
    primaryColor: '#EC4899', // Pink
    secondaryColor: '#DB2777',
    iconColor: '#F9A8D4',
    bgGradient: 'from-pink-500 to-purple-600'
  },
  features: {
    viewAllPatients: false,
    editPatients: false,
    deletePatients: false,
    viewPatientPHI: false,
    exportPatientData: false,
    createSoapNotes: false,
    prescribeRx: false,
    orderLabs: false,
    viewMedicalRecords: false,
    uploadDocuments: false,
    manageUsers: false,
    manageClinics: false,
    viewAnalytics: false,
    viewFinancials: false,
    manageSubscriptions: false,
    internalMessaging: false,
    patientMessaging: false,
    ticketManagement: false,
    supportTickets: true,
    systemSettings: false,
    auditLogs: false,
    apiAccess: false,
    bulkOperations: false,
    manageOrders: false,
    processPayments: false,
    manageInventory: false,
    viewCommissions: true,
  },
  navigation: {
    primary: [
      { label: 'Dashboard', path: '/influencer', icon: 'Home' },
      { label: 'Referrals', path: '/influencer/referrals', icon: 'Users' },
      { label: 'Commissions', path: '/influencer/commissions', icon: 'DollarSign' },
      { label: 'Campaigns', path: '/influencer/campaigns', icon: 'Target' },
      { label: 'Resources', path: '/influencer/resources', icon: 'Download' },
      { label: 'Analytics', path: '/influencer/analytics', icon: 'TrendingUp' },
      { label: 'Support', path: '/influencer/support', icon: 'HelpCircle' },
    ],
    quick: [
      { label: 'Share Link', action: 'share-link', icon: 'Share2', color: 'blue' },
      { label: 'View Earnings', action: 'view-earnings', icon: 'DollarSign', color: 'green' },
      { label: 'Get Materials', action: 'get-materials', icon: 'Download', color: 'purple' },
    ]
  },
  widgets: [
    { id: 'earnings-overview', title: 'Earnings Overview', type: 'stat', size: 'large', position: 1 },
    { id: 'referral-stats', title: 'Referral Performance', type: 'chart', size: 'large', position: 2 },
    { id: 'recent-referrals', title: 'Recent Referrals', type: 'list', size: 'medium', position: 3 },
    { id: 'pending-commissions', title: 'Pending Commissions', type: 'list', size: 'medium', position: 4 },
    { id: 'campaign-performance', title: 'Campaign Performance', type: 'chart', size: 'full', position: 5 },
  ],
  restrictions: ['No patient data access', 'View-only commission data', 'Cannot process medical operations']
};

// Role configuration map
export const ROLE_CONFIGS: Record<UserRole, RoleConfig> = {
  super_admin: SUPER_ADMIN_CONFIG,
  admin: ADMIN_CONFIG,
  provider: PROVIDER_CONFIG,
  staff: STAFF_CONFIG,
  support: SUPPORT_CONFIG,
  patient: PATIENT_CONFIG,
  influencer: INFLUENCER_CONFIG,
};

// Helper function to get role configuration
export function getRoleConfig(role: string): RoleConfig {
  const normalizedRole = role.toLowerCase() as UserRole;
  return ROLE_CONFIGS[normalizedRole] || PATIENT_CONFIG;
}

// Helper function to check feature access
export function hasFeatureAccess(role: string, feature: keyof RoleConfig['features']): boolean {
  const config = getRoleConfig(role);
  return config.features[feature] || false;
}

// Helper function to get navigation items for a role
export function getRoleNavigation(role: string) {
  const config = getRoleConfig(role);
  return config.navigation;
}

// Helper function to get dashboard widgets for a role
export function getRoleDashboardWidgets(role: string) {
  const config = getRoleConfig(role);
  return config.widgets.sort((a, b) => a.position - b.position);
}

// Helper function to get theme for a role
export function getRoleTheme(role: string) {
  const config = getRoleConfig(role);
  return config.theme;
}

// Export all configurations for use in components
export default ROLE_CONFIGS;
