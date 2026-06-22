import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*.{js,cjs,mjs,ts,cts,mts,json,md,yml,yaml}': 'vp check --fix',
  },
  fmt: {
    semi: false,
    singleQuote: true,
    sortImports: {},
    ignorePatterns: ['dist/**/*', 'src/generated/**/*'],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'error',
    },
    plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'jsdoc', 'promise'],
    rules: {
      'no-param-reassign': 'error',
      'default-param-last': 'error',
      'prefer-enum-initializers': 'error',
      'no-inferrable-types': 'error',
      'no-shadow': 'allow',
      'no-array-sort': 'allow',
      'no-await-in-loop': 'allow',
      'no-unsafe-enum-comparison': 'allow',
      'no-unsafe-type-assertion': 'allow',
      'restrict-template-expressions': 'allow',
      'typescript/consistent-return': 'allow',
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    ignorePatterns: ['dist/**/*', 'src/generated/**/*', 'prisma.config.ts'],
    jsPlugins: [
      './oxlint/prisma/index.js',
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
  },
})
