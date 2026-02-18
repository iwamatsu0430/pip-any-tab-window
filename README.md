# PiP Any Tab/Window

Chrome extension to Picture-in-Picture any browser tab or native window.

## Overview

This extension allows you to display any tab, window, or screen in a Picture-in-Picture window that stays on top of other windows. It's useful for monitoring terminals (like Ghostty), video calls, or any other content while working on other tasks.

## Requirements

- Chrome 116+
- macOS / Windows / Linux

## Setup

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Installation

1. Run `npm run build`
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `dist/` folder

## Usage

1. Open any website in Chrome
2. Click the extension icon
3. Select a tab, window, or screen from the picker
4. The selected content appears in a PiP window

## Features

- Picture-in-Picture for tabs, windows, and screens
- Aspect ratio maintained on initial open
- Centered display with letterboxing
- Double-click to toggle 100% zoom / fit-to-window
- Pinch to zoom (Mac trackpad)
- Scroll to pan when zoomed
- Drag to pan when zoomed
