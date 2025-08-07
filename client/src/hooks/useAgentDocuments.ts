
import { useQuery } from "@tanstack/react-query";

interface UseAgentDocumentsProps {
  agentId: number;
  enabled?: boolean;
}

export function useAgentDocuments({ agentId, enabled = false }: UseAgentDocumentsProps) {
  return useQuery({
    queryKey: [`/api/agent-chatbots/${agentId}/documents`],
    enabled: enabled && !!agentId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

// Hook for getting agent documents count only (lighter request)
export function useAgentDocumentsCount({ agentId, enabled = true }: UseAgentDocumentsProps) {
  return useQuery({
    queryKey: [`/api/agent-chatbots/${agentId}/documents/count`],
    enabled: enabled && !!agentId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
