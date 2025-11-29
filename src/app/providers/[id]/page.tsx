import EditProviderForm from "@/components/EditProviderForm";
import { prisma } from "@/lib/db";
import Link from "next/link";

type Params = {
  params: Promise<{ id: string }>;
};

export default async function ProviderDetailPage({ params }: Params) {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  const provider = await prisma.provider.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: "desc" },
        include: { patient: true, rxs: true },
        take: 25,
      },
      auditEntries: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!provider) {
    return (
      <div className="p-10">
        <p className="text-red-600">Provider not found.</p>
        <Link href="/providers" className="text-[#4fa77e] underline mt-4 block">
          ← Back to providers
        </Link>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500">
            #PROVIDER
          </p>
          <h1 className="text-4xl font-bold">
            {provider.firstName} {provider.lastName}
          </h1>
          <p className="text-gray-600">
            {provider.titleLine ?? "—"} • NPI {provider.npi}
          </p>
          <div className="text-sm text-gray-600 mt-2 space-y-1">
            <p>
              License: {provider.licenseState ?? "—"} {provider.licenseNumber ?? ""}
            </p>
            <p>DEA: {provider.dea ?? "—"}</p>
            <p>Email: {provider.email ?? "—"} • Phone: {provider.phone ?? "—"}</p>
          </div>
        </div>
        <Link href="/providers" className="text-[#4fa77e] underline text-sm">
          ← Back to providers
        </Link>
      </div>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="border rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Edit Provider</h2>
          <EditProviderForm provider={provider} />
        </div>
        <div className="border rounded-xl bg-white shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Snapshot</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>
              <strong>Verified:</strong>{" "}
              {provider.npiVerifiedAt
                ? new Date(provider.npiVerifiedAt).toLocaleString()
                : "Pending"}
            </li>
            <li>
              <strong>Total Orders:</strong> {provider.orders.length}
            </li>
            <li>
              <strong>Last Order:</strong>{" "}
              {provider.orders[0]
                ? new Date(provider.orders[0].createdAt).toLocaleString()
                : "—"}
            </li>
          </ul>
        </div>
      </section>

      <section className="border rounded-xl bg-white shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Audit Log</h2>
        {provider.auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500">No edits recorded yet.</p>
        ) : (
          <div className="space-y-3 text-sm text-gray-700">
            {provider.auditEntries.map((entry: any) => (
              <div key={entry.id} className="border rounded-lg p-3 bg-gray-50">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>{entry.actorEmail ?? "Unknown actor"}</span>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <pre className="text-xs whitespace-pre-wrap bg-white rounded p-2 border">
                  {JSON.stringify(entry.diff, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border rounded-xl bg-white shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Orders</h2>
        {provider.orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
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
                      {order.patient
                        ? `${order.patient.firstName} ${order.patient.lastName}`
                        : "—"}
                    </td>
                    <td className="border px-3 py-2">
                      <ul className="list-disc list-inside space-y-1">
                        {order.rxs.map((rx: any) => (
                          <li key={rx.id}>
                            {rx.medName} • {rx.sig}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="border px-3 py-2 capitalize">
                      {order.status ?? "pending"}
                    </td>
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

