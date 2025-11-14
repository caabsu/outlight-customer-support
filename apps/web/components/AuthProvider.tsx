"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  email?: string;
}

const publicPaths = ["/login", "/create-account"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Check if current path is public
    const isPublicPath = publicPaths.some((path) => pathname?.startsWith(path));

    if (isPublicPath) {
      setIsChecking(false);
      return;
    }

    // Check for logged in user
    const currentUserStr = localStorage.getItem("currentUser");

    if (!currentUserStr) {
      // Not logged in, redirect to login
      router.push("/login");
      return;
    }

    try {
      const user: User = JSON.parse(currentUserStr);
      if (!user.id || !user.username) {
        // Invalid user data, clear and redirect
        localStorage.removeItem("currentUser");
        router.push("/login");
        return;
      }

      // User is valid
      setIsChecking(false);
    } catch (error) {
      // Invalid JSON, clear and redirect
      localStorage.removeItem("currentUser");
      router.push("/login");
    }
  }, [pathname, router]);

  // Show loading state while checking auth
  if (isChecking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook to get current user
export function useCurrentUser(): User | null {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const currentUserStr = localStorage.getItem("currentUser");
    if (currentUserStr) {
      try {
        setUser(JSON.parse(currentUserStr));
      } catch {
        setUser(null);
      }
    }
  }, []);

  return user;
}

// Hook to logout
export function useLogout() {
  const router = useRouter();

  return () => {
    localStorage.removeItem("currentUser");
    router.push("/login");
  };
}
