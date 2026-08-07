// BS-104-2: desktop notifications for new chat activity, gated by the
// per-user "desktop_enabled" preference from BS-104-4.
//
// Kept deliberately framework-free (no React state) since it just wraps
// the browser Notification API - callers hold whatever settings/permission
// state they need and pass it in per-call.

export function desktopNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!desktopNotificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!desktopNotificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Shows a desktop notification for an incoming chat notification, unless
 * the tab is already focused (no point interrupting someone who's looking
 * right at it) or permission hasn't been granted.
 */
export function showDesktopNotification(title: string, body: string, onClick?: () => void): void {
  if (!desktopNotificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus()) {
    return;
  }

  const notification = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: "buildsync-notification",
  });

  if (onClick) {
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  }
}
