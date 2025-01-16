# @agoda-com/devfeedback-vite

A Vite plugin for collecting development feedback metrics, focusing on HMR performance and developer experience.

## Installation

```bash
npm install @agoda-com/devfeedback-vite --save-dev
# or
yarn add -D @agoda-com/devfeedback-vite
```

## Usage

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import devFeedback from '@agoda-com/devfeedback-vite';

export default defineConfig({
  plugins: [
    devFeedback()
  ]
});
```

## Configuration

The plugin can be configured through environment variables:

- `VITE_ENDPOINT`: The endpoint where metrics will be sent (default: "http://compilation-metrics/vite")

## Metrics Collected

The plugin collects the following metrics:

### System Information
- CPU count and models
- Total memory
- Operating system details
- Node.js and V8 versions

### Repository Information
- Repository URL
- Branch name
- Commit SHA
- User information

### HMR Performance Metrics
- Server processing time
- Total update time (including client-side)
- Number of affected modules
- Detailed timing breakdown for each update phase

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint

# Format code
npm run format
```

## License

MIT © Agoda