import { Router } from 'express';

const router = Router();

// Mock user database (replace with actual DB in production)
const users = new Map([
  ['dev@example.com', {
    id: 'dev-user',
    email: 'dev@example.com',
    firstName: 'Dev',
    lastName: 'User',
    roles: ['admin', 'user'],
    passwordHash: 'dev', // In production: bcrypt.hashSync('dev', 10)
    createdAt: new Date('2024-01-01'),
    lastLogin: new Date()
  }],
  ['user@example.com', {
    id: 'user-123',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    roles: ['user'],
    passwordHash: 'test123', // In production: bcrypt.hashSync('test123', 10)
    createdAt: new Date('2024-01-01'),
    lastLogin: new Date()
  }]
]);

// Mock sessions with expiration
const sessions = new Map();

// Helper function to generate secure tokens
function generateToken(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
}

// Helper function to validate token expiration
function isTokenExpired(session: any): boolean {
  const now = new Date().getTime();
  const created = new Date(session.createdAt).getTime();
  const accessTokenExpiry = 15 * 60 * 1000; // 15 minutes
  const refreshTokenExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days

  if (session.type === 'refresh') {
    return (now - created) > refreshTokenExpiry;
  }
  return (now - created) > accessTokenExpiry;
}

router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-svc' });
});

// Auth methods endpoint
router.get('/methods', (req, res) => {
  res.json({
    methods: [
      {
        name: "replit",
        displayName: "Login with Replit",
        endpoint: "/api/login"
      },
      {
        name: "microsoft", 
        displayName: "Login with Microsoft",
        endpoint: "/api/auth/microsoft"
      }
    ]
  });
});

// Login page route - Replit Auth integration
router.get('/login', (req, res) => {
  // Check if user is already authenticated via Replit headers
  if (req.headers['x-replit-user-id']) {
    return res.redirect('/');
  }
  
  // Serve Replit Auth login page
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
            box-shadow: 0 10px 30px rgba(0,0,0,0.2); 
            text-align: center; 
            max-width: 400px;
            width: 90%;
          }
          .logo { 
            width: 64px; 
            height: 64px; 
            margin: 0 auto 1rem; 
            background: #667eea; 
            border-radius: 12px; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            color: white; 
            font-size: 24px; 
            font-weight: bold;
          }
          h1 { 
            color: #333; 
            margin-bottom: 0.5rem; 
            font-size: 2rem;
          }
          .subtitle { 
            color: #666; 
            margin-bottom: 2rem; 
            font-size: 1.1rem;
          }
          .auth-section {
            margin: 2rem 0;
          }
          .loading {
            display: none;
            color: #666;
            margin-top: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="login-container">
          <div class="logo">AI</div>
          <h1>AI-KMS</h1>
          <p class="subtitle">Knowledge Management System</p>
          <div class="auth-section">
            <p>Please authenticate with your Replit account to continue</p>
            <script authed="window.location.reload()" src="https://auth.util.repl.co/script.js"></script>
            <div class="loading">
              <p>Redirecting after authentication...</p>
            </div>
          </div>
        </div>
        
        <script>
          // Show loading state after auth completes
          window.addEventListener('message', function(event) {
            if (event.data === 'auth_complete') {
              document.querySelector('.auth-section').style.display = 'none';
              document.querySelector('.loading').style.display = 'block';
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Get current user info
router.get('/me', (req, res) => {
  console.log('🔍 User info request:', {
    headers: req.headers,
    authHeader: req.headers.authorization
  });

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const session = sessions.get(token);

  if (!session || isTokenExpired(session)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = users.get(session.email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      claims: {
        sub: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName
      }
    }
  });
});

// Login endpoint
router.post('/login', (req, res) => {
  console.log('🔍 Login attempt:', {
    body: req.body,
    headers: req.headers,
    contentType: req.get('Content-Type')
  });

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = users.get(email);
  if (!user || password !== user.passwordHash) { // In production: bcrypt.compareSync(password, user.passwordHash)
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Update last login
  user.lastLogin = new Date();
  users.set(email, user);

  // Generate secure tokens
  const token = generateToken('jwt');
  const refreshToken = generateToken('refresh');

  // Store session
  sessions.set(token, { email, userId: user.id, createdAt: new Date() });
  sessions.set(refreshToken, { email, userId: user.id, type: 'refresh', createdAt: new Date() });

  res.json({
    accessToken: token,
    refreshToken: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    }
  });
});

// Refresh token endpoint
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  const session = sessions.get(refreshToken);
  if (!session || session.type !== 'refresh' || isTokenExpired(session)) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const user = users.get(session.email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Generate new tokens
  const newToken = `jwt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newRefreshToken = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Update sessions
  sessions.delete(refreshToken); // Remove old refresh token
  sessions.set(newToken, { email: session.email, userId: user.id, createdAt: new Date() });
  sessions.set(newRefreshToken, { email: session.email, userId: user.id, type: 'refresh', createdAt: new Date() });

  res.json({
    accessToken: newToken,
    refreshToken: newRefreshToken
  });
});

// Get available roles
router.get('/roles', (req, res) => {
  res.json({
    roles: ['admin', 'user', 'viewer']
  });
});

// User registration endpoint
router.post('/register', (req, res) => {
  console.log('🔍 Registration attempt:', {
    body: req.body,
    headers: req.headers
  });

  const { email, password, firstName, lastName } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ 
      error: 'Email, password, firstName, and lastName are required' 
    });
  }

  if (users.has(email)) {
    return res.status(409).json({ error: 'User already exists' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Create new user
  const newUser = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email,
    firstName,
    lastName,
    roles: ['user'], // Default role
    passwordHash: password, // In production: bcrypt.hashSync(password, 10)
    createdAt: new Date(),
    lastLogin: new Date()
  };

  users.set(email, newUser);

  // Generate tokens
  const token = generateToken('jwt');
  const refreshToken = generateToken('refresh');

  // Store sessions
  sessions.set(token, { email, userId: newUser.id, createdAt: new Date() });
  sessions.set(refreshToken, { email, userId: newUser.id, type: 'refresh', createdAt: new Date() });

  res.status(201).json({
    accessToken: token,
    refreshToken: refreshToken,
    user: {
      id: newUser.id,
      email: newUser.email,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      roles: newUser.roles
    }
  });
});

// Token validation endpoint
router.post('/validate', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  const session = sessions.get(token);
  if (!session || isTokenExpired(session)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = users.get(session.email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    valid: true,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles
    }
  });
});

// Get user by ID endpoint
router.get('/users/:id', (req, res) => {
  const { id } = req.params;

  // Find user by ID
  const user = Array.from(users.values()).find(u => u.id === id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
});

// Update user profile endpoint
router.put('/profile', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const session = sessions.get(token);

  if (!session || isTokenExpired(session)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = users.get(session.email);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { firstName, lastName } = req.body;

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;

  users.set(session.email, user);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles
    }
  });
});

// Logout endpoint
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const session = sessions.get(token);

    // Remove both access token and refresh token if they exist
    sessions.delete(token);

    if (session && session.email) {
      // Find and remove associated refresh tokens
      for (const [key, value] of sessions.entries()) {
        if (value.email === session.email && value.type === 'refresh') {
          sessions.delete(key);
        }
      }
    }
  }

  res.json({ message: 'Logged out successfully' });
});

export { router };