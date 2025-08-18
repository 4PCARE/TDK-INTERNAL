import { Router } from 'express';

const router = Router();

// Mock user database (replace with actual DB in production)
const users = new Map([
  ['dev@example.com', {
    id: 'dev-user',
    email: 'dev@example.com',
    firstName: 'Dev',
    lastName: 'User',
    roles: ['admin', 'user']
  }],
  ['user@example.com', {
    id: 'user-123',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    roles: ['user']
  }]
]);

// Mock sessions
const sessions = new Map();

router.get('/healthz', (req, res) => {
  res.json({ status: 'healthy', service: 'auth-svc' });
});

// Get current user info
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid token' });
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
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = users.get(email);
  if (!user || password !== 'dev') { // Simple password check for dev
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate mock JWT token
  const token = `jwt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const refreshToken = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
  if (!session || session.type !== 'refresh') {
    return res.status(401).json({ error: 'Invalid refresh token' });
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

// Logout endpoint
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    sessions.delete(token);
  }

  res.json({ message: 'Logged out successfully' });
});

export { router };