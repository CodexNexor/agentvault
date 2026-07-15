/**
 * Optional built-in Google OAuth (Desktop app).
 *
 * Open-source builds ship WITHOUT embedded secrets.
 * Users paste Client ID + Secret in Settings → Google Drive (BYO).
 * Private builds can inject via env at package time.
 */
export const GOOGLE_OAUTH = {
  clientId: '',
  clientSecret: '',
  redirectUri: 'http://127.0.0.1:42813/oauth2callback',
  scopes: ['https://www.googleapis.com/auth/drive.file'] as const,
}
