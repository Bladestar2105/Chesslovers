const parseTimeControl = (tc) => {
  if (tc === 'unlimited') return { base: null, inc: null };
  const parts = tc.split('|');
  return { base: parseInt(parts[0]) * 60, inc: parseInt(parts[1]) };
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
