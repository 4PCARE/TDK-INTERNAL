import { Router } from 'express';
import { requireAuth, optionalAuth } from './middleware.js';

const router = Router();

// Health check
router.get('/healthz', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth-svc',
    timestamp: new Date().toISOString()
  });
});

// Google OAuth routes
router.get('/api/auth/google', (req, res) => {
  console.log('🔐 Google OAuth login requested');
  // For now, redirect to the main server's Google auth
  const baseUrl = req.protocol + '://' + req.get('host');
  res.redirect(`${baseUrl.replace(':3001', ':4000')}/api/auth/google`);
});

router.get('/api/auth/google/callback', (req, res) => {
  console.log('🔐 Google OAuth callback requested');
  // For now, redirect to the main server's Google auth callback
  const baseUrl = req.protocol + '://' + req.get('host');
  res.redirect(`${baseUrl.replace(':3001', ':4000')}/api/auth/google/callback${req.url.substring(req.url.indexOf('?'))}`);
});

// Login page with proper CSP for Replit Auth
router.get('/login', (req, res) => {
  console.log('🔐 Login page requested');

  // Set CSP headers to allow Replit Auth script
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://auth.util.repl.co; " +
    "connect-src 'self' https://auth.util.repl.co wss://auth.util.repl.co; " +
    "frame-src 'self' https://auth.util.repl.co; " +
    "style-src 'self' 'unsafe-inline';"
  );

  const loginPage = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - AI KMS</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 2rem;
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
            margin-bottom: 0.5rem;
        }
        .subtitle {
            color: #666;
            margin-bottom: 2rem;
        }
        .auth-container {
            margin: 2rem 0;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">🤖 AI KMS</div>
        <div class="subtitle">Knowledge Management System</div>
        <div class="auth-container">
            <script
                authed="window.location.href = '/'"
                src="https://auth.util.repl.co/script.js">
            </script>
        </div>
    </div>
</body>
</html>`;

  res.send(loginPage);
});

// User info endpoint
router.get('/me', optionalAuth, (req, res) => {
  console.log('🔍 User info request:', {
    'x-replit-user-id': req.headers['x-replit-user-id'] || '',
    'x-replit-user-name': req.headers['x-replit-user-name'] || '',
    authHeader: req.headers.authorization
  });

  if (req.user) {
    res.json({
      authenticated: true,
      user: req.user
    });
  } else {
    console.log('ℹ️ User not authenticated (this is normal):', {
      userId: req.headers['x-replit-user-id'] || '',
      userName: req.headers['x-replit-user-name'] || ''
    });
    res.json({
      authenticated: false,
      user: null
    });
  }
});

// Validation endpoint for other services
router.post('/validate', optionalAuth, (req, res) => {
  if (req.user) {
    res.json({
      valid: true,
      user: req.user
    });
  } else {
    res.status(401).json({
      valid: false,
      message: 'Invalid or missing authentication'
    });
  }
});

// Development login endpoint
router.post('/api/dev-login', (req, res) => {
  const { email, password } = req.body;

  // Simple dev authentication - in production, use proper validation
  if (password === 'demo123') {
    res.json({
      authenticated: true,
      user: {
        id: 'dev-' + Date.now(),
        name: email.split('@')[0],
        email: email,
        authenticated: true
      }
    });
  } else {
    res.status(401).json({
      authenticated: false,
      message: 'Invalid credentials'
    });
  }
});

// Logout endpoint
router.get('/api/logout', (req, res) => {
  res.json({
    authenticated: false,
    message: 'Logged out successfully'
  });
});

export { router };