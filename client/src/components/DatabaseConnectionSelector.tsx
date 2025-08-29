
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Database, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

interface DatabaseConnection {
  id: number;
  name: string;
  type: string;
  dbType: string;
  host: string;
  port: number;
  database: string;
  isActive: boolean;
}

interface DatabaseConnectionSelectorProps {
  agentId: number;
  selectedConnections: number[];
  onConnectionsChange: (connectionIds: number[]) => void;
}

export default function DatabaseConnectionSelector({
  agentId,
  selectedConnections,
  onConnectionsChange,
}: DatabaseConnectionSelectorProps) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  // Fetch all available database connections
  const { data: allConnections = [] } = useQuery({
    queryKey: ['/api/database-connections'],
    enabled: isAuthenticated,
  }) as { data: DatabaseConnection[] };

  // Fetch agent's current database connections
  const { data: agentConnections = [] } = useQuery({
    queryKey: [`/api/agent-chatbots/${agentId}/databases`],
    enabled: isAuthenticated && !!agentId,
  });

  const handleConnectionToggle = (connectionId: number, checked: boolean) => {
    if (checked) {
      onConnectionsChange([...selectedConnections, connectionId]);
    } else {
      onConnectionsChange(selectedConnections.filter(id => id !== connectionId));
    }
  };

  const activeConnections = allConnections.filter(conn => conn.isActive);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          Database Connections ({selectedConnections.length})
        </Button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            Select Database Connections
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Choose which databases this agent can query to answer questions
          </div>

          {activeConnections.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-slate-500 mb-4">No database connections available</p>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Database Connection
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeConnections.map((connection) => {
                const isSelected = selectedConnections.includes(connection.id);
                const isCurrentlyConnected = agentConnections.some(
                  (ac: any) => ac.connectionId === connection.id
                );

                return (
                  <Card 
                    key={connection.id} 
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                    onClick={() => handleConnectionToggle(connection.id, !isSelected)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1"
                          />
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-600" />
                            <div>
                              <div className="font-medium">{connection.name}</div>
                              <div className="text-sm text-slate-500">
                                {connection.host}:{connection.port} • {connection.database}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={connection.dbType === 'postgresql' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {connection.dbType.toUpperCase()}
                          </Badge>
                          {isCurrentlyConnected && (
                            <Badge variant="default" className="bg-green-500 text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              Connected
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => setOpen(false)}>
            Save Selection ({selectedConnections.length})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
