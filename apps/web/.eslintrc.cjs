module.exports = {
  root: true,
  extends: ['@reporivals/eslint-config/next'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
