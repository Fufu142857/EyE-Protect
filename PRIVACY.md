# Privacy

EyE-Protect is designed to work without collecting personal information.

## Data stored locally

The application stores only its settings, including timer durations, language, launch-at-login preference, and inactivity preference. The settings file is saved in the operating system's per-user application data directory with owner-only file permissions where supported.

Runtime session counters are held in memory and reset when the application exits.

## Data not collected

EyE-Protect does not collect or transmit:

- Names, email addresses, or account identifiers
- Browsing history or application usage history
- Screen contents, screenshots, camera images, or microphone audio
- Eye, face, biometric, health, or location data
- Analytics, advertising identifiers, or crash telemetry

The application does not require an account and makes no runtime network requests.

## Operating-system integration

EyE-Protect observes coarse system events such as screen lock, unlock, sleep, and resume. If the optional inactivity setting is enabled, it reads the operating system's total idle duration. These values are used only in memory to pause or reset the timer and are not logged or transmitted.

## Source repository

Do not include personal information, private keys, access tokens, local environment files, medical records, or private contact details in issues, commits, or pull requests.
