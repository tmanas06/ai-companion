// Metro config for a pnpm monorepo. Required because pnpm hoists dependencies
// to the workspace root (/node_modules), but Metro only inspects the project's
// own node_modules by default.
//
// This tells Metro:
//   1. Watch the whole monorepo for changes (so edits to packages/shared refresh).
//   2. Look for modules in BOTH apps/mobile/node_modules AND the workspace root.
//
// Reference: https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm sometimes breaks Haste's ability to find duplicate copies; force Metro
// to resolve through nodeModulesPaths instead of relying on symlinks.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
