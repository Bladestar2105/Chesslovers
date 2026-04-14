const assert = require('assert');

// Mock jsonwebtoken
const jwtMock = {
  verify: (token, secret) => {
    if (token === 'invalid-token') throw new Error('Invalid token');
    if (token === 'non-admin-token') return { admin: false };
    if (token === 'admin-token') return { admin: true };
    throw new Error('Unexpected token');
  }
};

const { parseTimeControl, isValidTimeControl, isValidString, authenticateAdmin: createAuthenticateAdmin } = require('./utils');

const JWT_SECRET = 'test-secret';
const authenticateAdmin = createAuthenticateAdmin(JWT_SECRET, jwtMock);

function mockRes() {
  const res = {
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

try {
  console.log('Testing parseTimeControl...');

  assert.deepStrictEqual(parseTimeControl('unlimited'), { base: null, inc: null });
  console.log('✓ unlimited');

  assert.deepStrictEqual(parseTimeControl('10|5'), { base: 600, inc: 5 });
  console.log('✓ 10|5');

  assert.deepStrictEqual(parseTimeControl('3|2'), { base: 180, inc: 2 });
  console.log('✓ 3|2');

  assert.deepStrictEqual(parseTimeControl('1|0'), { base: 60, inc: 0 });
  console.log('✓ 1|0');

  assert.deepStrictEqual(parseTimeControl('0|0'), { base: 0, inc: 0 });
  console.log('✓ 0|0');

  assert.deepStrictEqual(parseTimeControl('120|30'), { base: 7200, inc: 30 });
  console.log('✓ 120|30');

  console.log('\nTesting isValidTimeControl...');
  assert.strictEqual(isValidTimeControl('unlimited'), true);
  assert.strictEqual(isValidTimeControl('10|5'), true);
  assert.strictEqual(isValidTimeControl('0|0'), true);
  assert.strictEqual(isValidTimeControl('3|2'), true);
  assert.strictEqual(isValidTimeControl('120|30'), true);
  assert.strictEqual(isValidTimeControl('10|'), false);
  assert.strictEqual(isValidTimeControl('|5'), false);
  assert.strictEqual(isValidTimeControl('10'), false);
  assert.strictEqual(isValidTimeControl('abc|def'), false);
  assert.strictEqual(isValidTimeControl('10.5|5'), false);
  assert.strictEqual(isValidTimeControl('10|5|0'), false);
  assert.strictEqual(isValidTimeControl(null), false);
  assert.strictEqual(isValidTimeControl({}), false);
  assert.strictEqual(isValidTimeControl(123), false);
  console.log('✓ isValidTimeControl tests passed');

  console.log('\nTesting isValidString...');
  assert.strictEqual(isValidString('hello'), true);
  assert.strictEqual(isValidString(''), true);
  assert.strictEqual(isValidString('a'.repeat(255)), true);
  assert.strictEqual(isValidString('a'.repeat(256)), false);
  assert.strictEqual(isValidString('hello', 5), true);
  assert.strictEqual(isValidString('hello', 4), false);
  assert.strictEqual(isValidString(null), false);
  assert.strictEqual(isValidString({}), false);
  console.log('✓ isValidString tests passed');

  console.log('\nTesting authenticateAdmin middleware...');

  // Test case 1: Missing authorization header
  {
    const req = { headers: {} };
    const res = mockRes();
    let nextCalled = false;
    authenticateAdmin(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.jsonData, { error: 'Missing authorization header' });
    console.log('✓ Missing authorization header (401)');
  }

  // Test case 2: Invalid token
  {
    const req = { headers: { authorization: 'Bearer invalid-token' } };
    const res = mockRes();
    let nextCalled = false;
    authenticateAdmin(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.jsonData, { error: 'Invalid token' });
    console.log('✓ Invalid token (401)');
  }

  // Test case 3: Token without admin flag
  {
    const req = { headers: { authorization: 'Bearer non-admin-token' } };
    const res = mockRes();
    let nextCalled = false;
    authenticateAdmin(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.jsonData, { error: 'Not an admin' });
    console.log('✓ Token without admin flag (403)');
  }

  // Test case 4: Valid admin token
  {
    const req = { headers: { authorization: 'Bearer admin-token' } };
    const res = mockRes();
    let nextCalled = false;
    authenticateAdmin(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, true);
    console.log('✓ Valid admin token (next called)');
  }

  // Test case 5: Missing token after Bearer
  {
    const req = { headers: { authorization: 'Bearer ' } };
    const res = mockRes();
    let nextCalled = false;
    authenticateAdmin(req, res, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.jsonData, { error: 'Missing authorization header' });
    console.log('✓ Missing token after Bearer (401)');
  }

  console.log('\nAll tests passed!');
} catch (err) {
  console.error('\nTest failed!');
  console.error(err);
  process.exit(1);
}
