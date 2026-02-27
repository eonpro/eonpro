export default function IntakeLoading() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-400">Loading your form...</p>
      </div>
    </div>
  );
}
