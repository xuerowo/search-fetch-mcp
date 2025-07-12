// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        linterOptions: {
            reportUnusedDisableDirectives: false,
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["warn", {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }],
            // 允許使用 @ts-ignore 註釋
            "@typescript-eslint/ban-ts-comment": "off",
            // 允許使用 any 類型
            "@typescript-eslint/no-explicit-any": "off",
            // 允許空函數
            "@typescript-eslint/no-empty-function": "off",
            // 允許控制字元在正則表達式中
            "no-control-regex": "off",
            // 允許不必要的轉義字元
            "no-useless-escape": "off",
            // 允許條件賦值
            "no-cond-assign": "off",
            // 程式碼品質規則
            "prefer-const": "warn",
            "no-var": "error",
            "eqeqeq": ["warn", "always", { "null": "ignore" }],
            "curly": ["warn", "all"]
        }
    },
    {
        files: ["src/**/*.ts"],
        ignores: ["**/*.test.ts", "**/__tests__/**", "scripts/**", "src/logger.ts"],
        rules: {
            "no-console": "error"
        }
    },
    {
        files: ["src/logger.ts"],
        rules: {
            "no-console": "off"
        }
    },
    {
        files: ["**/*.test.ts", "**/__tests__/**/*.ts"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
            "no-console": "off"
        }
    }
);