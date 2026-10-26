# BasuReport for Android

Native Android shell for the hosted BasuReport application. Accounts, report submission, photo uploads, admin actions, ratings, and notifications use the same Flask server as the website.

## Build

Requires JDK 17, Android SDK platform 35, build tools 35.0.0, and an SDK location in `ANDROID_HOME` (or ignored `local.properties`). Gradle 8.11.1 is pinned by the wrapper; AGP is 8.9.1.

```bash
cd android
./gradlew :app:assembleDebug :app:lintDebug
```

Install `app/build/outputs/apk/debug/app-debug.apk` on Android 8 or newer. On first launch, enter the **HTTPS origin of your deployed BasuReport server**, for example `https://your-service.onrender.com`. The app does not host Flask or MySQL; a reachable server is required. Use Connection settings to change the server and clear login cookies. Login verification still requires the server's configured email provider.

Photo upload uses Android's document picker; take a photo with the device camera first, then select it in the picker. Back navigates within the app. Dark mode is managed by the shared website setting. Notifications are shown inside the app; background push notifications are not implemented.

The debug APK is for testing. For distribution, create a release signing key and signed release build using Android Studio. Keep signing secrets outside Git. No real server URL or credentials are bundled in this repository.

## Verification

Compilation/lint and physical-device testing are separate. Run a device check before release: connect to the real server, sign in as a resident, submit a photo, complete the report from an admin account, view both photos, submit feedback, and check the notification list and theme after relaunch.
