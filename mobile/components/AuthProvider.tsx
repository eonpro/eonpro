import React, { useCallback, useEffect, useState, ReactNode } from 'react';
import { AuthContext } from '@/lib/auth-context';
import { AuthUser, biometrics, login, logout, tokenStorage } from '@/lib/auth';

interface Props {
  children: ReactNode;
}

export default function AuthProvider({ children }: Props) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const token = await tokenStorage.getAccessToken();
        if (!token) {
          if (mounted) setIsLoading(false);
          return;
        }

        // If biometric is enabled, require auth before restoring session
        const bioEnabled = await biometrics.isEnabled();
        if (bioEnabled) {
          const bioAvailable = await biometrics.isAvailable();
          if (bioAvailable) {
            const success = await biometrics.authenticate('Unlock to continue');
            if (!success) {
              await tokenStorage.clearTokens();
              if (mounted) setIsLoading(false);
              return;
            }
          }
        }

        const storedUser = await tokenStorage.getUser();
        if (mounted) {
          setUser(storedUser);
          setIsLoading(false);
        }
      } catch {
        if (mounted) setIsLoading(false);
      }
    }

    restoreSession();
    return () => { mounted = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await login({ email, password });
    if (result.success && result.user) {
      setUser(result.user);

      // Prompt biometric enrollment after first successful login
      const bioAvailable = await biometrics.isAvailable();
      const bioEnabled = await biometrics.isEnabled();
      if (bioAvailable && !bioEnabled) {
        // The UI will handle prompting — just flag it's available
      }
    }
    return { success: result.success, error: result.error };
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedUser = await tokenStorage.getUser();
    setUser(storedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
