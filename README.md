# EyE-Protect

EyE-Protect is a gentle eye-break companion for macOS and Windows. It helps people step away from continuous near-screen work without blocking the screen, locking input, or interrupting a task by force.

The default rhythm is 30 minutes of work followed by a user-started 3-minute distance break. After four work sessions, EyE-Protect suggests a longer 15-minute break. Every reminder can be started, snoozed, skipped, or hidden.

## Design principles

- Gentle prompts, never forced breaks
- Explicit user control over when the next work session begins
- English by default, with Simplified Chinese available
- No account, analytics, advertising, or cloud storage
- No camera, microphone, or eye-tracking permissions
- Local settings stored with restrictive file permissions
- Accessible, low-stimulation interface

EyE-Protect is a habit aid, not a medical device. It does not diagnose, treat, stop, or reverse myopia. Persistent discomfort or changing vision should be assessed by a qualified eye-care professional.

## Current features

- Configurable work, short-break, long-break, and snooze durations
- Longer break after a configurable number of work sessions
- Compact 450 × 255 timer card that hides after a work session starts
- Settings revealed by an animated expansion from the gear button
- Screen-edge reminder with Start, Snooze, and Skip actions
- Horizontal break strip with a countdown and rotating rest suggestions
- Menu bar/system tray controls
- Pause during screen lock and system sleep
- Optional inactivity-as-break detection, disabled by default
- Optional launch at login

## Development

Requirements:

- Node.js 22 or newer
- npm

Install and run:

```bash
npm install
npm start
```

Run tests:

```bash
npm test
```

Create an unpacked application:

```bash
npm run pack
```

Create platform installers on the corresponding operating system:

```bash
npm run dist:mac
npm run dist:win
```

Unsigned development builds may trigger operating-system security warnings. Public releases should be code-signed and notarized before distribution.

## Privacy

EyE-Protect does not send network requests at runtime. Preferences are written to Electron's per-user application data directory and are never committed to this repository. See [PRIVACY.md](PRIVACY.md) for details.

## Evidence-informed defaults

The widely used 20-20-20 guideline recommends looking at an object around 6 metres away for at least 20 seconds after 20 minutes of screen use. Research does not establish those exact numbers as a single optimal schedule, so EyE-Protect uses a configurable, adherence-oriented 30/3 default rather than presenting it as a medical standard.

- [World Health Organization: Steps for healthy eyes](https://www.who.int/docs/librariesprovider2/default-document-library/steps_for_healthy_eyesb9ff480d-037c-4c0f-8fb4-849b6a6bbbed.pdf)
- [American Optometric Association: Computer vision syndrome](https://www.aoa.org/healthy-eyes/eye-and-vision-conditions/computer-vision-syndrome)
- [Peer-reviewed evaluation of the 20-20-20 rule](https://pubmed.ncbi.nlm.nih.gov/36473088/)

## License

MIT. See [LICENSE](LICENSE).
