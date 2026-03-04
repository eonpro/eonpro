export default function ChatLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="flex flex-col" style={{ height: 'calc(100vh - 12rem)' }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gray-200" />
          <div>
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="mt-1 h-3 w-24 rounded bg-gray-100" />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-hidden rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex justify-start">
            <div className="max-w-[70%] space-y-2 rounded-2xl rounded-tl-sm bg-gray-100 p-4">
              <div className="h-4 w-52 rounded bg-gray-200" />
              <div className="h-4 w-36 rounded bg-gray-200" />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[70%] space-y-2 rounded-2xl rounded-tr-sm bg-gray-200 p-4">
              <div className="h-4 w-44 rounded bg-gray-100" />
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[70%] space-y-2 rounded-2xl rounded-tl-sm bg-gray-100 p-4">
              <div className="h-4 w-60 rounded bg-gray-200" />
              <div className="h-4 w-48 rounded bg-gray-200" />
              <div className="h-4 w-32 rounded bg-gray-200" />
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[70%] space-y-2 rounded-2xl rounded-tr-sm bg-gray-200 p-4">
              <div className="h-4 w-56 rounded bg-gray-100" />
              <div className="h-4 w-28 rounded bg-gray-100" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-12 flex-1 rounded-xl bg-gray-100" />
          <div className="h-12 w-12 rounded-xl bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
