const assert = require('assert');
const { parseTimeControl } = require('./utils');

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

  console.log('All tests passed!');
} catch (err) {
  console.error('Test failed!');
  console.error(err);
  process.exit(1);
}
