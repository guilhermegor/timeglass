export default {
  '*.ts': ['prettier --write', 'eslint --fix --max-warnings 0'],
  '*.{json,md}': ['prettier --write'],
  'README.md': ['bash bin/check_readme_structure.sh'],
};
