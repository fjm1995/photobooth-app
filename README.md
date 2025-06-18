# Photobooth Application Architecture

## Overview

The photobooth application has been refactored into a modular ES6-based architecture for improved maintainability, testability, and separation of concerns. This document provides an overview of the architecture and how the various modules interact.

## Architecture Diagram

```
┌───────────────┐     ┌─────────────────┐     ┌───────────────────┐
│               │     │                 │     │                   │
│  app.js       │────▶│  uiController   │────▶│  domElements      │
│  (Main Entry) │     │  (UI Handlers)  │     │  (DOM References) │
│               │     │                 │     │                   │
└───────┬───────┘     └────────┬────────┘     └───────────────────┘
        │                      │
        │                      │
┌───────▼───────┐     ┌────────▼────────┐     ┌───────────────────┐
│               │     │                 │     │                   │
│  state        │◀───▶│  cameraManager  │────▶│  browserCamera    │
│  (App State)  │     │  (Camera Ops)   │     │  (Browser Camera) │
│               │     │                 │     │                   │
└───────┬───────┘     └────────┬────────┘     └───────────────────┘
        │                      │
        │                      │              ┌───────────────────┐
┌───────▼───────┐              │              │                   │
│               │              └─────────────▶│  dslrCamera       │
│  settings     │                             │  (DSLR Camera)    │
│  (User Prefs) │                             │                   │
│               │                             └───────────────────┘
└───────┬───────┘
        │                      ┌──────────────────────┐
        │                      │                      │
        └─────────────────────▶│  notificationService │
                               │  (SMS/History)       │
                               │                      │
                               └──────────────────────┘
```

## Modules and Responsibilities

### Core Modules

1. **app.js** - Main application entry point
   - Initializes the application
   - Sets up event listeners
   - Orchestrates module interactions

2. **domElements.js** - DOM element references
   - Centralizes all DOM element queries
   - Provides a single source of truth for DOM access

3. **state.js** - Application state manager
   - Stores application state 
   - Serves as a central data store for all modules

### UI and Interaction Modules

4. **uiController.js** - User interface controller
   - Manages screen transitions
   - Handles user interactions
   - Orchestrates the photo capture flow

5. **settings.js** - Settings manager
   - Loads/saves user preferences to localStorage
   - Manages application settings (image quality, etc.)
   - Handles camera-specific settings

6. **utils.js** - Utility functions
   - Common helper functions (phone formatting, date formatting)
   - Error handling utilities
   - UI helper functions

### Camera Modules

7. **cameraManager.js** - Camera orchestration
   - Initializes the appropriate camera
   - Manages camera status and detection
   - Handles camera selection and switching

8. **dslrCamera.js** - DSLR camera operations
   - DSLR-specific operations
   - Preview management
   - Camera settings control

9. **browserCamera.js** - Browser camera operations
   - Browser MediaDevices API integration
   - Browser-based photo capture
   - Fallback camera when hardware isn't available

### Communication Modules

10. **notificationService.js** - Notification services
    - SMS sending
    - Photo history management
    - User interaction through notifications

## Key Workflows

### Initialization Flow
1. app.js initializes the application
2. Loads settings from localStorage
3. Sets up event listeners
4. Initializes the camera system
5. Displays the phone number entry screen

### Photo Capture Flow
1. User enters phone number and proceeds to camera screen
2. Camera system selects best available camera (DSLR, webcam, or browser)
3. User takes a photo (with countdown)
4. Photo is captured and processed
5. User sees the result and receives SMS notification
6. Application returns to phone number entry screen

### Camera Fallback Flow
1. System first tries to use hardware camera via the server
2. If not available, falls back to browser's camera API
3. If neither is available, shows appropriate error message

## Asynchronous Module Communication
- ES6 dynamic imports are used for lazy loading modules
- Promises and async/await handle asynchronous operations
- Event-based communication for user interactions

## Extensibility
The modular design allows for:
- Adding new camera types
- Supporting additional notification methods
- Extending UI without breaking existing functionality
- Easy testing of individual components

## LocalStorage Usage
- Camera preferences
- UI settings (mirror mode, etc.)
- Photo history
