# GitHub Actions Workflows

This directory contains the GitHub Actions workflows for the n8n community node project.

## Workflows

### CI — test (`ci.yml`)

**Purpose**: Automated testing and quality checks for pull requests and pushes to the master branch.

**Triggers**:
- Pull requests (any branch)
- Pushes to `master` branch

**What it does**:
1. Sets up Node.js (20.19, 22.x, 24.x) - matching n8n compatibility
2. Installs dependencies
3. Runs ESLint for code linting
4. Runs type checking (if available)
5. Runs Jest test suite with coverage
6. Builds the project
7. Generates coverage summary in job output

**Secrets required**: None

**Usage**: This workflow runs automatically. No manual intervention needed.

### Release — publish to npm (`publish.yml`)

**Purpose**: Manual workflow for releasing new versions of the package to npm.

**Triggers**: Manual (`workflow_dispatch`)

**Inputs**:
- `release_type` (choice, optional, default: 'patch'): Auto-increases version (patch/minor/major)
- `branch` (string, optional, default: 'master'): Branch to use for release.
- `dry_run` (boolean, optional, default: false): Test mode without publishing.

**What it does**:
1. Checks out the specified branch and verifies working directory is clean
2. Runs pre-release tests (lint and test suite)
3. Validates that the target version doesn't already exist on npm
4. Calculates next version automatically
5. For **minor/major** releases: Pre-bumps the version in package.json and commits it
6. Runs `npm run release` which uses `n8n-node release`:
   - For **patch**: n8n-node automatically bumps the patch version
   - For **minor/major**: n8n-node detects the version was already bumped and proceeds with current version
   - Builds the project
   - Generates changelog from commits
   - Creates git tag
   - Pushes commits and tag to GitHub  
   - Publishes to npm
7. Verifies the release and generates a detailed summary

**How version bumping works**:
- **Patch releases (1.0.0 → 1.0.1)**: The workflow lets `n8n-node release` handle the version bump automatically
- **Minor/Major releases (1.0.0 → 1.1.0 or 2.0.0)**: The workflow pre-bumps the version before running `n8n-node release` to avoid double-bumping issues, since `n8n-node release` by default only does patch bumps

**Important**: This corrected workflow prevents the double-bumping bug where major/minor releases would create incorrect versions (e.g., 1.0.0 → 2.0.0 → 2.0.1 instead of 2.0.0).

**Secrets required**:

#### NPM_TOKEN
npm authentication token for publishing packages.

**How to obtain**:
1. Go to [npmjs.com](https://www.npmjs.com/)
2. Log in to your account
3. Go to "Access Tokens" in your account settings
4. Click "Generate New Token"
5. Enable 'Bypass 2FA Authentication' if needed
6. Set Read and Write Permissions to All Packages
7. Generate and copy the new token

**How to set in repository**:
1. Go to your GitHub repository
2. Click "Settings" tab
3. In the left sidebar, click "Secrets and variables" → "Actions"
4. Click "New repository secret"
5. Name: `NPM_TOKEN`
6. Value: Paste your npm token
7. Click "Add secret"

#### GITHUB_TOKEN
GitHub token for repository access (automatically provided by GitHub Actions).

**No manual setup required** - This is automatically available in workflows.

**Usage**:
1. Go to GitHub Actions tab
2. Select "Release — publish to npm (manual)"
3. Click "Run workflow"
4. Fill in the inputs:
   - Choose `release_type` (patch/minor/major)
   - Optionally change branch or enable dry_run
5. Click "Run workflow"

**Examples**:
- **Patch release** (1.0.7 → 1.0.8): Leave defaults - for bug fixes and small changes
- **Minor release** (1.0.7 → 1.1.0): Set `release_type` to 'minor' - for new features that are backward compatible
- **Major release** (1.0.7 → 2.0.0): Set `release_type` to 'major' - for breaking changes
- **Dry run**: Set `dry_run` to true - test the release process without publishing

### Release Types Explained

**Important Note**: Due to a limitation in `n8n-node release`, minor and major releases will include an additional patch increment. See the [Known Issues](#known-issues) section below for details.

**Patch Release (x.y.Z → x.y.Z+1)**:
- Bug fixes and small improvements
- No new features, no breaking changes
- Safe to update automatically
- Example: Fixed a typo in error messages

**Minor Release (x.Y.z → x.Y+1.0)**:
- New features that are backward compatible
- API additions (but not removals)
- Performance improvements
- Example: Added a new optional parameter to an operation
- **Actual result**: x.Y.z → x.Y+1.1 (includes extra patch increment)

**Major Release (X.y.z → X+1.0.0)**:
- Breaking changes to the API
- Removed features or parameters
- Significant architectural changes
- Example: Changed authentication method or renamed operations
- **Actual result**: X.y.z → X+1.0.1 (includes extra patch increment)

## Known Issues

### n8n-node Release Double-Bump Bug

Due to a limitation in the `n8n-node release` command, minor and major releases will include an additional patch increment. This means:

- **Patch release**: Works as expected (e.g., 1.0.0 → 1.0.1)
- **Minor release**: Results in minor + patch (e.g., 1.0.0 → 1.1.1)
- **Major release**: Results in major + patch (e.g., 1.0.0 → 2.0.1)

This happens because the workflow manually bumps the version for minor/major releases, but `n8n-node release` applies an additional patch increment on top of the already bumped version.

If you need precise semantic versioning, consider using `release-it` directly instead of `n8n-node release`.

## Troubleshooting

### Release fails with "version already exists on npm"

**Cause**: The version you're trying to publish already exists on npm.

**Solutions**:
- Check existing versions: `npm view <package-name> versions`
- Choose a different release type (patch/minor/major)

### "NPM_TOKEN not found" error

**Cause**: The NPM_TOKEN secret is not configured or has expired.

**Solutions**:
- Verify the token exists in repository Settings → Secrets and variables → Actions
- Generate a new token on npmjs.com if the old one expired
- Ensure the token has "Skip 2FA Authentication" enabled

### Tests fail in CI but pass locally

**Possible causes**:
- Different Node.js versions (CI tests on 20.19, 22.x, and 24.x)
- Missing dependencies (check if all dev dependencies are in package.json)
- Environment-specific issues

**Solutions**:
- Test locally with the same Node version: `nvm use 20.19` or `nvm use 22`
- Run `npm ci` instead of `npm install` to match CI behavior
- Check CI logs for specific error messages

### Minor/Major releases result in unexpected version numbers

**Cause**: Known bug in `n8n-node release` that adds an extra patch increment to manually bumped versions.

**Expected behavior**:
- Minor release: 1.0.0 → 1.1.0
- Major release: 1.0.0 → 2.0.0

**Actual behavior**:
- Minor release: 1.0.0 → 1.1.1
- Major release: 1.0.0 → 2.0.1

**Solutions**:
- This is expected behavior due to the bug. The version still increments the major/minor number as intended.
- For precise semantic versioning, use `release-it` directly instead of `n8n-node release`.
