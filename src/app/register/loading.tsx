export default function RegisterLoading() {
  return (
    <div className="dark-login-bg flex min-h-[100dvh] items-center justify-center p-4">
      <div className="w-full max-w-md animate-pulse">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 h-10 w-32 rounded-lg bg-white/10" />
          <div className="h-7 w-48 rounded-lg bg-white/10" />
          <div className="mt-1 h-4 w-32 rounded bg-white/[0.06]" />
        </div>
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="h-8 w-8 rounded-full bg-white/10" />
          <div className="h-1 w-12 rounded bg-white/10" />
          <div className="h-8 w-8 rounded-full bg-white/10" />
        </div>
        <div className="space-y-6">
          <div className="flex flex-col items-center">
            <div className="mb-4 h-12 w-12 rounded bg-white/[0.06]" />
            <div className="h-6 w-44 rounded bg-white/10" />
            <div className="mt-1 h-4 w-64 rounded bg-white/[0.06]" />
          </div>
          <div className="h-12 w-full rounded-xl bg-white/[0.06]" />
          <div className="h-12 w-full rounded-xl bg-white/10" />
        </div>
      </div>
    </div>
  );
}
