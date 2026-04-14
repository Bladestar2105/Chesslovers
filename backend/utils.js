const parseTimeControl = (tc) => {
  if (tc === 'unlimited' || !tc || typeof tc !== 'string') return { base: null, inc: null };
  const parts = tc.split('|');
  if (parts.length !== 2) return { base: null, inc: null };
  const base = parseInt(parts[0]);
  const inc = parseInt(parts[1]);
  if (isNaN(base) || isNaN(inc)) return { base: null, inc: null };
  return { base: base * 60, inc: inc };
};

const authenticateAdmin = (jwtSecret, jwt) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing authorization header' });

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (payload.admin) {
      next();
    } else {
      res.status(403).json({ error: 'Not an admin' });
    }
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  parseTimeControl,
  authenticateAdmin
};
