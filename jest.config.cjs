const path = require('node:path');

module.exports = {
  randomize: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.{test,spec}.ts'],
  transform: {
    '^.+\\.ts$': [
      'babel-jest',
      { configFile: path.join(__dirname, 'babel.config.test.cjs') },
    ],
  },
  // Source imports carry the `.js` extension Node ESM requires; Jest resolves the `.ts` file.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
