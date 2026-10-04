import jwt from 'jsonwebtoken';
import { config } from '../config.js';

// Every protected route runs this first.
// The client sends:  Authorization: Bearer <token>
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret); // checks signature + expiry
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
