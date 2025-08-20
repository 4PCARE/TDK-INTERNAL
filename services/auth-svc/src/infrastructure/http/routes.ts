
import { Router } from 'express';
import { requireAuth, optionalAuth, AuthenticatedRequest } from './middleware.js';

const router = Router();

// Health check
router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-svc' });
});

// User info endpoint - checks Replit headers
router.get('/me', (req, res) => {
  console.log('🔍 User info request:', {
    'x-replit-user-id': req.headers['x-replit-user-id'] || '',
    'x-replit-user-name': req.headers['x-replit-user-name'] || '',
    authHeader: req.headers.authorization ? 'present' : undefined
  });

  try {
    const userId = req.headers['x-replit-user-id'] as string;
    const userName = req.headers['x-replit-user-name'] as string;
    const userEmail = req.headers['x-replit-user-email'] as string || `${userName}@replit.com`;

    if (!userId || !userName) {
      console.log('ℹ️ User not authenticated (this is normal):', { userId: userId || '', userName: userName || '' });
      return res.json({ 
        authenticated: false,
        message: "Not authenticated with Replit"
      });
    }

    const sessionUser = {
      id: userId,
      name: userName,
      email: userEmail,
      authenticated: true
    };

    res.json({
      authenticated: true,
      user: sessionUser
    });
  } catch (error) {
    console.error("Error in /me:", error);
    res.json({ 
      authenticated: false,
      error: error.message
    });
  }
});

// Login page endpoint
router.get('/login', (req, res) => {
  console.log('🔐 Login page requested');
  
  // Check if already authenticated via Replit headers
  const userId = req.headers['x-replit-user-id'] as string;
  const userName = req.headers['x-replit-user-name'] as string;

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

// Development login endpoint
router.post('/api/dev-login', (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: "Development login not allowed in production" });
  }

  const devUser = {
    id: "dev-user-123",
    name: "Dev User",
    email: "dev@example.com",
    authenticated: true
  };

  res.json({
    success: true,
    user: devUser
  });
});

// Logout endpoint
router.get('/api/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

// Token validation endpoint (for other services)
router.post('/validate', (req, res) => {
  const userId = req.headers['x-replit-user-id'] as string;
  const userName = req.headers['x-replit-user-name'] as string;
  const userEmail = req.headers['x-replit-user-email'] as string;

  if (!userId || !userName) {
    return res.status(401).json({ 
      valid: false,
      message: "Invalid authentication"
    });
  }

  res.json({
    valid: true,
    user: {
      id: userId,
      name: userName,
      email: userEmail || `${userName}@replit.com`
    }
  });
});

export default router;
