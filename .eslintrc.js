const path = require('path');

module.exports = {
  root: true,
  extends: [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/strict-type-checked",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "plugin:security/recommended-legacy",
    "plugin:sonarjs/recommended-legacy",
    "prettier"
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: [
    "@typescript-eslint",
    "security",
    "sonarjs",
    "import"
  ],
  rules: {
    // Console & Debugging
    "no-console": "error",
    "no-debugger": "error",
    "no-alert": "error",
    
    // TypeScript Strict Rules
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",
    "@typescript-eslint/explicit-function-return-type": ["warn", {
      allowExpressions: true,
      allowTypedFunctionExpressions: true,
      allowHigherOrderFunctions: true
    }],
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-unused-vars": ["error", { 
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      destructuredArrayIgnorePattern: "^_"
    }],
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/promise-function-async": "error",
    "@typescript-eslint/require-await": "error",
    "@typescript-eslint/no-unnecessary-condition": "warn",
    "@typescript-eslint/strict-boolean-expressions": "off",
    "@typescript-eslint/consistent-type-imports": ["error", {
      prefer: "type-imports",
      fixStyle: "inline-type-imports"
    }],
    "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "interface",
        format: ["PascalCase"],
        custom: {
          regex: "^I[A-Z]",
          match: false
        }
      },
      {
        selector: "typeAlias",
        format: ["PascalCase"]
      },
      {
        selector: "enum",
        format: ["PascalCase"]
      },
      {
        selector: "enumMember",
        format: ["UPPER_CASE", "PascalCase"]
      }
    ],
    
    // Import Rules
    "import/order": ["error", {
      groups: [
        "builtin",
        "external",
        "internal",
        ["parent", "sibling"],
        "index",
        "object",
        "type"
      ],
      pathGroups: [
        {
          pattern: "react",
          group: "external",
          position: "before"
        },
        {
          pattern: "next/**",
          group: "external",
          position: "before"
        },
        {
          pattern: "@/**",
          group: "internal",
          position: "before"
        }
      ],
      pathGroupsExcludedImportTypes: ["react"],
      "newlines-between": "always",
      alphabetize: {
        order: "asc",
        caseInsensitive: true
      }
    }],
    "import/no-duplicates": "error",
    "import/no-cycle": "error",
    "no-duplicate-imports": "off",

    // Edge safety: no next/dist/* internal imports (use next/server instead)
    "no-restricted-imports": ["error", {
      patterns: [
        {
          group: ["next/dist/*", "next/dist/**"],
          message: "Do not import from next/dist/*. Use next/server for Edge runtime types."
        }
      ]
    }],
    
    // Security Rules
    "security/detect-object-injection": "warn",
    "security/detect-non-literal-regexp": "warn",
    "security/detect-non-literal-fs-filename": "warn",
    "security/detect-eval-with-expression": "error",
    "security/detect-no-csrf-before-method-override": "error",
    "security/detect-possible-timing-attacks": "warn",
    
    // Code Quality
    "sonarjs/cognitive-complexity": ["error", 20],
    "sonarjs/no-duplicate-string": ["error", { threshold: 3 }],
    "sonarjs/no-identical-functions": "error",
    "sonarjs/no-collapsible-if": "error",
    "sonarjs/prefer-immediate-return": "error",
    
    // General Best Practices
    "prefer-const": "error",
    "no-var": "error",
    eqeqeq: ["error", "always"],
    curly: ["error", "all"],
    "no-throw-literal": "error",
    "no-return-await": "off",
    "@typescript-eslint/return-await": ["error", "in-try-catch"],
    "no-param-reassign": ["error", { props: false }],
    "no-nested-ternary": "error",
    "max-depth": ["error", 4],
    "max-lines-per-function": ["warn", { max: 100, skipBlankLines: true, skipComments: true }],
    complexity: ["error", 15],
    
    // React Specific
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  },
  overrides: [
    {
      files: ["*.test.ts", "*.test.tsx", "*.spec.ts", "*.spec.tsx"],
      rules: {
        "no-console": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "max-lines-per-function": "off",
        "sonarjs/no-duplicate-string": "off"
      }
    },
    {
      files: ["scripts/**/*", "*.config.ts", "*.config.js"],
      rules: {
        "no-console": "off",
        "@typescript-eslint/no-explicit-any": "warn",
        "security/detect-non-literal-fs-filename": "off"
      }
    },
    {
      files: ["*.d.ts"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off"
      }
    },
    {
      // Legacy shim — no longer needed but keep override until file is removed
      files: ["src/lib/edge/next-server-shim.ts"],
      rules: {
        "no-restricted-imports": "off"
      }
    }
  ],
  ignorePatterns: [
    ".next",
    "node_modules",
    "coverage",
    "build",
    "dist",
    "*.js",
    "!*.config.js",
    "!.eslintrc.js"
  ],
  settings: {
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: "./tsconfig.json"
      }
    }
  }
};
