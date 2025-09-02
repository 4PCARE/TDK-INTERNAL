import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const getToken = () => {
    // Return the token from localStorage, sessionStorage, or wherever it's stored
    // This is a placeholder - adjust based on how your app stores tokens
    return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    getToken,
  };
}
