import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function signToken(user) {
  // "sub" (subject) = who this token belongs to
  return jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email });

// POST /api/auth/register  { name, email, password }
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

  if (await User.exists({ email: email.toLowerCase() })) {
    return res.status(409).json({ error: 'email already registered' });
  }
  const passwordHash = await bcrypt.hash(password, 10); // 10 salt rounds
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

// POST /api/auth/login  { email, password }
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = email && (await User.findOne({ email: email.toLowerCase() }));
  // same message for "no such user" and "wrong password" so attackers can't probe emails
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    return res.status(401).json({ error: 'invalid email or password' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json({ user: publicUser(user) });
});

export default router;
