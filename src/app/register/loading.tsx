export default function RegisterLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#efece7] p-4">
      <div className="w-full max-w-md animate-pulse">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 h-16 w-16 rounded-2xl bg-gray-200" />
          <div className="h-7 w-48 rounded-lg bg-gray-200" />
          <div className="mt-1 h-4 w-32 rounded bg-gray-100" />
        </div>
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gray-200" />
          <div className="h-1 w-12 rounded bg-gray-200" />
          <div className="h-8 w-8 rounded-full bg-gray-200" />
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-xl">
          <div className="space-y-6">
            <div className="flex flex-col items-center">
              <div className="mb-4 h-12 w-12 rounded bg-gray-100" />
              <div className="h-6 w-44 rounded bg-gray-200" />
              <div className="mt-1 h-4 w-64 rounded bg-gray-100" />
            </div>
            <div className="h-12 w-full rounded-xl bg-gray-100" />
            <div className="h-12 w-full rounded-xl bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
