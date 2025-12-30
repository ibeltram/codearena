module.exports = {
  root: true,
  extends: ['@codearena/eslint-config/node'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
