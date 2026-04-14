const parseTimeControl = (tc) => {
  if (tc === 'unlimited') return { base: null, inc: null };
  const parts = tc.split('|');
  return { base: parseInt(parts[0]) * 60, inc: parseInt(parts[1]) };
};

const isValidTimeControl = (tc) => {
  if (typeof tc !== 'string') return false;
  if (tc === 'unlimited') return true;
  const parts = tc.split('|');
  if (parts.length !== 2) return false;
  const base = Number(parts[0]);
  const inc = Number(parts[1]);
  return Number.isInteger(base) && base >= 0 && Number.isInteger(inc) && inc >= 0 &&
         parts[0] === String(base) && parts[1] === String(inc);
};

const isValidString = (str, maxLength = 255) => {
  return typeof str === 'string' && str.length <= maxLength;
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
  isValidTimeControl,
  isValidString,
  authenticateAdmin
};
