import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminAuditsPage() {
  // Verify user is authenticated and is a super admin
  const user = await getUserFromCookies();
  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent('/admin/audits'));
  }

  // Only super admins can access system-wide audit logs
  if (user.role !== 'super_admin') {
    logger.security('Unauthorized access attempt to admin audits page', {
      userId: user.id,
      userRole: user.role,
      clinicId: user.clinicId,
    });
    return (
      <div className="p-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="text-2xl font-bold text-red-700">Access Denied</h1>
          <p className="mt-2 text-red-600">
            You do not have permission to view this page. This page is restricted to super
            administrators only.
          </p>
          <Link href="/admin" className="mt-4 inline-block text-[#4fa77e] underline">
            ← Back to Admin
          </Link>
        </div>
      </div>
    );
  }

  let patientAudits;
  let providerAudits;

  try {
    // Get all patient audit entries (super admin sees all clinics)
    patientAudits = await prisma.patientAudit.findMany({
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            patientId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Get all provider audit entries
    providerAudits = await prisma.providerAudit.findMany({
      include: {
        provider: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            npi: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  } catch (dbError) {
    logger.error('Database error fetching audit logs:', {
      userId: user.id,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return (
      <div className="p-10">
        <p className="text-red-600">Error loading audit data. Please try again.</p>
        <Link href="/admin" className="mt-4 block text-[#4fa77e] underline">
          ← Back to Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-10">
      <div>
        <h1 className="text-3xl font-bold">System Audit Logs</h1>
        <p className="mt-1 text-gray-600">Internal view for super administrators only</p>
      </div>

      {/* Security Notice */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center">
          <span className="font-semibold text-red-600">Restricted Access</span>
          <span className="ml-2 text-sm text-red-700">
            This page contains sensitive audit information and should only be accessible to super
            administrators.
          </span>
        </div>
      </div>

      {/* Patient Audits */}
      <section className="rounded-xl border bg-white shadow">
        <div className="border-b bg-gray-50 p-6">
          <h2 className="text-xl font-semibold">Patient Edit History</h2>
          <p className="mt-1 text-sm text-gray-600">All modifications to patient records</p>
        </div>
        <div className="p-6">
          {patientAudits.length === 0 ? (
            <p className="text-gray-500">No patient edits recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Patient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Changes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {patientAudits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {new Date(audit.createdAt).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {audit.patient ? (
                          <Link
                            href={`/patients/${audit.patient.id}?admin=true`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            {audit.patient.firstName} {audit.patient.lastName}
                            <span className="ml-1 text-gray-500">(#{audit.patient.patientId})</span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">Deleted</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {audit.actorEmail || 'System'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <details className="cursor-pointer">
                          <summary className="text-[#4fa77e] hover:underline">View changes</summary>
                          <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-gray-100 p-2 text-xs">
                            {JSON.stringify(audit.diff, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {audit.patient && (
                          <Link
                            href={`/patients/${audit.patient.id}?admin=true`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            View Patient
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Provider Audits */}
      <section className="rounded-xl border bg-white shadow">
        <div className="border-b bg-gray-50 p-6">
          <h2 className="text-xl font-semibold">Provider Edit History</h2>
          <p className="mt-1 text-sm text-gray-600">All modifications to provider records</p>
        </div>
        <div className="p-6">
          {providerAudits.length === 0 ? (
            <p className="text-gray-500">No provider edits recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Changes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {providerAudits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {new Date(audit.createdAt).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {audit.provider ? (
                          <Link
                            href={`/providers/${audit.provider.id}`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            Dr. {audit.provider.firstName} {audit.provider.lastName}
                            <span className="ml-1 text-gray-500">(NPI: {audit.provider.npi})</span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">Deleted</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {audit.actorEmail || 'System'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <details className="cursor-pointer">
                          <summary className="text-[#4fa77e] hover:underline">View changes</summary>
                          <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-gray-100 p-2 text-xs">
                            {JSON.stringify(audit.diff, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {audit.provider && (
                          <Link
                            href={`/providers/${audit.provider.id}`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            View Provider
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
