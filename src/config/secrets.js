import { API_BASE_URL } from '../config';
let secrets = {};

export async function loadSecrets() {
  if(import.meta.env.VITE_ENV==='development'){
    window.APP_SECRETS = {
      OKTA_CLIENT_ID: import.meta.env.VITE_OKTA_CLIENT_ID,
      OKTA_DOMAIN: import.meta.env.VITE_OKTA_DOMAIN,
      OKTA_REDIRECT_URI: import.meta.env.VITE_OKTA_REDIRECT_URI,
      BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
    }
    return;
  }
  const response = await fetch(`${API_BASE_URL}/api/secrets`);
  if (!response.ok) throw new Error('Failed to load secrets');
  secrets = await response.json();
  window.APP_SECRETS = secrets;
  window.APP_SECRETS = {
    OKTA_CLIENT_ID: secrets.OKTA_CLIENT_ID,
    OKTA_DOMAIN: secrets.OKTA_DOMAIN,
    OKTA_REDIRECT_URI: secrets.OKTA_REDIRECT_URI || "http://localhost:5000/auth/callback",
    BACKEND_URL: secrets.BACKEND_URL,
  }
}

export function getSecret(key) {
  return window.APP_SECRETS[key];
}