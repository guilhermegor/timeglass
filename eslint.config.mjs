import path from 'node:path';
import { builtinModules } from 'node:module';

import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importPlugin from 'eslint-plugin-import-x';
import jest from 'eslint-plugin-jest';
import tseslint from 'typescript-eslint';

const VENDOR_POLICY = {
  __root__: {
    allow: {},
  },
};

function validateVendorPolicy(policy) {
  for (const [layer, { allow = {} }] of Object.entries(policy)) {
    for (const [vendor, reason] of Object.entries(allow)) {
      if (typeof reason !== 'string' || reason.trim() === '') {
        throw new Error(
          `eslint.config.mjs: VENDOR_POLICY.${layer}.allow['${vendor}'] has no written ` +
            `reason. An allowlist entry without one is a rule that the first person who ` +
            `finds it inconvenient will widen.`
        );
      }
    }
  }
}
validateVendorPolicy(VENDOR_POLICY);

function layerFor(filename) {
  const relative = path.relative(path.join(process.cwd(), 'src'), filename);
  const [first] = relative.split(path.sep);
  return first && !first.endsWith('.ts') ? first : '__root__';
}

function vendorRoot(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const root = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return builtinModules.includes(root) ? null : root;
}

function isTypeOnlyImport(node) {
	if (node.importKind === 'type') return true;
	const list_specs = node.specifiers ?? [];
	return list_specs.length > 0 && list_specs.every((s) => s.importKind === 'type');
}

function isTypeOnlyExport(node) {
	if (node.exportKind === 'type') return true;
	const list_specs = node.specifiers ?? [];
	return list_specs.length > 0 && list_specs.every((s) => s.exportKind === 'type');
}

function isProvablyLocalSpecifier(node) {
	if (node.type !== 'TemplateLiteral' || node.quasis.length === 0) return false;
	const str_head = node.quasis[0].value.cooked ?? '';
	return str_head.startsWith('./') || str_head.startsWith('../');
}

const vendorAllowlistRule = {
  meta: {
    type: 'problem',
    docs: { description: 'deny-by-default vendor allowlist per layer, with a written reason' },
  },
  create(context) {
    const layer = layerFor(context.filename);
    const allow = VENDOR_POLICY[layer]?.allow ?? {};
    function check(node, specifier) {
      const root = vendorRoot(specifier);
      if (root === null || Object.hasOwn(allow, root)) return;
      context.report({
        node,
        message:
          `'${root}' is not allowed in layer '${layer}'. Add it to VENDOR_POLICY.${layer}` +
          `.allow in eslint.config.mjs with a written reason, or import it through a ` +
          `relative module.`,
      });
    }
    return {
      ImportDeclaration(node) {
        if (isTypeOnlyImport(node)) return;
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        if (!node.source || isTypeOnlyExport(node)) return;
        check(node, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (node.exportKind === 'type' || !node.source) return;
        check(node, node.source.value);
      },
      ImportExpression(node) {
        const cls_src = node.source;
        if (cls_src.type === 'Literal' && typeof cls_src.value === 'string') {
          check(node, cls_src.value);
          return;
        }
        if (isProvablyLocalSpecifier(cls_src)) return;
        context.report({
          node,
          message:
            'dynamic import() with a non-literal specifier cannot be checked against ' +
            'VENDOR_POLICY. Use a string literal, or a template starting "./" or "../" for a ' +
            'local module — an unresolvable specifier is not an allowed one.',
        });
      },
      TSImportEqualsDeclaration(node) {
        if (node.importKind === 'type') return;
        const cls_ref = node.moduleReference;
        if (
          cls_ref.type === 'TSExternalModuleReference' &&
          cls_ref.expression.type === 'Literal' &&
          typeof cls_ref.expression.value === 'string'
        ) {
          check(node, cls_ref.expression.value);
        }
      },
    };
  },
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.mjs',
      'sidebars.js',
      'babel.config.test.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{test,spec}.ts'],
    plugins: { jest },
    rules: {
      'no-console': 'off',
      'jest/no-export': 'error',
    },
  },

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked[0].rules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          detectObjects: true,
          ignoreArrayIndexes: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignore: [-1, 0, 1, 2],
        },
      ],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  },

  {
    files: ['src/**/*.ts'],
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 60, skipBlankLines: false, skipComments: true, IIFEs: true },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    plugins: { 'import-x': importPlugin },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ alwaysTryTypes: true, project: './tsconfig.json' }),
      ],
    },
    rules: {
      'import-x/no-unresolved': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },

  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.{test,spec}.ts'],
    plugins: { local: { rules: { 'vendor-allowlist': vendorAllowlistRule } } },
    rules: { 'local/vendor-allowlist': 'error' },
  },

  prettierConfig,
];
