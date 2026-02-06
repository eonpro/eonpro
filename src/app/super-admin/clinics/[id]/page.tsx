'use client';

// Clinic Detail Page - Super Admin
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Globe, Palette, Save, Trash2,
  Users, Activity, Calendar, Settings, AlertTriangle, Plus,
  UserPlus, Mail, Shield, X, Eye, EyeOff, Pill, FileText,
  CheckCircle2, XCircle, ExternalLink, Zap, Image as ImageIcon,
  Key, Copy, Check, Package, ClipboardList, AlertCircle
} from 'lucide-react';
import { BrandingImageUploader } from '@/components/admin/BrandingImageUploader';
import { CheckboxGroup } from '@/components/ui/Checkbox';

// Helper function to calculate text color based on background luminance
function getTextColorForBg(hex: string, mode: 'auto' | 'light' | 'dark'): string {
  if (mode === 'light') return '#ffffff';
  if (mode === 'dark') return '#1f2937';

  // Auto mode: calculate based on luminance
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '#ffffff';

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? '#1f2937' : '#ffffff';
}

interface ClinicFeatures {
  telehealth: boolean;
  messaging: boolean;
  billing: boolean;
  pharmacy: boolean;
  ai: boolean;
}

interface Clinic {
  id: number;
  name: string;
  subdomain: string;
  customDomain?: string;
  adminEmail: string;
  phone?: string;
  address?: string;
  primaryColor?: string;
  secondaryColor?: string;
  isActive: boolean;
  plan: string;
  features: ClinicFeatures;
  stats: {
    patients: number;
    providers: number;
    appointments: number;
  };
  createdAt: string;
}

interface ClinicUser {
  id: number;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  lastLogin?: string;
}

export default function ClinicDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicId = params.id;

  // Get initial tab from URL query param
  const initialTab = searchParams.get('tab') as 'overview' | 'branding' | 'features' | 'pharmacy' | 'users' | 'settings' || 'overview';

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'branding' | 'features' | 'pharmacy' | 'users' | 'settings'>(initialTab);

  // Lifefile/Pharmacy settings state
  const [lifefileSettings, setLifefileSettings] = useState<{
    lifefileEnabled: boolean;
    lifefileBaseUrl: string;
    lifefileUsername: string;
    lifefilePassword: string;
    lifefileVendorId: string;
    lifefilePracticeId: string;
    lifefileLocationId: string;
    lifefileNetworkId: string;
    lifefilePracticeName: string;
    lifefilePracticeAddress: string;
    lifefilePracticePhone: string;
    lifefilePracticeFax: string;
    hasCredentials: boolean;
    // Inbound webhook settings
    lifefileInboundEnabled: boolean;
    lifefileInboundPath: string;
    lifefileInboundUsername: string;
    lifefileInboundPassword: string;
    lifefileInboundSecret: string;
    lifefileInboundAllowedIPs: string;
    lifefileInboundEvents: string[];
    hasInboundCredentials: boolean;
    inboundWebhookUrl: string | null;
    inboundFieldsAvailable: boolean;
    slug: string | null;
  }>({
    lifefileEnabled: false,
    lifefileBaseUrl: '',
    lifefileUsername: '',
    lifefilePassword: '',
    lifefileVendorId: '',
    lifefilePracticeId: '',
    lifefileLocationId: '',
    lifefileNetworkId: '',
    lifefilePracticeName: '',
    lifefilePracticeAddress: '',
    lifefilePracticePhone: '',
    lifefilePracticeFax: '',
    hasCredentials: false,
    // Inbound defaults
    lifefileInboundEnabled: false,
    lifefileInboundPath: '',
    lifefileInboundUsername: '',
    lifefileInboundPassword: '',
    lifefileInboundSecret: '',
    lifefileInboundAllowedIPs: '',
    lifefileInboundEvents: [],
    hasInboundCredentials: false,
    inboundWebhookUrl: null,
    inboundFieldsAvailable: false,
    slug: null,
  });
  const [copiedInboundUrl, setCopiedInboundUrl] = useState(false);
  const [loadingLifefile, setLoadingLifefile] = useState(false);
  const [savingLifefile, setSavingLifefile] = useState(false);
  const [testingLifefile, setTestingLifefile] = useState(false);
  const [testingInbound, setTestingInbound] = useState(false);
  const [lifefileMessage, setLifefileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inboundMessage, setInboundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Users state
  const [clinicUsers, setClinicUsers] = useState<ClinicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lookingUpNpi, setLookingUpNpi] = useState(false);
  const [npiError, setNpiError] = useState('');

  // Password reset state
  const [resetPasswordModal, setResetPasswordModal] = useState<{ show: boolean; userId: number | null; userName: string }>({ show: false, userId: null, userName: '' });
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Edit user state
  const [editUserModal, setEditUserModal] = useState<{ show: boolean; user: ClinicUser | null }>({ show: false, user: null });
  const [editingUser, setEditingUser] = useState(false);
  const [editUserData, setEditUserData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    role: '',
    status: '',
    npi: '',
    deaNumber: '',
    licenseNumber: '',
    licenseState: '',
    specialty: '',
  });

  // Invite Codes state
  interface InviteCode {
    id: number;
    code: string;
    description: string | null;
    usageLimit: number | null;
    usageCount: number;
    expiresAt: string | null;
    isActive: boolean;
    createdAt: string;
  }
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loadingInviteCodes, setLoadingInviteCodes] = useState(false);
  const [showAddInviteCodeModal, setShowAddInviteCodeModal] = useState(false);
  const [addingInviteCode, setAddingInviteCode] = useState(false);
  const [newInviteCode, setNewInviteCode] = useState({
    code: '',
    description: '',
    usageLimit: '',
  });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'ADMIN', // Uppercase to match dropdown values
    password: '',
    sendInvite: true,
    // Provider-specific fields
    npi: '',
    deaNumber: '',
    licenseNumber: '',
    licenseState: '',
    specialty: '',
  });

  const [formData, setFormData] = useState<{
    name: string;
    subdomain: string;
    customDomain: string;
    adminEmail: string;
    phone: string;
    address: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    buttonTextColor: 'auto' | 'light' | 'dark';
    logoUrl: string;
    iconUrl: string;
    faviconUrl: string;
    plan: string;
    isActive: boolean;
    features: ClinicFeatures;
  }>({
    name: '',
    subdomain: '',
    customDomain: '',
    adminEmail: '',
    phone: '',
    address: '',
    primaryColor: '#0d9488',
    secondaryColor: '#6366f1',
    accentColor: '#d3f931',
    buttonTextColor: 'auto',
    logoUrl: '',
    iconUrl: '',
    faviconUrl: '',
    plan: 'professional',
    isActive: true,
    features: {
      telehealth: true,
      messaging: true,
      billing: true,
      pharmacy: false,
      ai: false,
    }
  });

  useEffect(() => {
    fetchClinic();
  }, [clinicId]);

  const fetchClinic = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const clinicData = data.clinic;

        const fetchedClinic: Clinic = {
          id: clinicData.id,
          name: clinicData.name,
          subdomain: clinicData.subdomain,
          customDomain: clinicData.customDomain || undefined,
          adminEmail: clinicData.adminEmail,
          phone: clinicData.phone || '',
          address: clinicData.address || '',
          primaryColor: clinicData.primaryColor || '#0d9488',
          secondaryColor: clinicData.secondaryColor || '#6366f1',
          isActive: clinicData.status === 'ACTIVE',
          plan: clinicData.billingPlan || 'starter',
          features: {
            telehealth: clinicData.features?.telehealth ?? true,
            messaging: clinicData.features?.messaging ?? true,
            billing: clinicData.features?.billing ?? true,
            pharmacy: clinicData.features?.pharmacy ?? false,
            ai: clinicData.features?.ai ?? false,
          },
          stats: {
            patients: clinicData._count?.patients || 0,
            providers: clinicData._count?.providers || 0,
            appointments: 0,
          },
          createdAt: clinicData.createdAt,
        };

        setClinic(fetchedClinic);
        setFormData({
          name: fetchedClinic.name,
          subdomain: fetchedClinic.subdomain,
          customDomain: fetchedClinic.customDomain || '',
          adminEmail: fetchedClinic.adminEmail,
          phone: fetchedClinic.phone || '',
          address: fetchedClinic.address || '',
          primaryColor: clinicData.primaryColor || '#0d9488',
          secondaryColor: clinicData.secondaryColor || '#6366f1',
          accentColor: clinicData.accentColor || '#d3f931',
          buttonTextColor: clinicData.buttonTextColor || 'auto',
          logoUrl: clinicData.logoUrl || '',
          iconUrl: clinicData.iconUrl || '',
          faviconUrl: clinicData.faviconUrl || '',
          plan: fetchedClinic.plan,
          isActive: fetchedClinic.isActive,
          features: fetchedClinic.features,
        });
      } else {
        console.error('Failed to fetch clinic');
      }
    } catch (error) {
      console.error('Error fetching clinic:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClinicUsers = async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/users`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setClinicUsers(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch clinic users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  // NPI Lookup using our proxy API (avoids CORS issues with NPPES)
  const lookupNpi = async () => {
    if (!newUser.npi || newUser.npi.length !== 10) {
      setNpiError('NPI must be 10 digits');
      return;
    }

    setLookingUpNpi(true);
    setNpiError('');

    try {
      // Use our proxy API to avoid CORS issues
      const response = await fetch(`/api/npi-lookup?npi=${newUser.npi}`);
      const data = await response.json();

      if (!response.ok) {
        setNpiError(data.error || 'NPI not found in registry');
        return;
      }

      // Auto-fill provider information from the lookup
      setNewUser(prev => ({
        ...prev,
        firstName: data.firstName || prev.firstName,
        lastName: data.lastName || prev.lastName,
        specialty: data.primarySpecialty || prev.specialty,
        licenseNumber: data.licenseNumber || prev.licenseNumber,
        licenseState: data.licenseState || prev.licenseState,
      }));

      setNpiError('');
    } catch (error) {
      console.error('NPI lookup failed:', error);
      setNpiError('Failed to lookup NPI. Please enter information manually.');
    } finally {
      setLookingUpNpi(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingUser(true);

    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newUser),
      });

      const data = await response.json();

      if (response.ok) {
        setShowAddUserModal(false);
        setNewUser({
          email: '',
          firstName: '',
          lastName: '',
          role: 'admin',
          password: '',
          sendInvite: true,
          npi: '',
          deaNumber: '',
          licenseNumber: '',
          licenseState: '',
          specialty: '',
        });
        setNpiError('');
        fetchClinicUsers();
        alert(`User created successfully!${newUser.sendInvite ? ' An invitation email has been sent.' : ''}`);
      } else {
        alert(data.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to remove this user from the clinic?')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        fetchClinicUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to remove user');
      }
    } catch (error) {
      console.error('Error removing user:', error);
      alert('Failed to remove user');
    }
  };

  const openEditUserModal = (user: ClinicUser) => {
    setEditUserData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      role: user.role?.toUpperCase() || 'ADMIN',
      status: user.status || 'ACTIVE',
      npi: '',
      deaNumber: '',
      licenseNumber: '',
      licenseState: '',
      specialty: '',
    });
    setEditUserModal({ show: true, user });
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserModal.user) return;

    setEditingUser(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/users/${editUserModal.user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editUserData),
      });

      const data = await response.json();

      if (response.ok) {
        setEditUserModal({ show: false, user: null });
        fetchClinicUsers();
        alert('User updated successfully');
      } else {
        alert(data.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user');
    } finally {
      setEditingUser(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordModal.userId || !newPassword) {
      alert('Please enter a new password');
      return;
    }

    if (newPassword.length < 12) {
      alert('Password must be at least 8 characters');
      return;
    }

    setResettingPassword(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/users/${resetPasswordModal.userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });

      const data = await response.json();
      if (response.ok) {
        alert(`Password reset successfully for ${resetPasswordModal.userName}`);
        setResetPasswordModal({ show: false, userId: null, userName: '' });
        setNewPassword('');
      } else {
        alert(data.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  // Fetch users when switching to users tab
  useEffect(() => {
    if (activeTab === 'users' && clinicUsers.length === 0) {
      fetchClinicUsers();
    }
  }, [activeTab]);

  // Fetch invite codes when switching to settings tab
  useEffect(() => {
    if (activeTab === 'settings' && inviteCodes.length === 0) {
      fetchInviteCodes();
    }
  }, [activeTab]);

  const fetchInviteCodes = async () => {
    setLoadingInviteCodes(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/invite-codes`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setInviteCodes(data.inviteCodes || []);
      }
    } catch (error) {
      console.error('Failed to fetch invite codes:', error);
    } finally {
      setLoadingInviteCodes(false);
    }
  };

  const handleAddInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingInviteCode(true);

    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/invite-codes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          code: newInviteCode.code.toUpperCase(),
          description: newInviteCode.description || null,
          usageLimit: newInviteCode.usageLimit ? parseInt(newInviteCode.usageLimit) : null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setShowAddInviteCodeModal(false);
        setNewInviteCode({ code: '', description: '', usageLimit: '' });
        fetchInviteCodes();
        alert('Invite code created successfully!');
      } else {
        alert(data.error || 'Failed to create invite code');
      }
    } catch (error) {
      console.error('Error creating invite code:', error);
      alert('Failed to create invite code');
    } finally {
      setAddingInviteCode(false);
    }
  };

  const handleToggleInviteCode = async (codeId: number, isActive: boolean) => {
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/invite-codes/${codeId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (response.ok) {
        fetchInviteCodes();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update invite code');
      }
    } catch (error) {
      console.error('Error updating invite code:', error);
    }
  };

  const handleDeleteInviteCode = async (codeId: number) => {
    if (!confirm('Are you sure you want to delete this invite code?')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/invite-codes/${codeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        fetchInviteCodes();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete invite code');
      }
    } catch (error) {
      console.error('Error deleting invite code:', error);
    }
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Track if lifefile settings have been fetched to prevent duplicate calls
  const lifefileSettingsFetchedRef = useRef(false);

  // UNCONDITIONAL fetch on mount - simplest possible approach
  useEffect(() => {
    console.log('=== COMPONENT MOUNTED ===');
    console.log('URL:', window.location.href);
    console.log('activeTab:', activeTab);
    
    // Check if we should fetch lifefile settings
    const urlTab = new URL(window.location.href).searchParams.get('tab');
    const shouldFetch = activeTab === 'pharmacy' || urlTab === 'pharmacy';
    
    console.log('urlTab:', urlTab, 'shouldFetch:', shouldFetch);
    
    if (shouldFetch && !lifefileSettingsFetchedRef.current) {
      console.log('>>> TRIGGERING FETCH <<<');
      lifefileSettingsFetchedRef.current = true;
      
      // Sync tab if needed
      if (urlTab === 'pharmacy' && activeTab !== 'pharmacy') {
        setActiveTab('pharmacy');
      }
      
      fetchLifefileSettings();
    }
  }, []);
  
  // Also trigger when activeTab changes (for tab clicks)
  useEffect(() => {
    if (activeTab === 'pharmacy' && !lifefileSettingsFetchedRef.current) {
      console.log('>>> TAB CHANGE FETCH <<<');
      lifefileSettingsFetchedRef.current = true;
      fetchLifefileSettings();
    }
  }, [activeTab]);

  const fetchLifefileSettings = async () => {
    console.log('[LIFEFILE FETCH] Starting fetch for clinic:', clinicId);
    setLoadingLifefile(true);
    try {
      const token = localStorage.getItem('auth-token');
      console.log('[LIFEFILE FETCH] Token exists:', !!token);
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      console.log('[LIFEFILE FETCH] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        const s = data.settings;

        // Debug: Log what we received from API - USE ALERT TO MAKE IT UNMISSABLE
        const debugInfo = {
          inboundEnabled: s?.lifefileInboundEnabled,
          inboundPath: s?.lifefileInboundPath,
          inboundUsername: s?.lifefileInboundUsername,
          inboundPassword: s?.lifefileInboundPassword,
          inboundEvents: s?.lifefileInboundEvents,
        };
        console.log('[LIFEFILE] API Response:', JSON.stringify(debugInfo, null, 2));
        
        // TEMPORARY ALERT FOR DEBUGGING - REMOVE AFTER FIXING
        alert('API Response:\\n' + 
          'inboundEnabled: ' + debugInfo.inboundEnabled + '\\n' +
          'inboundPath: ' + debugInfo.inboundPath + '\\n' +
          'inboundUsername: ' + debugInfo.inboundUsername + '\\n' +
          'inboundPassword: ' + debugInfo.inboundPassword + '\\n' +
          'inboundEvents: ' + JSON.stringify(debugInfo.inboundEvents)
        );

        // Only update if we got valid settings back
        if (s) {
          // Build the new state explicitly - don't rely on ?? for initial empty values
          const newState = {
            // Outbound settings
            lifefileEnabled: s.lifefileEnabled === true,
            lifefileBaseUrl: s.lifefileBaseUrl || '',
            lifefileUsername: s.lifefileUsername || '',
            lifefilePassword: s.lifefilePassword || '',
            lifefileVendorId: s.lifefileVendorId || '',
            lifefilePracticeId: s.lifefilePracticeId || '',
            lifefileLocationId: s.lifefileLocationId || '',
            lifefileNetworkId: s.lifefileNetworkId || '',
            lifefilePracticeName: s.lifefilePracticeName || '',
            lifefilePracticeAddress: s.lifefilePracticeAddress || '',
            lifefilePracticePhone: s.lifefilePracticePhone || '',
            lifefilePracticeFax: s.lifefilePracticeFax || '',
            hasCredentials: s.hasCredentials === true,
            // Inbound settings - explicitly set from API response
            lifefileInboundEnabled: s.lifefileInboundEnabled === true,
            lifefileInboundPath: s.lifefileInboundPath || '',
            lifefileInboundUsername: s.lifefileInboundUsername || '',
            lifefileInboundPassword: s.lifefileInboundPassword || '',
            lifefileInboundSecret: s.lifefileInboundSecret || '',
            lifefileInboundAllowedIPs: s.lifefileInboundAllowedIPs || '',
            lifefileInboundEvents: Array.isArray(s.lifefileInboundEvents) ? s.lifefileInboundEvents : [],
            hasInboundCredentials: s.hasInboundCredentials === true,
            inboundWebhookUrl: s.inboundWebhookUrl || null,
            inboundFieldsAvailable: s.inboundFieldsAvailable !== false,
            slug: s.slug || null,
          };

          console.log('[LIFEFILE] Setting state with:', JSON.stringify({
            inboundEnabled: newState.lifefileInboundEnabled,
            inboundPath: newState.lifefileInboundPath,
            inboundUsername: newState.lifefileInboundUsername,
          }, null, 2));

          setLifefileSettings(newState);
        }
      } else {
        console.error('Failed to fetch Lifefile settings:', response.status);
        setLifefileMessage({ type: 'error', text: 'Failed to load settings. Please refresh the page.' });
      }
    } catch (error) {
      console.error('Error fetching Lifefile settings:', error);
      setLifefileMessage({ type: 'error', text: 'Failed to load settings. Please refresh the page.' });
    } finally {
      setLoadingLifefile(false);
    }
  };

  const handleSaveLifefile = async () => {
    setSavingLifefile(true);
    setLifefileMessage(null);
    
    // Only send fields that the API expects (exclude computed fields)
    const savePayload = {
      // Outbound settings
      lifefileEnabled: lifefileSettings.lifefileEnabled,
      lifefileBaseUrl: lifefileSettings.lifefileBaseUrl || null,
      lifefileUsername: lifefileSettings.lifefileUsername || null,
      lifefilePassword: lifefileSettings.lifefilePassword || null,
      lifefileVendorId: lifefileSettings.lifefileVendorId || null,
      lifefilePracticeId: lifefileSettings.lifefilePracticeId || null,
      lifefileLocationId: lifefileSettings.lifefileLocationId || null,
      lifefileNetworkId: lifefileSettings.lifefileNetworkId || null,
      lifefilePracticeName: lifefileSettings.lifefilePracticeName || null,
      lifefilePracticeAddress: lifefileSettings.lifefilePracticeAddress || null,
      lifefilePracticePhone: lifefileSettings.lifefilePracticePhone || null,
      lifefilePracticeFax: lifefileSettings.lifefilePracticeFax || null,
      // Inbound settings
      lifefileInboundEnabled: lifefileSettings.lifefileInboundEnabled,
      lifefileInboundPath: lifefileSettings.lifefileInboundPath || null,
      lifefileInboundUsername: lifefileSettings.lifefileInboundUsername || null,
      lifefileInboundPassword: lifefileSettings.lifefileInboundPassword || null,
      lifefileInboundSecret: lifefileSettings.lifefileInboundSecret || null,
      lifefileInboundAllowedIPs: lifefileSettings.lifefileInboundAllowedIPs || null,
      lifefileInboundEvents: lifefileSettings.lifefileInboundEvents || [],
    };
    
    // Debug: Log what we're about to save
    console.log('[LIFEFILE SAVE] Sending to API:', JSON.stringify({
      inboundEnabled: savePayload.lifefileInboundEnabled,
      inboundPath: savePayload.lifefileInboundPath,
      inboundUsername: savePayload.lifefileInboundUsername,
      inboundPassword: savePayload.lifefileInboundPassword ? '[SET]' : '[EMPTY]',
      inboundEvents: savePayload.lifefileInboundEvents,
    }, null, 2));
    
    // DEBUG ALERT to show what we're sending
    alert('ABOUT TO SAVE:\\n' +
      'inboundEnabled: ' + savePayload.lifefileInboundEnabled + '\\n' +
      'inboundPath: ' + savePayload.lifefileInboundPath + '\\n' +
      'inboundUsername: ' + savePayload.lifefileInboundUsername + '\\n' +
      'inboundPassword: ' + (savePayload.lifefileInboundPassword ? '[SET]' : '[EMPTY]') + '\\n' +
      'inboundEvents: ' + JSON.stringify(savePayload.lifefileInboundEvents)
    );
    
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(savePayload),
      });

      if (response.ok) {
        const savedData = await response.json();
        console.log('[LIFEFILE SAVE] Save successful:', JSON.stringify(savedData, null, 2));
        
        // DEBUG ALERT to show what was saved
        alert('SAVE SUCCESSFUL!\\n' + 
          'Server returned inboundEnabled: ' + savedData.clinic?.lifefileInboundEnabled + '\\n' +
          'Server returned inboundPath: ' + savedData.clinic?.lifefileInboundPath + '\\n' +
          'Server returned inboundEvents: ' + JSON.stringify(savedData.clinic?.lifefileInboundEvents)
        );
        
        setLifefileMessage({ type: 'success', text: 'Pharmacy settings saved successfully!' });
        // Re-fetch to get the latest data from server
        await fetchLifefileSettings();
      } else {
        const data = await response.json();
        setLifefileMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setLifefileMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSavingLifefile(false);
    }
  };

  const handleTestLifefile = async () => {
    setTestingLifefile(true);
    setLifefileMessage(null);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testType: 'outbound' }),
      });

      const data = await response.json();
      if (data.success) {
        setLifefileMessage({ type: 'success', text: 'Connection test successful! Lifefile is configured correctly.' });
      } else {
        setLifefileMessage({ type: 'error', text: data.detail || data.error || 'Connection test failed' });
      }
    } catch (error) {
      setLifefileMessage({ type: 'error', text: 'Failed to test connection' });
    } finally {
      setTestingLifefile(false);
    }
  };

  const handleTestInbound = async () => {
    setTestingInbound(true);
    setInboundMessage(null);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}/lifefile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testType: 'inbound' }),
      });

      const data = await response.json();
      if (data.success) {
        setInboundMessage({ type: 'success', text: data.message || 'Inbound webhook test successful!' });
      } else {
        const errorDetails = data.details ? `: ${data.details.join(', ')}` : '';
        setInboundMessage({ type: 'error', text: (data.error || 'Test failed') + errorDetails });
      }
    } catch (error) {
      setInboundMessage({ type: 'error', text: 'Failed to test inbound webhook' });
    } finally {
      setTestingInbound(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          subdomain: formData.subdomain,
          customDomain: formData.customDomain || null,
          adminEmail: formData.adminEmail,
          phone: formData.phone || null,
          address: formData.address || null,
          primaryColor: formData.primaryColor,
          secondaryColor: formData.secondaryColor,
          accentColor: formData.accentColor,
          buttonTextColor: formData.buttonTextColor,
          logoUrl: formData.logoUrl || null,
          iconUrl: formData.iconUrl || null,
          faviconUrl: formData.faviconUrl || null,
          billingPlan: formData.plan,
          status: formData.isActive ? 'ACTIVE' : 'INACTIVE',
          features: formData.features,
        }),
      });

      if (response.ok) {
        alert('Clinic settings saved successfully!');
        fetchClinic(); // Refresh data
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save clinic settings');
      }
    } catch (error) {
      console.error('Error saving clinic:', error);
      alert('Failed to save clinic settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this clinic? This action cannot be undone.')) {
      return;
    }

    try {
      const token = localStorage.getItem('auth-token');
      const response = await fetch(`/api/super-admin/clinics/${clinicId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        router.push('/super-admin/clinics');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete clinic');
      }
    } catch (error) {
      console.error('Error deleting clinic:', error);
      alert('Failed to delete clinic');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#efece7] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!clinic) {
    return (
      <div className="min-h-screen bg-[#efece7] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900">Clinic not found</h2>
          <Link href="/super-admin/clinics" className="text-teal-600 hover:underline mt-2 inline-block">
            Back to clinics
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#efece7]">
      <div className="bg-transparent border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/super-admin/clinics"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="h-5 w-5 text-gray-600" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">{clinic.name}</h1>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    clinic.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {clinic.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-1">
                  {clinic.subdomain}.eonpro.io
                  {clinic.customDomain && (
                    <span className="ml-2">• {clinic.customDomain}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleDelete}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="flex gap-6 mt-6 border-b border-gray-200 -mb-px overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: Building2 },
              { id: 'branding', label: 'Branding', icon: Palette },
              { id: 'features', label: 'Features', icon: Settings },
              { id: 'pharmacy', label: 'Pharmacy', icon: Pill, highlight: true },
              { id: 'users', label: 'Users', icon: Users },
              { id: 'settings', label: 'Settings', icon: Globe },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as typeof activeTab);
                  // Update URL to preserve tab state on refresh
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', tab.id);
                  window.history.replaceState({}, '', url.toString());
                }}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-teal-600 text-teal-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{clinic.stats.patients.toLocaleString()}</p>
                    <p className="text-gray-500 text-sm">Total Patients</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <Activity className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{clinic.stats.providers}</p>
                    <p className="text-gray-500 text-sm">Providers</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl p-6 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Calendar className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{clinic.stats.appointments.toLocaleString()}</p>
                    <p className="text-gray-500 text-sm">Total Appointments</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Clinic Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                  <input
                    type="email"
                    value={formData.adminEmail}
                    onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  >
                    <option value="starter">Starter</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'branding' && (
          <div className="space-y-6">
            {/* Domain Settings */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-teal-600" />
                Domain Settings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain</label>
                  <div className="flex">
                    <input
                      type="text"
                      value={formData.subdomain}
                      onChange={(e) => setFormData({ ...formData, subdomain: e.target.value })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                    <span className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500">
                      .eonpro.io
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain (optional)</label>
                  <input
                    type="text"
                    value={formData.customDomain}
                    onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                    placeholder="app.yourclinic.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Branding Assets */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-teal-600" />
                Branding Assets
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Upload your clinic's logo, icon, and favicon to white-label the platform for your members.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <BrandingImageUploader
                  label="Logo"
                  description="Main logo displayed in header and emails"
                  imageUrl={formData.logoUrl || null}
                  onImageChange={(url) => setFormData({ ...formData, logoUrl: url || '' })}
                  imageType="logo"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  maxSizeMB={2}
                  recommendedSize="Recommended: 400x100px, transparent PNG or SVG"
                  clinicId={parseInt(clinicId as string)}
                />

                <BrandingImageUploader
                  label="App Icon"
                  description="Square icon for mobile apps and PWA"
                  imageUrl={formData.iconUrl || null}
                  onImageChange={(url) => setFormData({ ...formData, iconUrl: url || '' })}
                  imageType="icon"
                  accept="image/png,image/jpeg"
                  maxSizeMB={1}
                  recommendedSize="Required: 192x192px square PNG"
                  clinicId={parseInt(clinicId as string)}
                />

                <BrandingImageUploader
                  label="Favicon"
                  description="Small icon shown in browser tabs"
                  imageUrl={formData.faviconUrl || null}
                  onImageChange={(url) => setFormData({ ...formData, faviconUrl: url || '' })}
                  imageType="favicon"
                  accept="image/png,image/x-icon,.ico"
                  maxSizeMB={0.1}
                  recommendedSize="Required: 32x32px or 16x16px"
                  clinicId={parseInt(clinicId as string)}
                />
              </div>
            </div>

            {/* Brand Colors */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Palette className="h-5 w-5 text-teal-600" />
                Brand Colors
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Define your clinic's color palette for a consistent brand experience.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                  <p className="text-xs text-gray-500 mb-2">Main brand color for buttons and links</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(formData.primaryColor) ? formData.primaryColor : '#10B981'}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.primaryColor}
                      onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                      placeholder="#10B981"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                  <p className="text-xs text-gray-500 mb-2">Supporting color for backgrounds</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(formData.secondaryColor) ? formData.secondaryColor : '#3B82F6'}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.secondaryColor}
                      onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                      placeholder="#3B82F6"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                  <p className="text-xs text-gray-500 mb-2">Highlight color for badges and alerts</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={/^#[0-9A-Fa-f]{6}$/.test(formData.accentColor) ? formData.accentColor : '#d3f931'}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                      className="w-12 h-10 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.accentColor}
                      onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                      placeholder="#d3f931"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Button Text Color */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">Button Text Color</label>
                <p className="text-xs text-gray-500 mb-3">
                  Control the text color inside buttons. Auto mode calculates based on background brightness.
                </p>
                <div className="flex gap-3">
                  {[
                    { value: 'auto', label: 'Auto', desc: 'Calculate from background' },
                    { value: 'light', label: 'Light (White)', desc: 'Always use white text' },
                    { value: 'dark', label: 'Dark (Black)', desc: 'Always use dark text' },
                  ].map((option) => (
                    <label
                      key={option.value}
                      className={`flex-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.buttonTextColor === option.value
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="buttonTextColor"
                        value={option.value}
                        checked={formData.buttonTextColor === option.value}
                        onChange={(e) => setFormData({
                          ...formData,
                          buttonTextColor: e.target.value as 'auto' | 'light' | 'dark'
                        })}
                        className="sr-only"
                      />
                      <div className="text-sm font-medium text-gray-900">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.desc}</div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Live Preview */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Live Preview</h3>
              <div className="bg-gray-100 rounded-xl p-6">
                {/* Header Preview */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                  <div className="flex items-center gap-3">
                    {formData.logoUrl ? (
                      <img src={formData.logoUrl} alt="Logo" className="h-10 max-w-[150px] object-contain" />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center font-bold"
                        style={{
                          backgroundColor: formData.primaryColor,
                          color: getTextColorForBg(formData.primaryColor, formData.buttonTextColor)
                        }}
                      >
                        {formData.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold" style={{ color: formData.primaryColor }}>{formData.name}</p>
                      <p className="text-xs text-gray-500">{formData.subdomain}.eonpro.io</p>
                    </div>
                  </div>
                </div>

                {/* UI Elements Preview */}
                <div className="bg-white rounded-lg shadow-sm p-4">
                  <div className="flex flex-wrap gap-3 mb-4">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        backgroundColor: formData.primaryColor,
                        color: getTextColorForBg(formData.primaryColor, formData.buttonTextColor)
                      }}
                    >
                      Primary Button
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        backgroundColor: formData.secondaryColor,
                        color: getTextColorForBg(formData.secondaryColor, formData.buttonTextColor)
                      }}
                    >
                      Secondary Button
                    </button>
                    <span
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: formData.accentColor,
                        color: getTextColorForBg(formData.accentColor, formData.buttonTextColor)
                      }}
                    >
                      Accent Badge
                    </span>
                  </div>

                  {/* Color Swatches */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500 mr-2">Color Palette:</span>
                    <div
                      className="w-8 h-8 rounded-lg shadow-inner"
                      style={{ backgroundColor: formData.primaryColor }}
                      title="Primary"
                    />
                    <div
                      className="w-8 h-8 rounded-lg shadow-inner"
                      style={{ backgroundColor: formData.secondaryColor }}
                      title="Secondary"
                    />
                    <div
                      className="w-8 h-8 rounded-lg shadow-inner border border-gray-200"
                      style={{ backgroundColor: formData.accentColor }}
                      title="Accent"
                    />
                    {(formData.iconUrl || formData.faviconUrl) && (
                      <>
                        <span className="text-xs text-gray-500 ml-4 mr-2">Icons:</span>
                        {formData.iconUrl && (
                          <img src={formData.iconUrl} alt="Icon" className="w-8 h-8 rounded" />
                        )}
                        {formData.faviconUrl && (
                          <img src={formData.faviconUrl} alt="Favicon" className="w-4 h-4" />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'features' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Enabled Features</h3>
              <div className="space-y-4">
                {[
                  { key: 'telehealth', label: 'Telehealth', description: 'Video consultations and virtual visits' },
                  { key: 'messaging', label: 'Secure Messaging', description: 'HIPAA-compliant patient messaging' },
                  { key: 'billing', label: 'Billing & Payments', description: 'Invoice and payment processing' },
                  { key: 'pharmacy', label: 'Pharmacy Integration', description: 'E-prescriptions and pharmacy network' },
                  { key: 'ai', label: 'AI Assistant (Becca)', description: 'AI-powered clinical assistance' },
                ].map((feature) => (
                  <div
                    key={feature.key}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{feature.label}</p>
                      <p className="text-sm text-gray-500">{feature.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.features[feature.key as keyof typeof formData.features]}
                        onChange={(e) => setFormData({
                          ...formData,
                          features: {
                            ...formData.features,
                            [feature.key]: e.target.checked
                          }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PHARMACY / LIFEFILE INTEGRATION TAB */}
        {activeTab === 'pharmacy' && (
          <div className="space-y-6">
            {/* Status Banner */}
            <div className={`rounded-xl p-6 border-2 ${
              lifefileSettings.lifefileEnabled && lifefileSettings.hasCredentials
                ? 'bg-green-50 border-green-200'
                : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${
                    lifefileSettings.lifefileEnabled && lifefileSettings.hasCredentials
                      ? 'bg-green-100'
                      : 'bg-amber-100'
                  }`}>
                    {lifefileSettings.lifefileEnabled && lifefileSettings.hasCredentials ? (
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    ) : (
                      <XCircle className="h-8 w-8 text-amber-600" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {lifefileSettings.lifefileEnabled && lifefileSettings.hasCredentials
                        ? 'Pharmacy Integration Active'
                        : 'Pharmacy Integration Not Configured'}
                    </h2>
                    <p className="text-gray-600">
                      {lifefileSettings.lifefileEnabled && lifefileSettings.hasCredentials
                        ? 'This clinic can send prescriptions to Logos Pharmacy via Lifefile'
                        : 'Configure Lifefile credentials to enable e-prescribing'}
                    </p>
                  </div>
                </div>
                {lifefileSettings.hasCredentials && (
                  <button
                    onClick={handleTestLifefile}
                    disabled={testingLifefile}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Zap className="h-4 w-4" />
                    {testingLifefile ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            {lifefileMessage && (
              <div className={`p-4 rounded-lg ${
                lifefileMessage.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {lifefileMessage.text}
              </div>
            )}

            {loadingLifefile ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600"></div>
              </div>
            ) : (
              <>
                {/* Enable Toggle */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-purple-100 rounded-lg">
                        <Pill className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Enable Lifefile Integration</h3>
                        <p className="text-sm text-gray-500">
                          When enabled, prescriptions from this clinic will be sent through Lifefile to Logos Pharmacy
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={lifefileSettings.lifefileEnabled}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-teal-600"></div>
                    </label>
                  </div>
                </div>

                {/* API Credentials */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-6">
                    <Shield className="h-5 w-5 text-blue-600" />
                    <h3 className="text-lg font-semibold text-gray-900">API Credentials</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">From Lifefile</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Base URL *
                      </label>
                      <input
                        type="url"
                        value={lifefileSettings.lifefileBaseUrl}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileBaseUrl: e.target.value })}
                        placeholder="https://host47a.lifefile.net:10165/lfapi/v1"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Username *
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefileUsername}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileUsername: e.target.value })}
                        placeholder="api11596-3"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Password *
                      </label>
                      <input
                        type="password"
                        value={lifefileSettings.lifefilePassword}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefilePassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      <p className="text-xs text-gray-500 mt-1">Leave as •••••••• to keep existing password</p>
                    </div>
                  </div>
                </div>

                {/* Account IDs */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-6">
                    <FileText className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Account Identifiers</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Vendor ID *
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefileVendorId}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileVendorId: e.target.value })}
                        placeholder="11596"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Practice ID *
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefilePracticeId}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefilePracticeId: e.target.value })}
                        placeholder="1270268"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location ID * <span className="text-gray-400">(Logos Pharmacy = 110396)</span>
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefileLocationId}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileLocationId: e.target.value })}
                        placeholder="110396"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Network ID *
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefileNetworkId}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileNetworkId: e.target.value })}
                        placeholder="1592"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Practice Information */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center gap-3 mb-6">
                    <Building2 className="h-5 w-5 text-purple-600" />
                    <h3 className="text-lg font-semibold text-gray-900">Practice Information</h3>
                    <span className="text-xs text-gray-500">Appears on prescriptions</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Practice Name
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefilePracticeName}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefilePracticeName: e.target.value })}
                        placeholder="SIPAMED LLC"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Practice Address
                      </label>
                      <input
                        type="text"
                        value={lifefileSettings.lifefilePracticeAddress}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefilePracticeAddress: e.target.value })}
                        placeholder="123 Medical Center Dr, Suite 100, City, ST 12345"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Practice Phone
                      </label>
                      <input
                        type="tel"
                        value={lifefileSettings.lifefilePracticePhone}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefilePracticePhone: e.target.value })}
                        placeholder="555-555-5555"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Practice Fax
                      </label>
                      <input
                        type="tel"
                        value={lifefileSettings.lifefilePracticeFax}
                        onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefilePracticeFax: e.target.value })}
                        placeholder="555-555-5556"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Features Info */}
                <div className="bg-gradient-to-br from-teal-50 to-blue-50 rounded-xl p-6 border border-teal-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Zap className="h-5 w-5 text-teal-600" />
                    What's Included with Pharmacy Integration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { icon: FileText, label: 'PDF64 e-Script Generation', desc: 'Automatic prescription PDF creation' },
                      { icon: Shield, label: 'Doctor Signature Attachment', desc: 'Digital signatures on prescriptions' },
                      { icon: Pill, label: 'Direct Pharmacy Submission', desc: 'Send directly to Logos Pharmacy' },
                      { icon: Activity, label: 'Real-time Status Updates', desc: 'Track prescription fulfillment' },
                    ].map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-white/60 rounded-lg">
                        <feature.icon className="h-5 w-5 text-teal-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-gray-900">{feature.label}</p>
                          <p className="text-sm text-gray-500">{feature.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inbound Webhook Settings - Receive FROM Lifefile */}
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-100 rounded-lg">
                          <Activity className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">Inbound Webhook Settings</h3>
                          <p className="text-sm text-gray-500">
                            Configure this clinic to receive data FROM Lifefile (shipping updates, prescription status, etc.)
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={lifefileSettings.lifefileInboundEnabled}
                          onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileInboundEnabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    {/* Webhook URL Display */}
                    {lifefileSettings.inboundWebhookUrl && (
                      <div className="bg-blue-50 rounded-lg p-4 mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Webhook URL (share this with Lifefile)
                        </label>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-white border rounded px-3 py-2 text-sm font-mono break-all">
                            {lifefileSettings.inboundWebhookUrl}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(lifefileSettings.inboundWebhookUrl || '');
                              setCopiedInboundUrl(true);
                              setTimeout(() => setCopiedInboundUrl(false), 2000);
                            }}
                            className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap flex items-center gap-1"
                          >
                            {copiedInboundUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            {copiedInboundUrl ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Webhook Path *
                        </label>
                        <div className="flex items-center">
                          <span className="text-gray-500 text-sm mr-2 whitespace-nowrap">/api/webhooks/lifefile/inbound/</span>
                          <input
                            type="text"
                            value={lifefileSettings.lifefileInboundPath}
                            onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileInboundPath: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                            placeholder={lifefileSettings.slug || 'clinic-slug'}
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Unique identifier for this clinic&apos;s webhook endpoint (letters, numbers, hyphens, underscores only)
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Username *
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={lifefileSettings.lifefileInboundUsername}
                            onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileInboundUsername: e.target.value })}
                            placeholder="Webhook auth username"
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const username = `${lifefileSettings.lifefileInboundPath || lifefileSettings.slug || 'clinic'}_webhook`;
                              setLifefileSettings({ ...lifefileSettings, lifefileInboundUsername: username });
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap"
                          >
                            Generate
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password *
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={lifefileSettings.lifefileInboundPassword}
                            onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileInboundPassword: e.target.value })}
                            placeholder="Webhook auth password"
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
                              let password = '';
                              for (let i = 0; i < 16; i++) {
                                password += chars.charAt(Math.floor(Math.random() * chars.length));
                              }
                              setLifefileSettings({ ...lifefileSettings, lifefileInboundPassword: password });
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap"
                          >
                            Generate
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Leave empty to keep existing</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          HMAC Secret (Optional)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={lifefileSettings.lifefileInboundSecret}
                            onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileInboundSecret: e.target.value })}
                            placeholder="HMAC-SHA256 signing secret"
                            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789';
                              let secret = '';
                              for (let i = 0; i < 32; i++) {
                                secret += chars.charAt(Math.floor(Math.random() * chars.length));
                              }
                              setLifefileSettings({ ...lifefileSettings, lifefileInboundSecret: secret });
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm whitespace-nowrap"
                          >
                            Generate
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">For additional signature verification</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Allowed IP Addresses (Optional)
                        </label>
                        <input
                          type="text"
                          value={lifefileSettings.lifefileInboundAllowedIPs}
                          onChange={(e) => setLifefileSettings({ ...lifefileSettings, lifefileInboundAllowedIPs: e.target.value })}
                          placeholder="e.g., 192.168.1.1, 10.0.0.0/8"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">Comma-separated list of allowed IPs or CIDR ranges</p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Allowed Event Types
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { value: 'shipping', label: 'Shipping Updates', Icon: Package },
                            { value: 'prescription', label: 'Prescription Status', Icon: Pill },
                            { value: 'order', label: 'Order Status', Icon: ClipboardList },
                            { value: 'rx', label: 'Rx Events', Icon: FileText },
                          ].map((event) => {
                            const isChecked = lifefileSettings.lifefileInboundEvents.includes(event.value);
                            const IconComponent = event.Icon;
                            return (
                              <button
                                key={event.value}
                                type="button"
                                onClick={() => {
                                  const events = isChecked
                                    ? lifefileSettings.lifefileInboundEvents.filter(e => e !== event.value)
                                    : [...lifefileSettings.lifefileInboundEvents, event.value];
                                  setLifefileSettings({ ...lifefileSettings, lifefileInboundEvents: events });
                                }}
                                className={`
                                  relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all
                                  ${isChecked
                                    ? 'border-green-500 bg-green-50 shadow-md'
                                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                                  }
                                `}
                              >
                                {/* Large checkmark badge */}
                                {isChecked && (
                                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                                    <Check className="w-5 h-5 text-white" strokeWidth={3} />
                                  </div>
                                )}
                                <IconComponent className={`w-8 h-8 mb-2 ${isChecked ? 'text-green-600' : 'text-gray-500'}`} />
                                <span className={`text-sm font-medium text-center ${isChecked ? 'text-green-700' : 'text-gray-700'}`}>
                                  {event.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Click to select multiple event types</p>
                      </div>
                    </div>

                    {/* Sample cURL */}
                    {lifefileSettings.lifefileInboundPath && lifefileSettings.lifefileInboundUsername && (
                      <div className="mt-6 bg-gray-900 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-400">Sample cURL command for Lifefile:</span>
                        </div>
                        <code className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">
{`curl -X POST https://app.eonpro.io/api/webhooks/lifefile/inbound/${lifefileSettings.lifefileInboundPath} \\
  -H "Authorization: Basic $(echo -n '${lifefileSettings.lifefileInboundUsername}:YOUR_PASSWORD' | base64)" \\
  -H "Content-Type: application/json" \\
  -d '{"type": "shipping", "trackingNumber": "1Z999AA10123456784", "orderId": "12345"}'`}
                        </code>
                      </div>
                    )}

                    {/* Inbound Test Message */}
                    {inboundMessage && (
                      <div className={`mt-4 p-4 rounded-lg ${inboundMessage.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                        <div className="flex items-center gap-2">
                          {inboundMessage.type === 'success' ? (
                            <Check className="h-5 w-5 text-green-600" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-600" />
                          )}
                          <span>{inboundMessage.text}</span>
                        </div>
                      </div>
                    )}

                    {/* Test Inbound Button */}
                    <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-200">
                      <div className="text-sm text-gray-500">
                        Test your inbound webhook configuration
                      </div>
                      <button
                        onClick={handleTestInbound}
                        disabled={testingInbound || !lifefileSettings.lifefileInboundPath || !lifefileSettings.lifefileInboundUsername}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Zap className="h-4 w-4" />
                        {testingInbound ? 'Testing...' : 'Test Inbound Webhook'}
                      </button>
                    </div>
                  </div>

                {/* Save Button */}
                <div className="flex items-center justify-between bg-white rounded-xl p-6 border border-gray-200">
                  <div className="text-sm text-gray-500">
                    All credentials are encrypted and stored securely (AES-256)
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleTestLifefile}
                      disabled={testingLifefile || !lifefileSettings.lifefileBaseUrl || !lifefileSettings.lifefileUsername}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {testingLifefile ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button
                      onClick={handleSaveLifefile}
                      disabled={savingLifefile}
                      className="px-8 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <Save className="h-5 w-5" />
                      {savingLifefile ? 'Saving...' : 'Save Pharmacy Settings'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Clinic Users</h3>
                  <p className="text-sm text-gray-500">Manage administrators, providers, and staff for this clinic</p>
                </div>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Add User
                </button>
              </div>

              {loadingUsers ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                </div>
              ) : clinicUsers.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No users yet</h4>
                  <p className="text-gray-500 mb-4">Add the first administrator to get started</p>
                  <button
                    onClick={() => setShowAddUserModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors inline-flex items-center gap-2"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add First User
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">User</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Role</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Last Login</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clinicUsers.map((user) => (
                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                                <span className="text-teal-700 font-medium">
                                  {user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">
                                  {user.firstName} {user.lastName}
                                </p>
                                <p className="text-sm text-gray-500">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.role === 'admin' || user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                              user.role === 'provider' || user.role === 'PROVIDER' ? 'bg-blue-100 text-blue-700' :
                              user.role === 'staff' || user.role === 'STAFF' ? 'bg-green-100 text-green-700' :
                              user.role === 'sales_rep' || user.role === 'SALES_REP' ? 'bg-amber-100 text-amber-700' :
                              user.role === 'support' || user.role === 'SUPPORT' ? 'bg-cyan-100 text-cyan-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                              user.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">
                            {user.lastLogin
                              ? new Date(user.lastLogin).toLocaleDateString()
                              : 'Never'}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              onClick={() => openEditUserModal(user)}
                              className="text-amber-600 hover:text-amber-800 text-sm font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setResetPasswordModal({
                                show: true,
                                userId: user.id,
                                userName: `${user.firstName} ${user.lastName}`
                              })}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              Reset Password
                            </button>
                            <button
                              onClick={() => window.open(`/super-admin/users/${user.id}/clinics`, '_blank')}
                              className="text-teal-600 hover:text-teal-800 text-sm font-medium"
                              title="Manage clinic assignments"
                            >
                              Clinics
                            </button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Clinic Status</h3>
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Active Status</p>
                  <p className="text-sm text-gray-500">Enable or disable this clinic</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                </label>
              </div>
            </div>

            {/* Patient Registration Codes */}
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Key className="h-5 w-5 text-teal-600" />
                    Patient Registration Codes
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Codes patients use to register at <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">app.eonpro.io/register</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowAddInviteCodeModal(true)}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Code
                </button>
              </div>

              {loadingInviteCodes ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                </div>
              ) : inviteCodes.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <Key className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <h4 className="font-medium text-gray-900 mb-1">No invite codes yet</h4>
                  <p className="text-sm text-gray-500 mb-4">Create a code so patients can register for this clinic</p>
                  <button
                    onClick={() => setShowAddInviteCodeModal(true)}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create First Code
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {inviteCodes.map((code) => (
                    <div
                      key={code.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        code.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono text-lg font-bold ${code.isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                            {code.code}
                          </span>
                          <button
                            onClick={() => copyToClipboard(code.code)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Copy code"
                          >
                            {copiedCode === code.code ? (
                              <Check className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <div>
                          {code.description && (
                            <p className="text-sm text-gray-600">{code.description}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            <span>
                              Used: {code.usageCount}{code.usageLimit ? `/${code.usageLimit}` : ' (unlimited)'}
                            </span>
                            {code.expiresAt && (
                              <span>
                                Expires: {new Date(code.expiresAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          code.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {code.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={code.isActive}
                            onChange={() => handleToggleInviteCode(code.id, code.isActive)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                        </label>
                        <button
                          onClick={() => handleDeleteInviteCode(code.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete code"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Danger Zone</h3>
              <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">Delete this clinic</p>
                    <p className="text-sm text-red-600 mt-1">
                      Once you delete a clinic, there is no going back. All data will be permanently removed.
                    </p>
                    <button
                      onClick={handleDelete}
                      className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      Delete Clinic
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 my-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {newUser.role === 'PROVIDER' ? 'Add New Provider' : 'Add New User'}
              </h3>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Role Selection First */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="ADMIN">Admin - Full clinic access</option>
                  <option value="PROVIDER">Provider - Patient care & prescriptions</option>
                  <option value="STAFF">Staff - Limited administrative access</option>
                  <option value="SUPPORT">Support - Customer service access</option>
                  <option value="SALES_REP">Sales Rep - Patient assignment & tracking</option>
                </select>
              </div>

              {/* Provider-specific fields */}
              {newUser.role === 'PROVIDER' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <h4 className="font-medium text-blue-900 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Provider Credentials
                  </h4>

                  {/* NPI Lookup */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NPI Number *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required={newUser.role === 'PROVIDER'}
                        value={newUser.npi}
                        onChange={(e) => setNewUser({ ...newUser, npi: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="10-digit NPI"
                        maxLength={10}
                      />
                      <button
                        type="button"
                        onClick={lookupNpi}
                        disabled={lookingUpNpi || newUser.npi.length !== 10}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm whitespace-nowrap"
                      >
                        {lookingUpNpi ? 'Looking up...' : 'Lookup NPI'}
                      </button>
                    </div>
                    {npiError && (
                      <p className="text-xs text-red-600 mt-1">{npiError}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1">Enter NPI and click lookup to auto-fill provider info</p>
                  </div>

                  {/* DEA Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">DEA Number</label>
                    <input
                      type="text"
                      value={newUser.deaNumber}
                      onChange={(e) => setNewUser({ ...newUser, deaNumber: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="e.g., AB1234567"
                      maxLength={9}
                    />
                    <p className="text-xs text-gray-500 mt-1">Required for prescribing controlled substances</p>
                  </div>

                  {/* License */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Number *</label>
                      <input
                        type="text"
                        required={newUser.role === 'PROVIDER'}
                        value={newUser.licenseNumber}
                        onChange={(e) => setNewUser({ ...newUser, licenseNumber: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="License #"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                      <select
                        required={newUser.role === 'PROVIDER'}
                        value={newUser.licenseState}
                        onChange={(e) => setNewUser({ ...newUser, licenseState: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">Select State</option>
                        {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Specialty */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                    <input
                      type="text"
                      value={newUser.specialty}
                      onChange={(e) => setNewUser({ ...newUser, specialty: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="e.g., Family Medicine, Internal Medicine"
                    />
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={newUser.firstName}
                    onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temporary Password *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 pr-10"
                    placeholder="Min 8 characters"
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">User will be prompted to change password on first login</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendInvite"
                  checked={newUser.sendInvite}
                  onChange={(e) => setNewUser({ ...newUser, sendInvite: e.target.checked })}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <label htmlFor="sendInvite" className="text-sm text-gray-700">
                  Send invitation email with login details
                </label>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addingUser ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" />
                      Create User
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {resetPasswordModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Reset Password
              </h3>
              <button
                onClick={() => {
                  setResetPasswordModal({ show: false, userId: null, userName: '' });
                  setNewPassword('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Set a new password for <span className="font-medium">{resetPasswordModal.userName}</span>
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Min 8 characters"
                  minLength={8}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setResetPasswordModal({ show: false, userId: null, userName: '' });
                    setNewPassword('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={resettingPassword || newPassword.length < 12}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Invite Code Modal */}
      {showAddInviteCodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Key className="h-5 w-5 text-teal-600" />
                Create Registration Code
              </h3>
              <button
                onClick={() => setShowAddInviteCodeModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleAddInviteCode} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code *
                </label>
                <input
                  type="text"
                  required
                  value={newInviteCode.code}
                  onChange={(e) => setNewInviteCode({
                    ...newInviteCode,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-mono uppercase"
                  placeholder="e.g., EONMEDS, WELCOME2026"
                  minLength={3}
                  maxLength={20}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Uppercase letters and numbers only. Patients will enter this at registration.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newInviteCode.description}
                  onChange={(e) => setNewInviteCode({ ...newInviteCode, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="e.g., Website registration, Marketing campaign"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Usage Limit (optional)
                </label>
                <input
                  type="number"
                  value={newInviteCode.usageLimit}
                  onChange={(e) => setNewInviteCode({ ...newInviteCode, usageLimit: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="Leave empty for unlimited"
                  min={1}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maximum number of times this code can be used
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Registration URL:</strong>{' '}
                  <span className="font-mono text-xs">app.eonpro.io/register</span>
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Share this URL along with the code for patient registration
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddInviteCodeModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingInviteCode || !newInviteCode.code}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {addingInviteCode ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Code
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUserModal.show && editUserModal.user && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 my-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit User: {editUserModal.user.firstName} {editUserModal.user.lastName}
              </h3>
              <button
                onClick={() => setEditUserModal({ show: false, user: null })}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editUserData.role}
                  onChange={(e) => setEditUserData({ ...editUserData, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="ADMIN">Admin - Full clinic access</option>
                  <option value="PROVIDER">Provider - Patient care & prescriptions</option>
                  <option value="STAFF">Staff - Limited administrative access</option>
                  <option value="SUPPORT">Support - Customer service access</option>
                  <option value="SALES_REP">Sales Rep - Patient assignment & tracking</option>
                </select>
              </div>

              {/* Provider credentials when role is PROVIDER */}
              {editUserData.role === 'PROVIDER' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
                  <h4 className="font-medium text-blue-900 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Provider Credentials
                  </h4>
                  <p className="text-sm text-blue-700">
                    Enter NPI to enable prescriptions for this provider in this clinic.
                  </p>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NPI Number *</label>
                    <input
                      type="text"
                      value={editUserData.npi}
                      onChange={(e) => setEditUserData({ ...editUserData, npi: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="10-digit NPI"
                      maxLength={10}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">DEA Number</label>
                    <input
                      type="text"
                      value={editUserData.deaNumber}
                      onChange={(e) => setEditUserData({ ...editUserData, deaNumber: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="e.g., AB1234567"
                      maxLength={9}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">License Number</label>
                      <input
                        type="text"
                        value={editUserData.licenseNumber}
                        onChange={(e) => setEditUserData({ ...editUserData, licenseNumber: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="License #"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <select
                        value={editUserData.licenseState}
                        onChange={(e) => setEditUserData({ ...editUserData, licenseState: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">Select State</option>
                        {['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'].map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Specialty</label>
                    <input
                      type="text"
                      value={editUserData.specialty}
                      onChange={(e) => setEditUserData({ ...editUserData, specialty: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="e.g., Family Medicine"
                    />
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editUserData.firstName}
                    onChange={(e) => setEditUserData({ ...editUserData, firstName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editUserData.lastName}
                    onChange={(e) => setEditUserData({ ...editUserData, lastName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editUserData.phone}
                  onChange={(e) => setEditUserData({ ...editUserData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editUserData.status}
                  onChange={(e) => setEditUserData({ ...editUserData, status: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setEditUserModal({ show: false, user: null })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editingUser}
                  className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {editingUser ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

