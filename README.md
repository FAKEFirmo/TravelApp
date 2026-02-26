

# TravelApp 

A cross-platform travel tracking application designed to help you record, organize, and visualize your trips over time. Built with web technologies (React, Vite) and optimized for mobile devices (Android/iOS) via Capacitor.

## Features

* **Interactive 3D Globe**: Relive your travels on a fully interactive 3D globe. Navigate smoothly using native two-finger touch gestures to zoom in and out without bulky UI controls.
* **Smart Map Toggles**: Long-press the globe navigation button for 1 second to reveal a quick-access menu. Easily toggle the visibility of specific city pins (📍) and highlighted visited countries.
* **Travel Journal**:
  * **Countries**: A clean, straightforward list of all the nations you have explored.
  * **Trips**: A sleek overview of your specific journeys. Long-press any trip card to seamlessly expand it, revealing the sequence of cities visited and your personal notes at the bottom.
  * **Immersive Scrolling**: The journal utilizes a gradual blur mask at the top and bottom of the screen, fading the text smoothly as you scroll through your history.
* **Modern Interface**: The app features a custom "liquid glass" UI that distorts the content behind it, providing a beautiful, immersive depth effect. The bottom navigation bar uses a perfectly balanced grid layout with dynamic, pill-shaped highlights that react instantly to your interactions.

## Tech Stack

* **Frontend**: React 18, TypeScript, Vite
* **Map & 3D**: `react-globe.gl` (WebGL-powered globe visualization)
* **Mobile/Cross-Platform**: Capacitor (Android, PWA)
* **Storage**: IndexedDB (Local schema-based storage for trips, visits, and notes)

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or newer recommended)
* [Android Studio](https://developer.android.com/studio) (If building for Android)

### Installation

1. Clone the repository and install dependencies:
```bash
   npm install

```

2. Run the development server (Web/PWA):
```bash
npm run dev

```



### Building for Mobile (Android)

TravelApp uses Capacitor to wrap the web app into a native mobile shell.

1. Build the web project:
```bash
npm run build

```


2. Sync the compiled code with the Android project:
```bash
npx cap sync android

```


3. Open Android Studio to build and run on an emulator or physical device:
```bash
npx cap open android

```



## Project Structure

* `/src/screens`: Main view components (`JournalScreen`, `MapScreen`).
* `/src/components`: Reusable UI elements (`GlassSurface`, `BottomBar`, `GlobeView`).
* `/src/storage`: Local database schemas and management.
* `/src/geo`: Geolocation and country-mapping logic.
* `/android`: Native Capacitor Android project files.

