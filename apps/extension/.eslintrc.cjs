module.exports = {
  root: true,
  extends: ['@reporivals/eslint-config/node'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
