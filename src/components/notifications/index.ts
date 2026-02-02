// Provider - wrap your app with this
export { NotificationProvider, useNotificationContext } from './NotificationProvider';
export type { NotificationPreferences, ToastNotification, NotificationContextValue } from './NotificationProvider';

// Components
export { default as NotificationCenter } from './NotificationCenter';
export { default as NotificationToastContainer } from './NotificationToastContainer';
export { default as NotificationSettings } from './NotificationSettings';

// Legacy export for backwards compatibility
export { default as NotificationBell } from './NotificationCenter';
