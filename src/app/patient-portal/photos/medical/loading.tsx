export default function MedicalPhotosLoading() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <div className="h-7 w-36 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-56 rounded bg-gray-100" />
      </div>
      {/* View toggle */}
      <div className="mb-6 flex gap-2">
        <div className="h-9 w-24 rounded-full bg-gray-200" />
        <div className="h-9 w-24 rounded-full bg-gray-100" />
      </div>
      {/* Photo grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
