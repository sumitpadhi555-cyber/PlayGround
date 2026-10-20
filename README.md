# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/sumitpadhi555-cyber/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/sumitpadhi555-cyber/PlayGround)

- 🎮 [Open the project](https://omgithub.com/sumitpadhi555-cyber/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=sumitpadhi555-cyber%2FPlayGround).
- 💻 [Explore the source](https://github.com/sumitpadhi555-cyber/PlayGround).
- 🛠️ [Check build runs](https://github.com/sumitpadhi555-cyber/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/sumitpadhi555-cyber/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/sumitpadhi555-cyber).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->

## PentestGPT Linux (Android)

An offline, single-app pentest lab emulator for Android 15+ (API 35+). It pairs a
linux-style terminal with a rule-based PentestGPT coach and an intel board, so you
can practice a full recon → enum → access → flag flow against fictional targets.

- **No network access.** The app declares no `INTERNET` permission and never
  contacts real systems. Every host, service, credential, and flag is synthetic.
- **Offline coach.** `PentestGPT` is a local rule engine — no cloud, no API key.
- **Three labs.** `NEBULA` (10.10.14.7), `AURORA` (10.10.14.23), and
  `OBSIDIAN` (10.10.14.42), each with its own path to `/opt/flag.txt`.
- **Evidence + report.** Findings are tracked as you work and can be exported to a
  markdown report via copy or the Android share sheet.
- **Scope guard.** Out-of-scope hosts and domains are rejected with `SCOPE BLOCK`.

### Build and test

```bash
./gradlew :app:assembleDebug        # debug APK
./gradlew :app:testDebugUnitTest    # engine + coach tests
```

The debug APK is written to `app/build/outputs/apk/debug/app-debug.apk` and installs
as `com.omgithub.pentestgpt.debug`.

### Install on a device or emulator

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p com.omgithub.pentestgpt.debug -c android.intent.category.LAUNCHER 1
```

### Using the labs

Run `help` in the terminal for the full command list, or tap `ai hint` /
`Give me a hint` in the coach for the next step. Switch labs from the **Intel**
tab. Commands such as `nmap`, `gobuster`, `curl`, `ftp`, `ssh`, `hydra`, `cat`,
and `report` all run against the in-app simulator only.

> This is a training simulator. It does not include real exploits, real shell
> access, or any capability to target systems outside the app.
