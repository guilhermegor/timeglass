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
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
