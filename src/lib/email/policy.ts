/**
 * Live mail is limited to position open/close alerts.
 * Report briefs and unexplained-book tape alerts stay in-app only until
 * those channels are turned back on.
 */
export const EMAIL_CHANNELS = {
  positions: true,
  reports: false,
  bookAlerts: false,
} as const;

export function reportEmailDisabled(): boolean {
  return !EMAIL_CHANNELS.reports;
}

export function bookAlertEmailDisabled(): boolean {
  return !EMAIL_CHANNELS.bookAlerts;
}
