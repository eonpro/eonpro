# Notification Sounds

This folder contains sound files for the Apple-style push notification system.

## Required Files

- `notification.mp3` - Default notification sound (recommended: short, pleasant chime)

## Adding a Sound

1. Download or create a notification sound (MP3 format, ~1-2 seconds)
2. Name it `notification.mp3`
3. Place it in this folder

## Recommended Sources

- [Notification Sounds](https://notificationsounds.com/) - Free notification sounds
- [Zapsplat](https://www.zapsplat.com/) - Free sound effects
- Apple-style: Use a short, clear chime similar to iOS/macOS notifications

## Sound Guidelines

- Duration: 0.5 - 2 seconds
- Format: MP3 (for best browser compatibility)
- Volume: Normalized to -12dB LUFS
- Character: Clear, pleasant, non-intrusive

## Integration

The sound is played via the `NotificationProvider` component when:
- `preferences.soundEnabled` is true
- The notification priority matches `preferences.soundForPriorities`
- Do Not Disturb mode is not active

```typescript
// The sound is automatically played when notifications arrive
// Configured in: src/components/notifications/NotificationProvider.tsx
audioRef.current = new Audio('/sounds/notification.mp3');
```
