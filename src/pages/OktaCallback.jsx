// OktaCallback.jsx - BULLETPROOF SINGLE EXECUTION
import { useState,useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getSecret } from '../config/secrets';
import { useAuth } from '../context/AuthContext';


const OktaCallback = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { oktaLogin } = useAuth();

  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) {
      return;
    }

    if (location.pathname === '/auth/callback') {
      hasProcessed.current = true;
      processCallback();
    }
  }, [location]);

  async function processCallback() {
    setIsProcessing(true);
    try {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const codeVerifier = localStorage.getItem('pkce_verifier');

      if (!code || !codeVerifier) {
        throw new Error('Missing code or verifier');
      }

      const oktaDomain = getSecret('OKTA_DOMAIN');
      const clientId = getSecret('OKTA_CLIENT_ID');
      const redirectUri = getSecret('OKTA_REDIRECT_URI') || 'http://localhost:5000/auth/callback';
  

      const tokenResponse = await fetch(
        `${oktaDomain}/oauth2/default/v1/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId || '',
            code_verifier: codeVerifier
          })
        }
      );

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('TOKEN ERROR:', errorText);
        throw new Error(`Token failed: ${tokenResponse.status} - ${errorText}`);
      }

      const tokens = await tokenResponse.json();

      const userInfoResponse = await fetch(
        `${oktaDomain}/oauth2/default/v1/userinfo`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        throw new Error(`Userinfo failed: ${userInfoResponse.status} - ${errorText}`);
      }

      const userInfo = await userInfoResponse.json();
      const backendUrl = getSecret('BACKEND_URL');

      const authResponse = await fetch(`${backendUrl}/api/auth/okta/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          okta_id: userInfo.sub,
          email: userInfo.email,
          username: userInfo.preferred_username || userInfo.email,
          full_name: userInfo.name,
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        throw new Error(`Backend failed: ${authResponse.status} - ${errorText}`);
      }

      const authData = await authResponse.json();
      localStorage.setItem('token', authData.tokens.accessToken);
      localStorage.setItem('currentUser', JSON.stringify(authData.user));
      oktaLogin(authData.user);
      
      localStorage.removeItem('pkce_verifier');
      navigate('/', { replace: true });

    } catch (error) {
      setError(error.message);
    } finally {
      setIsProcessing(false);
    }
  }

  if (isProcessing) return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h3>Signing in through Okta...</h3>
        </div>
      </div>
    </div>
  )
  if (error) return <div>Error: {error}</div>;
  return null;
};

export default OktaCallback;