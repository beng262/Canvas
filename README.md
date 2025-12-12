# Canvas
A CSS based mini application for basic web based drawing.

## Features

### Dark Mode Support
The application includes comprehensive dark mode support with the following features:

- **Automatic System Detection**: The app automatically detects your system's color scheme preference and applies the appropriate theme.
- **Manual Toggle**: Use the theme toggle button (☀️/🌙) in the toolbar to switch between light and dark modes.
- **Persistent Preference**: Your theme preference is saved in localStorage and will be remembered across sessions.
- **Accessible**: The toggle button includes proper ARIA attributes (`aria-pressed`, `aria-label`) and is fully keyboard accessible.
- **Smooth Transitions**: Theme changes are animated with smooth CSS transitions for a polished user experience.

#### How to Toggle Dark Mode

1. **Using the UI**: Click the sun (☀️) or moon (🌙) button in the toolbar to toggle between light and dark modes.
2. **System Preference**: If you haven't manually set a preference, the app will automatically match your operating system's theme setting.
3. **Keyboard Navigation**: Tab to the theme toggle button and press Enter or Space to toggle the theme.

#### Technical Details

- **CSS Variables**: The entire color scheme is controlled by CSS custom properties, making it easy to customize.
- **No Flash of Incorrect Theme**: The theme is applied immediately on page load before rendering.
- **Fallback Support**: Even with JavaScript disabled, the app will respect the system's `prefers-color-scheme` media query.

## Browser Compatibility

The dark mode implementation has been tested and works on:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)

All theme colors meet WCAG AA contrast requirements for accessibility.
