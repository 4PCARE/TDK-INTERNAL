import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useToast } from "../../hooks/use-toast";
import { apiRequest } from "../../lib/queryClient";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { toast } = useToast();

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await apiRequest("POST", "/api/login", data);
      return response.json();
    },
    onSuccess: (data) => {
      // Store the token if needed
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      toast({
        title: "Success",
        description: "Successfully logged in!",
      });
      window.location.reload(); // Refresh to update auth state
    },
    onError: (error: any) => {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName: string; lastName: string }) => {
      const response = await apiRequest("POST", "/api/register", data);
      return response.json();
    },
    onSuccess: (data) => {
      // Store the token if needed
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      toast({
        title: "Success",
        description: "Account created successfully!",
      });
      window.location.reload(); // Refresh to update auth state
    },
    onError: (error: any) => {
      toast({
        title: "Sign Up Failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSignUp) {
      if (!firstName || !lastName) {
        toast({
          title: "Missing Information",
          description: "Please provide your first and last name",
          variant: "destructive",
        });
        return;
      }
      signUpMutation.mutate({ email, password, firstName, lastName });
    } else {
      loginMutation.mutate({ email, password });
    }
  };

  const handleReplitLogin = () => {
    window.location.href = "/api/login";
  };

  const handleMicrosoftLogin = () => {
    window.location.href = "/api/auth/microsoft";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isSignUp ? "Create Account" : "Sign In"}</DialogTitle>
          <DialogDescription>
            {isSignUp 
              ? "Create a new account to access the TDK Knowledge Management Platform"
              : "Sign in to access the TDK Knowledge Management Platform"
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* OAuth Providers */}
          <div className="space-y-2">
            <Button
              onClick={handleReplitLogin}
              className="w-full bg-blue-500 hover:bg-blue-600"
              type="button"
            >
              Sign In with Replit
            </Button>
            <Button
              onClick={handleMicrosoftLogin}
              variant="outline"
              className="w-full border-blue-500 text-blue-500 hover:bg-blue-50"
              type="button"
            >
              Sign In with Microsoft
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required={isSignUp}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required={isSignUp}
                    />
                  </div>
                </div>
              </>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="dev@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={isSignUp ? "At least 6 characters" : "dev"}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending || signUpMutation.isPending}
            >
              {loginMutation.isPending || signUpMutation.isPending
                ? "Please wait..."
                : isSignUp
                ? "Create Account"
                : "Sign In"
              }
            </Button>
          </form>

          <div className="text-center text-sm">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-blue-500 hover:underline"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"
              }
            </button>
          </div>

          {!isSignUp && (
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p><strong>Demo Credentials:</strong></p>
              <p>Email: dev@example.com | Password: dev</p>
              <p>Email: user@example.com | Password: test123</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}