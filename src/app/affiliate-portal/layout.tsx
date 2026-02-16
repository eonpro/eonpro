'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  TrendingUp,
  DollarSign,
  Link as LinkIcon,
  Download,
  HelpCircle,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// Default logo
const DEFAULT_LOGO =
  'https://static.wixstatic.com/shapes/c49a9b_112e790eead84c2083bfc1871d0edaaa.svg';

interface ClinicBranding {
  clinicId: number;
  clinicName: string;
  affiliateName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  customCss: string | null;
  features: {
    showPerformanceChart: boolean;
    showRefCodeManager: boolean;
    showPayoutHistory: boolean;
    showResources: boolean;
  };
  supportEmail: string | null;
  supportPhone: string | null;
}

const mainNavItems = [
  { icon: Home, path: '/portal/affiliate', label: 'Dashboard', exact: true },
  { icon: TrendingUp, path: '/portal/affiliate/performance', label: 'Performance' },
  { icon: DollarSign, path: '/portal/affiliate/commissions', label: 'Commissions' },
  { icon: LinkIcon, path: '/portal/affiliate/ref-codes', label: 'Ref Codes' },
  { icon: Download, path: '/portal/affiliate/resources', label: 'Resources' },
  { icon: HelpCircle, path: '/portal/affiliate/support', label: 'Support' },
];

const mobileNavItems = [
  { icon: Home, path: '/portal/affiliate', label: 'Home', exact: true },
  { icon: TrendingUp, path: '/portal/affiliate/performance', label: 'Stats' },
  { icon: DollarSign, path: '/portal/affiliate/commissions', label: 'Earnings' },
  { icon: LinkIcon, path: '/portal/affiliate/ref-codes', label: 'Links' },
];

export default function AffiliatePortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [branding, setBranding] = useState<ClinicBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const checkAuthAndLoadBranding = async () => {
      const user = localStorage.getItem('user');
      const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');

      if (!user || !token) {
        router.push('/login?redirect=/portal/affiliate&reason=no_session');
        return;
      }

      try {
        const data = JSON.parse(user);

        // Verify user has affiliate role
        if (data.role?.toLowerCase() !== 'affiliate') {
          router.push('/login?redirect=/portal/affiliate&reason=invalid_role');
          return;
        }

        setUserData(data);

        // Fetch branding
        const response = await apiFetch('/api/affiliate/branding', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const brandingData = await response.json();
          setBranding(brandingData);

          // Apply branding to document
          if (brandingData.customCss) {
            let styleEl = document.getElementById('affiliate-custom-css');
            if (!styleEl) {
              styleEl = document.createElement('style');
              styleEl.id = 'affiliate-custom-css';
              document.head.appendChild(styleEl);
            }
            styleEl.textContent = brandingData.customCss;
          }

          // Update favicon
          if (brandingData.faviconUrl) {
            const favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
            if (favicon) {
              favicon.href = brandingData.faviconUrl;
            }
          }
        }
      } catch (e) {
        localStorage.removeItem('user');
        localStorage.removeItem('auth-token');
        localStorage.removeItem('affiliate-token');
        router.push('/login?redirect=/portal/affiliate&reason=invalid_session');
        return;
      }

      setIsLoading(false);
    };

    checkAuthAndLoadBranding();
  }, [router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');
    if (token)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    localStorage.removeItem('affiliate-token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  };

  const handleCopyLink = async () => {
    // Get primary ref code from localStorage or default
    const refCode = userData?.refCode || 'affiliate';
    const baseUrl = window.location.origin;
    const link = `${baseUrl}?ref=${refCode}`;

    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {
      console.error('Failed to copy link');
    }
  };

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return pathname === path;
    return pathname === path || pathname?.startsWith(path + '/');
  };

  const primaryColor = branding?.primaryColor || '#4fa77e';
  const accentColor = branding?.accentColor || '#A7F3D0';

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div
          className="h-10 w-10 animate-spin rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside
        className={`fixed bottom-0 left-0 top-0 z-50 hidden flex-col border-r border-gray-200 bg-white py-4 transition-all duration-300 lg:flex ${
          sidebarExpanded ? 'w-56' : 'w-20'
        }`}
      >
        <div className="mb-6 flex items-center justify-center px-4">
          <Link href="/portal/affiliate">
            <img
              src={branding?.logoUrl || DEFAULT_LOGO}
              alt={branding?.clinicName || 'Affiliate Portal'}
              className={`${sidebarExpanded ? 'h-10 w-auto max-w-[140px]' : 'h-10 w-10'} object-contain`}
            />
          </Link>
        </div>

        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className={`absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm transition-all hover:bg-gray-50 focus:outline-none ${
            sidebarExpanded ? 'rotate-180' : ''
          }`}
        >
          <ChevronRight className="h-3 w-3 text-gray-400" />
        </button>

        <nav className="flex flex-1 flex-col space-y-1 overflow-y-auto px-3">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.exact);
            return (
              <Link
                key={item.path}
                href={item.path}
                title={!sidebarExpanded ? item.label : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all ${
                  active ? 'text-white' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                style={active ? { backgroundColor: primaryColor } : {}}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {sidebarExpanded && (
                  <span className="whitespace-nowrap text-sm font-medium">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Quick Copy Link Button */}
        <div className="px-3 pb-2">
          <button
            onClick={handleCopyLink}
            title={!sidebarExpanded ? 'Copy Referral Link' : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all"
            style={{ backgroundColor: `${primaryColor}15`, color: primaryColor }}
          >
            {copiedLink ? (
              <Check className="h-5 w-5 flex-shrink-0" />
            ) : (
              <Copy className="h-5 w-5 flex-shrink-0" />
            )}
            {sidebarExpanded && (
              <span className="whitespace-nowrap text-sm font-medium">
                {copiedLink ? 'Copied!' : 'Copy Link'}
              </span>
            )}
          </button>
        </div>

        <div className="space-y-2 border-t border-gray-100 px-3 pt-4">
          {sidebarExpanded && branding && (
            <div className="truncate px-3 py-2 text-xs text-gray-500">{branding.affiliateName}</div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={!sidebarExpanded ? 'Sign Out' : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-gray-400 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {sidebarExpanded && (
              <span className="whitespace-nowrap text-sm font-medium">Sign Out</span>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="fixed left-0 right-0 top-0 z-50 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
          <Link href="/portal/affiliate" className="flex items-center gap-3">
            <img
              src={branding?.logoUrl || DEFAULT_LOGO}
              alt={branding?.clinicName || 'Affiliate Portal'}
              className="h-8 w-auto max-w-[120px] object-contain"
            />
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyLink}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100"
              style={{ color: copiedLink ? primaryColor : undefined }}
            >
              {copiedLink ? <Check className="h-6 w-6" /> : <Copy className="h-6 w-6" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed bottom-0 right-0 top-0 z-50 w-72 bg-white shadow-2xl lg:hidden">
            <div className="flex h-14 items-center justify-between border-b border-gray-100 px-4">
              <span className="text-lg font-semibold text-gray-900">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 active:bg-gray-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="space-y-1 p-3">
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path, item.exact);
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-4 rounded-2xl px-4 py-4 transition-all active:scale-[0.98] ${
                      active ? 'text-white' : 'text-gray-700 active:bg-gray-100'
                    }`}
                    style={active ? { backgroundColor: primaryColor } : {}}
                  >
                    <Icon className="h-6 w-6" />
                    <span className="text-base font-semibold">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 border-t border-gray-100 bg-gray-50 p-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-red-50 px-4 py-4 text-red-600 active:bg-red-100"
              >
                <LogOut className="h-6 w-6" />
                <span className="text-base font-semibold">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 lg:ml-20 ${sidebarExpanded ? 'lg:ml-56' : ''}`}
      >
        <div className="min-h-screen pb-24 pt-[56px] lg:pb-8 lg:pt-0">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg lg:hidden">
        <div className="border-t border-gray-200">
          <div className="mx-auto flex max-w-md justify-around">
            {mobileNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path, item.exact);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className="group relative flex flex-1 flex-col items-center py-2"
                >
                  {active && (
                    <div
                      className="absolute -top-[1px] left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    />
                  )}
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-all ${
                      active ? '' : 'group-active:bg-gray-100'
                    }`}
                    style={active ? { backgroundColor: `${primaryColor}15` } : {}}
                  >
                    <Icon
                      className="h-6 w-6 transition-transform group-active:scale-90"
                      style={{ color: active ? primaryColor : '#9ca3af' }}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </div>
                  <span
                    className={`mt-0.5 text-[11px] transition-all ${active ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: active ? primaryColor : '#9ca3af' }}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
