const parseTimeControl = (tc) => {
  if (tc === 'unlimited') return { base: null, inc: null };
  const parts = tc.split('|');
  return { base: parseInt(parts[0]) * 60, inc: parseInt(parts[1]) };
};

module.exports = {
  parseTimeControl
};
