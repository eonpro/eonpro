export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        {/* Logo Animation */}
        <div className="mb-8">
          <div className="relative mx-auto w-20 h-20">
            {/* Spinning ring */}
            <div className="absolute inset-0 border-4 border-emerald-200 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-emerald-600 rounded-full animate-spin" />
            
            {/* Logo in center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <img 
                src="https://static.wixstatic.com/media/c49a9b_2e6625f0f27d44068998ab51675c6d7b~mv2.png"
                alt="EONPRO"
                className="h-10 w-10 animate-pulse"
              />
            </div>
          </div>
        </div>

        {/* Loading Text */}
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Loading...
        </h2>
        <p className="text-sm text-gray-500">
          Please wait while we load your content
        </p>

        {/* Loading Skeleton Preview */}
        <div className="mt-8 max-w-sm mx-auto space-y-3">
          <div className="h-4 bg-gray-200 rounded-full animate-pulse w-3/4 mx-auto" />
          <div className="h-4 bg-gray-200 rounded-full animate-pulse w-1/2 mx-auto" />
          <div className="h-4 bg-gray-200 rounded-full animate-pulse w-2/3 mx-auto" />
        </div>
      </div>
    </div>
  );
}
