export default function SupportTicketLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gray-200" />
        <div>
          <div className="h-6 w-40 rounded bg-gray-200" />
          <div className="mt-1 h-4 w-56 rounded bg-gray-100" />
        </div>
      </div>

      {/* Ticket info card */}
      <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 rounded bg-gray-200" />
          <div className="h-6 w-20 rounded-full bg-gray-200" />
        </div>
        <div className="mt-3 h-4 w-full rounded bg-gray-100" />
        <div className="mt-2 h-4 w-3/4 rounded bg-gray-100" />
        <div className="mt-4 h-3 w-32 rounded bg-gray-100" />
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`rounded-2xl p-4 ${i % 2 === 0 ? 'bg-white shadow-sm' : 'ml-8 bg-gray-50'}`}
          >
            <div className="mb-2 flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gray-200" />
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="h-3 w-20 rounded bg-gray-100" />
            </div>
            <div className="space-y-1.5">
              <div className="h-4 w-full rounded bg-gray-100" />
              <div className="h-4 w-5/6 rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Reply box */}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="h-24 w-full rounded-xl bg-gray-100" />
        <div className="mt-3 flex justify-end">
          <div className="h-10 w-24 rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
