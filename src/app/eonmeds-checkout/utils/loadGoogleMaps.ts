let isLoaded = false;

export function loadGoogleMapsScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Not in browser environment'));
      return;
    }

    if (isLoaded && window.google && window.google.maps) {
      resolve();
      return;
    }

    // The platform's root layout already loads Google Maps via script tag
    // when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Just poll for it.
    let attempts = 0;
    const maxAttempts = 60; // 15 seconds max
    const checkInterval = setInterval(() => {
      attempts++;
      if (window.google && window.google.maps) {
        clearInterval(checkInterval);
        isLoaded = true;
        resolve();
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);

        // Fallback: try loading the script ourselves
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
        if (!apiKey) {
          reject(new Error('Google Maps API key not configured'));
          return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          isLoaded = true;
          resolve();
        };
        script.onerror = () => reject(new Error('Failed to load Google Maps script'));
        document.head.appendChild(script);
      }
    }, 250);
  });
}
