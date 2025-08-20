
import { RequestHandler } from "express";
import session from "express-session";
import type { Express } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

// Simple session configuration
export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: Math.floor(sessionTtl / 1000),
    tableName: "sessions",
    pruneSessionInterval: 60 * 60,
  });

  sessionStore.on('error', (err) => {
    console.error('Session store error:', err);
  });

  return session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'ai-kms.sid',
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: sessionTtl,
      sameSite: 'lax'
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Login route - uses Replit Auth
  app.get("/login", (req, res) => {
    // Check if already authenticated via Replit headers
    const userId = req.headers['x-replit-user-id'] as string;
    const userName = req.headers['x-replit-user-name'] as string;
    const userEmail = req.headers['x-replit-user-email'] as string;

    if (userId && userName) {
      // Already authenticated, redirect to dashboard
      return res.redirect('/');
    }

    // Serve login page with Replit Auth
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Login - AI-KMS</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              display: flex; 
              justify-content: center; 
              align-items: center; 
              height: 100vh; 
              margin: 0; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .login-container { 
              background: white; 
              padding: 3rem; 
              border-radius: 12px; 
              box-shadow: 0 10px 25px rgba(0,0,0,0.1); 
              text-align: center; 
              max-width: 400px;
              width: 90%;
            }
            .logo {
              font-size: 2rem;
              font-weight: bold;
              color: #333;
              margin-bottom: 1rem;
            }
            .subtitle {
              color: #666;
              margin-bottom: 2rem;
              font-size: 1.1rem;
            }
            .auth-container {
              margin: 2rem 0;
            }
            .status {
              margin-top: 1rem;
              padding: 0.5rem;
              border-radius: 4px;
              font-size: 0.9rem;
            }
            .error {
              background: #fee;
              color: #c33;
              border: 1px solid #fcc;
            }
            .success {
              background: #efe;
              color: #363;
              border: 1px solid #cfc;
            }
          </style>
        </head>
        <body>
          <div class="login-container">
            <div class="logo">🤖 AI-KMS</div>
            <div class="subtitle">AI Knowledge Management System</div>
            <p>Please authenticate with your Replit account to continue</p>
            
            <div class="auth-container">
              <script 
                authed="handleAuth()"
                src="https://auth.util.repl.co/script.js">
              </script>
              
              <div style="margin: 1rem 0; color: #666;">or</div>
              
              <a href="/api/auth/microsoft" style="display: block; margin: 0.5rem 0; padding: 0.75rem; background: #0078d4; color: white; text-decoration: none; border-radius: 4px; text-align: center;">
                Sign in with Microsoft
              </a>
              
              <a href="/api/auth/google" style="display: block; margin: 0.5rem 0; padding: 0.75rem; background: #4285f4; color: white; text-decoration: none; border-radius: 4px; text-align: center;">
                Sign in with Google
              </a>
            </div>
            
            <div id="status"></div>
          </div>
          
          <script>
            function handleAuth() {
              document.getElementById('status').innerHTML = '<div class="status success">✅ Authentication successful! Redirecting...</div>';
              setTimeout(() => {
                window.location.href = '/';
              }, 1000);
            }
            
            // Check auth status periodically
            let checkCount = 0;
            const maxChecks = 30;
            
            function checkAuthStatus() {
              if (checkCount >= maxChecks) return;
              
              fetch('/api/me', { credentials: 'include' })
                .then(response => response.json())
                .then(data => {
                  if (data.authenticated) {
                    handleAuth();
                  } else {
                    checkCount++;
                    setTimeout(checkAuthStatus, 1000);
                  }
                })
                .catch(() => {
                  checkCount++;
                  setTimeout(checkAuthStatus, 1000);
                });
            }
            
            // Start checking after a short delay
            setTimeout(checkAuthStatus, 2000);
          </script>
        </body>
      </html>
    `);
  });

  // API login endpoint (redirect to login page)
  app.get("/api/login", (req, res) => {
    res.redirect("/login");
  });

  // Get current user info
  app.get("/api/me", async (req, res) => {
    try {
      const userId = req.headers['x-replit-user-id'] as string;
      const userName = req.headers['x-replit-user-name'] as string;
      const userEmail = req.headers['x-replit-user-email'] as string || `${userName}@replit.com`;

      console.log('Auth check:', { userId, userName, userEmail });

      if (!userId || !userName) {
        return res.json({ 
          authenticated: false,
          message: "Not authenticated with Replit"
        });
      }

      // Store/update user in session and database
      const sessionUser = {
        id: userId,
        name: userName,
        email: userEmail,
        authenticated: true
      };

      req.session.user = sessionUser;

      // Try to upsert user to database
      try {
        await storage.upsertUser({
          id: userId,
          email: userEmail,
          firstName: userName.split(' ')[0] || userName,
          lastName: userName.split(' ').slice(1).join(' ') || '',
          profileImageUrl: null,
          loginMethod: "replit",
        });
      } catch (error) {
        console.error("Error upserting user:", error);
        // Continue even if database update fails
      }

      res.json({
        authenticated: true,
        user: sessionUser
      });
    } catch (error) {
      console.error("Error in /api/me:", error);
      res.json({ 
        authenticated: false,
        error: error.message
      });
    }
  });

  // Development login endpoint
  app.post("/api/dev-login", (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(403).json({ error: "Development login not allowed in production" });
    }

    const devUser = {
      id: "dev-user-123",
      name: "Dev User",
      email: "dev@example.com",
      authenticated: true
    };

    req.session.user = devUser;

    res.json({
      success: true,
      user: devUser
    });
  });

  // Logout endpoint
  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/login");
    });
  });
}

// Authentication middleware
export const requireAuth: RequestHandler = async (req, res, next) => {
  // Skip auth for static assets and development resources
  const skipPaths = ['/assets/', '/public/', '/widget/', '/@vite/', '/@fs/', '/node_modules/', '/favicon.ico', '/login', '/api/login', '/api/me', '/api/dev-login'];
  
  if (skipPaths.some(path => req.path.startsWith(path))) {
    return next();
  }

  try {
    // Check Replit headers first (primary auth method)
    const userId = req.headers['x-replit-user-id'] as string;
    const userName = req.headers['x-replit-user-name'] as string;
    const userEmail = req.headers['x-replit-user-email'] as string || `${userName}@replit.com`;

    if (userId && userName) {
      // Update session with current auth info
      req.session.user = {
        id: userId,
        name: userName,
        email: userEmail,
        authenticated: true
      };
      
      // Set user on request for downstream middleware
      req.user = req.session.user;
      return next();
    }

    // Fallback to session auth (for development or edge cases)
    if (req.session?.user?.authenticated) {
      req.user = req.session.user;
      return next();
    }

    // Not authenticated
    console.log("Auth failed - no valid authentication found");
    
    // For API requests, return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        message: "Authentication required",
        authenticated: false 
      });
    }

    // For page requests, redirect to login
    return res.redirect('/login');
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
};

// Admin middleware
export const requireAdmin: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Check if user is admin in database
    const user = await storage.getUser(userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }

    return next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
};

// Legacy compatibility exports
export const isAuthenticated = requireAuth;
export const isAdmin = requireAdmin;
