# @agoda-com/devfeedback-vite: Measure Your Development Experience!

## Overview

Welcome to devfeedback-vite, the open-source Vite plugin that's here to make your development experience smoother than ever! We're passionate about measuring and improving the developer experience, because fast feedback loops and efficient development cycles are crucial for productivity.

By providing detailed insights into Hot Module Replacement (HMR) performance, build times, and system resource usage, this plugin helps development teams identify bottlenecks, optimize workflows, and enhance overall productivity. Because who doesn't want their Vite development server running at peak performance?

## Latest Version

Find our latest version ready to supercharge your development:

- [npm package](https://www.npmjs.com/package/@agoda-com/devfeedback-vite)

## Features

- HMR Performance Metrics: Capture detailed timing information about module updates, including server processing time and client-side application
- System Resource Monitoring: Track CPU usage, memory consumption, and other vital system information during development
- Repository Context: Automatically collect git information to correlate performance with codebase changes
- Custom Metric Collection: Extensible architecture for adding your own performance metrics
- Zero Configuration: Works out of the box with sensible defaults

## Requirements

- Node.js 18 or higher (Because we believe in moving forward, not living in the past)
- Vite 4.x or 5.x

## Installation

### npm
Add some performance tracking to your project:
```bash
npm install @agoda-com/devfeedback-vite --save-dev
```

### yarn
Sprinkle some metrics into your development environment:
```bash
yarn add -D @agoda-com/devfeedback-vite
```

### pnpm
Power up your project with:
```bash
pnpm add -D @agoda-com/devfeedback-vite
```

## Quick Start

Add the plugin to your Vite configuration. It's as simple as that!

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import devFeedback from '@agoda-com/devfeedback-vite'

export default defineConfig({
  plugins: [
    devFeedback()
  ]
})
```

Below is example with optional config, no config is required.

```typescript
devFeedback({
      // optional configuration
      endpoint: 'http://your-metrics-endpoint',
      sampleRate: 1.0,
      includeSystemMetrics: true
    })
```


## Configuration Options

Fine-tune your metrics collection:

```typescript
interface DevFeedbackOptions {
  // URL where metrics will be sent
  endpoint?: string;
  
  // Sampling rate for metric collection (0.0 to 1.0)
  sampleRate?: number;
  
  // Include system metrics like CPU and memory usage
  includeSystemMetrics?: boolean;
  
  // Custom tags to add to all metrics
  tags?: Record<string, string>;
}
```

## Contributing

We welcome contributions! Whether you're fixing bugs, improving documentation, or adding new features, we appreciate your help in making devfeedback-vite even better. Check out our [Contributing Guide](CONTRIBUTING.md) for more details on how to get started.

Remember, in the world of development metrics, there are no unimportant measurements - only insights waiting to be discovered!

## The Development Experience

We're all about optimizing the development experience here at devfeedback-vite. Our goals are:

1. Zero-Config Success: You should be able to add the plugin and get immediate value without complex setup
2. Performance Insights: Understand exactly where your development time is being spent
3. Actionable Metrics: Each measurement should help you make informed decisions about your development workflow

## And Finally...

Remember, you can't improve what you don't measure. With devfeedback-vite, you'll have insights into your development experience that you never knew you needed. (But trust us, once you have them, you won't want to develop without them!)

Happy coding, and may your HMR updates be swift! 🚀
