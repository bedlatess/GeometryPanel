import vue from 'eslint-plugin-vue';
export default [
  ...vue.configs['flat/recommended'],
  { ignores: ['dist/**', 'node_modules/**', 'android/**', 'ios/**', '.tools/**'] },
  {
    files: ['src/**/*.vue'],
    // vue-tsc checks TypeScript; the approved dependency list has no TS ESLint parser.
    languageOptions: { parserOptions: { parser: false } },
    rules: {
      'vue/multi-word-component-names': 'off',
      // Ionic components use native Web Component slots, not deprecated Vue 2 slots.
      'vue/no-deprecated-slot-attribute': [
        'error',
        { ignore: ['/^Ion/'], ignoreParents: ['/^Ion/'] },
      ],
      // Typed emits are checked by vue-tsc; parser:false cannot inspect them.
      'vue/require-explicit-emits': 'off',
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
    },
  },
];
