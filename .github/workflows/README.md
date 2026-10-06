# GitHub Actions Workflows

This directory contains the GitHub Actions workflows for the n8n community node project.

## Workflows

### CI (`ci.yml`)

**Purpose**: Automated testing and quality checks for pull requests and pushes to the main branch.

**Triggers**:
- Pull requests (any branch)
- Pushes to `main` branch

**What it does**:
1. Sets up Node.js (22.x, 24.x) - matching n8n compatibility
2. Installs dependencies with `npm ci --ignore-scripts`
3. Runs ESLint for code linting
4. Runs type checking (`npm run type-check`)
5. Runs Vitest test suite with coverage
6. Builds the project
7. Generates coverage summary in job output

**Secrets required**: None

**Usage**: This workflow runs automatically. No manual intervention needed.

### Publish (`publish.yml`)

**Purpose**: Publishes the package to npm, with a provenance statement, when a version tag is pushed. The build job has read-only access; the publish job holds the publish rights and only publishes the tarball the build job packed.

**Triggers**: Push of a `*.*.*` tag (e.g. `0.1.0`).

**What it does**:
1. Checks out the tag with full history and verifies it matches `package.json` and is on `main`
2. Installs dependencies with `npm ci --ignore-scripts`
3. Runs lint, tests and build
4. Packs the tarball and uploads it as an artifact
5. Publishes the tarball to npm with `--provenance`

**Secrets required**:

#### NPM_TOKEN

Only needed for the first publish, before the trusted publisher is set up. Afterwards npm authenticates through the trusted publisher (OIDC), and the secret can stay unset.

**How to obtain (first publish only)**:
1. Go to [npmjs.com](https://www.npmjs.com/)
2. Log in to your account
3. Go to "Access Tokens" in your account settings
4. Generate a granular token scoped to this package only, with read and write access
5. Leave 2FA enforcement on unless publishing from automation that requires otherwise

**How to set in repository**:
1. Go to your GitHub repository
2. Click "Settings" tab
3. In the left sidebar, click "Secrets and variables" → "Actions"
4. Click "New repository secret"
5. Name: `NPM_TOKEN`
6. Value: Paste your npm token
7. Click "Add secret"

For ongoing releases, prefer the trusted publisher over a long-lived token. See the npm docs for connecting the package to this repository's GitHub Actions identity.

#### GITHUB_TOKEN
GitHub token for repository access (automatically provided by GitHub Actions).

**No manual setup required** - This is automatically available in workflows.

**Usage**:
1. Bump the version in `package.json`, commit on `main`
2. Push a tag matching the version: `git tag 0.2.0 && git push origin 0.2.0`
3. The workflow builds, checks and publishes; prereleases (`1.0.0-beta.1`) go to the `next` dist-tag

## Troubleshooting

### "NPM_TOKEN not found" error

**Cause**: The NPM_TOKEN secret is not configured and the trusted publisher is not set up yet.

**Solutions**:
- For the first publish, create a granular token scoped to this package and add it as above
- Afterwards, configure the trusted publisher on npmjs.com so no token is needed

### Tests fail in CI but pass locally

**Possible causes**:
- Different Node.js versions (CI tests on 22.x and 24.x)
- Missing dependencies (check if all dev dependencies are in package.json)
- Environment-specific issues

**Solutions**:
- Test locally with the same Node version: `nvm use 22` or `nvm use 24`
- Run `npm ci --ignore-scripts` instead of `npm install` to match CI behavior
- Check CI logs for specific error messages
