The Android preview APK is built by the GitHub Pages workflow and copied to:

  dist/downloads/RakshaCall.apk

That file is generated during deployment and is not committed here.

The workflow wraps the production web build in Capacitor, builds a
debug-signed APK, verifies its signature, and publishes it with the site.
When the APK is present, the "Get APK" screen automatically shows the
download button. The CI preview key is kept in the GitHub Actions cache;
local debug builds use their own debug key and will not update over a CI
build unless the installed app is uninstalled first.

For local builds, install the Android SDK and JDK 17, then run:

  npm run build
  npx cap sync android
  cd android
  gradlew assembleDebug

The debug APK will be at:

  android/app/build/outputs/apk/debug/app-debug.apk

Do not commit a signing key or a personal release APK to this repository.
