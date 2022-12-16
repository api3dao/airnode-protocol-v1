module.exports = {
  bracketSpacing: true,
  printWidth: 120,
  singleQuote: true,
  trailingComma: 'es5',
  useTabs: false,
  overrides: [
    {
      files: '*.md',
      options: {
        parser: 'markdown',
        proseWrap: 'always',
      },
    },
    {
      files: '*.sol',
      options: {
        compiler: '0.8.9',
        printWidth: 80,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
        bracketSpacing: false,
      },
    },
  ],
};
