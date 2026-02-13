import { redirect } from 'next/navigation';
import EditProviderForm from '@/components/EditProviderForm';
import { prisma, runWithClinicContext } from '@/lib/db';
import { getUserFromCookies } from '@/lib/auth/session';
import { logger } from '@/lib/logger';
import Link from 'next/link';

// Force dynamic rendering for fresh data
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
};

export default async function ProviderDetailPage({ params }: Params) {
  // Verify user is authenticated via cookies
  const user = await getUserFromCookies();
  if (!user) {
    redirect('/login?redirect=' + encodeURIComponent('/providers'));
  }

  const resolvedParams = await params;
  const id = Number(resolvedParams.id);

  // Validate the ID
  if (isNaN(id) || id <= 0) {
    return (
      <div className="p-10">
        <p className="text-red-600">Invalid provider ID.</p>
        <Link href="/providers" className="mt-4 block text-[#4fa77e] underline">
          ← Back to providers
        </Link>
      </div>
    );
  }

  // Fetch provider with clinic context for proper isolation
  // Super admins can access any clinic, others are restricted to their clinic
  const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

  let provider;
  try {
    provider = await runWithClinicContext(clinicId, async () => {
      return prisma.provider.findUnique({
        where: { id },
        include: {
          clinic: {
            select: { id: true, name: true, subdomain: true },
          },
          orders: {
            orderBy: { createdAt: 'desc' },
            include: { patient: true, rxs: true },
            take: 25,
          },
          auditEntries: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });
    });
  } catch (dbError) {
    logger.error('Database error fetching provider:', {
      providerId: id,
      clinicId: clinicId,
      userId: user.id,
      error: dbError instanceof Error ? dbError.message : String(dbError),
    });
    return (
      <div className="p-10">
        <p className="text-red-600">Error loading provider data. Please try again.</p>
        <Link href="/providers" className="mt-4 block text-[#4fa77e] underline">
          ← Back to providers
        </Link>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="p-10">
        <p className="text-red-600">
          Provider not found or you don't have access to this provider.
        </p>
        <Link href="/providers" className="mt-4 block text-[#4fa77e] underline">
          ← Back to providers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-10">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">#PROVIDER</p>
          <h1 className="text-4xl font-bold">
            {provider.firstName} {provider.lastName}
          </h1>
          <p className="text-gray-600">
            {provider.titleLine ?? '—'} • NPI {provider.npi}
          </p>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p>
              License: {provider.licenseState ?? '—'} {provider.licenseNumber ?? ''}
            </p>
            <p>DEA: {provider.dea ?? '—'}</p>
            <p>
              Email: {provider.email ?? '—'} • Phone: {provider.phone ?? '—'}
            </p>
            {provider.clinic && (
              <p className="font-medium text-emerald-600">Clinic: {provider.clinic.name}</p>
            )}
          </div>
        </div>
      </div>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Edit Provider</h2>
          <EditProviderForm provider={provider} />
        </div>
        <div className="rounded-xl border bg-white p-6 shadow">
          <h2 className="mb-3 text-lg font-semibold">Snapshot</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>
              <strong>Verified:</strong>{' '}
              {provider.npiVerifiedAt
                ? new Date(provider.npiVerifiedAt).toLocaleString()
                : 'Pending'}
            </li>
            <li>
              <strong>Total Orders:</strong> {provider.orders.length}
            </li>
            <li>
              <strong>Last Order:</strong>{' '}
              {provider.orders[0] ? new Date(provider.orders[0].createdAt).toLocaleString() : '—'}
            </li>
          </ul>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Audit Log</h2>
        {provider.auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500">No edits recorded yet.</p>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            {provider.auditEntries.map((entry: any) => (
              <div key={entry.id} className="rounded-lg border bg-gray-50 p-3">
                <div className="mb-2 flex justify-between text-xs text-gray-500">
                  <span>{entry.actorEmail ?? 'Unknown actor'}</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <pre className="whitespace-pre-wrap rounded border bg-white p-2 text-xs">
                  {JSON.stringify(entry.diff, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Recent Orders</h2>
        {provider.orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2 text-left">Date</th>
                  <th className="border px-3 py-2 text-left">Patient</th>
                  <th className="border px-3 py-2 text-left">Medications</th>
                  <th className="border px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {provider.orders.map((order: any) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="border px-3 py-2">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="border px-3 py-2">
                      {order.patient ? `${order.patient.firstName} ${order.patient.lastName}` : '—'}
                    </td>
                    <td className="border px-3 py-2">
                      <ul className="list-inside list-disc space-y-1">
                        {order.rxs.map((rx: any) => (
                          <li key={rx.id}>
                            {rx.medName} • {rx.sig}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="border px-3 py-2 capitalize">{order.status ?? 'pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
