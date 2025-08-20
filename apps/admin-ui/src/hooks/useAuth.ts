
import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: response, isLoading, error } = useQuery({
    queryKey: ["/api/me"],
    retry: false,
  });

  const isAuthenticated = response?.authenticated === true;
  const user = response?.user;

  return {
    user,
    isLoading,
    isAuthenticated,
    error
  };
}
