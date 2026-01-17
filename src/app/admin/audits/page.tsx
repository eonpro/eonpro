import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminAuditsPage() {
  // Get all patient audit entries
  const patientAudits = await prisma.patientAudit.findMany({
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
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Get all provider audit entries
  const providerAudits = await prisma.providerAudit.findMany({
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
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="p-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Audit Logs</h1>
          <p className="text-gray-600 mt-1">
            Internal view for super administrators only
          </p>
        </div>
        <Link
          href="/admin"
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          ← Back to Admin
        </Link>
      </div>

      {/* Security Notice */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-red-600 font-semibold">Restricted Access</span>
          <span className="ml-2 text-sm text-red-700">
            This page contains sensitive audit information and should only be accessible to super administrators.
          </span>
        </div>
      </div>

      {/* Patient Audits */}
      <section className="border rounded-xl bg-white shadow">
        <div className="p-6 border-b bg-gray-50">
          <h2 className="text-xl font-semibold">Patient Edit History</h2>
          <p className="text-sm text-gray-600 mt-1">
            All modifications to patient records
          </p>
        </div>
        <div className="p-6">
          {patientAudits.length === 0 ? (
            <p className="text-gray-500">No patient edits recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Changes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {patientAudits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {new Date(audit.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {audit.patient ? (
                          <Link
                            href={`/patients/${audit.patient.id}?admin=true`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            {audit.patient.firstName} {audit.patient.lastName}
                            <span className="text-gray-500 ml-1">
                              (#{audit.patient.patientId})
                            </span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">Deleted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {audit.actorEmail || "System"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <details className="cursor-pointer">
                          <summary className="text-[#4fa77e] hover:underline">
                            View changes
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto max-w-xl">
                            {JSON.stringify(audit.diff, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
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
      <section className="border rounded-xl bg-white shadow">
        <div className="p-6 border-b bg-gray-50">
          <h2 className="text-xl font-semibold">Provider Edit History</h2>
          <p className="text-sm text-gray-600 mt-1">
            All modifications to provider records
          </p>
        </div>
        <div className="p-6">
          {providerAudits.length === 0 ? (
            <p className="text-gray-500">No provider edits recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Changes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {providerAudits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {new Date(audit.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {audit.provider ? (
                          <Link
                            href={`/providers/${audit.provider.id}`}
                            className="text-[#4fa77e] hover:underline"
                          >
                            Dr. {audit.provider.firstName} {audit.provider.lastName}
                            <span className="text-gray-500 ml-1">
                              (NPI: {audit.provider.npi})
                            </span>
                          </Link>
                        ) : (
                          <span className="text-gray-400">Deleted</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {audit.actorEmail || "System"}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <details className="cursor-pointer">
                          <summary className="text-[#4fa77e] hover:underline">
                            View changes
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto max-w-xl">
                            {JSON.stringify(audit.diff, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
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
