module.exports = {
  root: true,
  extends: ['@codearena/eslint-config/next'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
