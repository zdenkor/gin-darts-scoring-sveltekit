// App-wide configuration. Client ID is runtime, not hardcoded.
//
// Scopes:
//   - drive.file  = "See, edit, create, and delete only the
//     specific Google Drive files you use with this app".
//     Lets the app read/write files it itself created.
//   - drive.appdata = "View and manage its own configuration
//     data in your Google Drive". The app's own hidden
//     appDataFolder is the home for the sync JSON files.
//     drive.file ALONE is not enough to write into
//     appDataFolder (Google returns 403 / insufficientScopes),
//     so both scopes are required.
//   - openid / email / profile = profile fetch for the avatar
//     and super-admin check.
export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata openid email profile';
export const GOOGLE_TOKEN_KEY = 'google-auth-tokens';
export const GOOGLE_USER_KEY = 'google-auth-user';
export const DRIVE_FOLDER_COMPETITIONS = 'competitions';
export const DRIVE_FOLDER_MATCHES = 'matches';
export const DRIVE_FOLDER_HISTORY = 'game-history';
export const DRIVE_MANIFEST_FILE = 'manifest.json';
export const DRIVE_SCHEMA_VERSION = 1;
