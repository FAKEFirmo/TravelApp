# Android packaging (Capacitor)

This is optional. The web app already supports offline via PWA caching.

Capacitor is useful if you want a **true offline** Android app that ships with the full UI/assets bundled in the APK/AAB.

## Prerequisites

- Android Studio installed
- Java/Android SDK configured

## Steps

From the project root:

```bash
npm install
npm run build

npm install @capacitor/core @capacitor/cli
npx cap init TravelApp com.fakefirmo.travelapp --web-dir dist

npm install @capacitor/android
npx cap add android
npx cap sync android
npx cap open android
```

Then build/run from Android Studio.

