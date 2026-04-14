export default function EmailVerifiedLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4">
      <div className="w-full max-w-md animate-pulse text-center">
        <div className="mx-auto h-20 w-20 rounded-full bg-gray-200" />
        <div className="mx-auto mt-6 h-8 w-48 rounded bg-gray-200" />
        <div className="mx-auto mt-3 h-4 w-64 rounded bg-gray-100" />
        <div className="mx-auto mt-8 h-12 w-full rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}
