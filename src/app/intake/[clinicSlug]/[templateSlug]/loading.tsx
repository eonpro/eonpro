export default function IntakeLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
        <p className="text-sm text-gray-400">Loading your form...</p>
      </div>
    </div>
  );
}
