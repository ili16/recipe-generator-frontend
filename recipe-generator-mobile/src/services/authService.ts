import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as AuthSession from 'expo-auth-session';
import { KEYCLOAK_CONFIG, STORAGE_KEYS } from '../constants';
import { UserProfile } from '../types';

export type AuthProvider = 'google';

const KEYCLOAK_ISSUER = `${KEYCLOAK_CONFIG.url}/realms/${KEYCLOAK_CONFIG.realm}`;
const USERINFO_ENDPOINT = `${KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo`;
const AUTHORIZATION_ENDPOINT = `${KEYCLOAK_ISSUER}/protocol/openid-connect/auth`;
const TOKEN_ENDPOINT = `${KEYCLOAK_ISSUER}/protocol/openid-connect/token`;
const REVOCATION_ENDPOINT = `${KEYCLOAK_ISSUER}/protocol/openid-connect/revoke`;

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: AUTHORIZATION_ENDPOINT,
  tokenEndpoint: TOKEN_ENDPOINT,
  revocationEndpoint: REVOCATION_ENDPOINT,
};

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private userProfile: UserProfile | null = null;
  private refreshPromise: Promise<string | null> | null = null;

  private buildRedirectUri(): string {
    const scheme = KEYCLOAK_CONFIG.redirectUri.split('://')[0];
    return AuthSession.makeRedirectUri({
      scheme,
      path: 'oauth/callback',
    });
  }

  async login(provider: AuthProvider): Promise<UserProfile | null> {
    if (provider !== 'google') {
      throw new Error('Only Google login is supported.');
    }

    try {
      const redirectUri = this.buildRedirectUri();
      const request = new AuthSession.AuthRequest({
        clientId: KEYCLOAK_CONFIG.clientId,
        responseType: AuthSession.ResponseType.Code,
        redirectUri,
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        usePKCE: true,
        extraParams: {
          kc_idp_hint: KEYCLOAK_CONFIG.googleIdpHint,
        },
      });

      const result = await request.promptAsync(DISCOVERY);
      if (result.type !== 'success' || !result.params.code) {
        return null;
      }

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: KEYCLOAK_CONFIG.clientId,
          code: result.params.code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier ?? '',
          },
        },
        DISCOVERY
      );

      const accessToken = tokenResponse.accessToken;
      if (!accessToken) {
        throw new Error('Missing access token in authorization response.');
      }

      const profile = await this.fetchUserProfile(accessToken);

      this.accessToken = accessToken;
      this.refreshToken = tokenResponse.refreshToken ?? null;
      this.tokenExpiresAt = this.resolveTokenExpiry(tokenResponse, accessToken);
      this.userProfile = profile;

      await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN, accessToken);
      if (tokenResponse.refreshToken) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_REFRESH_TOKEN, tokenResponse.refreshToken);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER_REFRESH_TOKEN);
      }
      if (this.tokenExpiresAt) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN_EXPIRES_AT, String(this.tokenExpiresAt));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER_TOKEN_EXPIRES_AT);
      }
      await AsyncStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));

      return profile;
    } catch (error) {
      console.error('Login error:', error);
      return null;
    }
  }

  private async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    try {
      const response = await axios.get(USERINFO_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.data as {
        name?: string;
        email?: string;
        preferred_username?: string;
        given_name?: string;
      };

      return {
        name: data.name ?? data.given_name ?? data.preferred_username ?? 'Google User',
        email: data.email,
        username: data.preferred_username,
      };
    } catch (error) {
      console.error('User profile fetch error:', error);
      return {
        name: 'Google User',
      };
    }
  }

  async logout(): Promise<void> {
    const accessToken = this.accessToken ?? await AsyncStorage.getItem(STORAGE_KEYS.USER_TOKEN);
    const refreshToken = this.refreshToken ?? await AsyncStorage.getItem(STORAGE_KEYS.USER_REFRESH_TOKEN);

    await this.clearSession();

    try {
      if (accessToken) {
        await this.revokeWithTimeout(accessToken);
      }
      if (refreshToken) {
        await this.revokeWithTimeout(refreshToken);
      }
    } catch (error) {
      console.error('Logout revoke warning:', error);
    }
  }

  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      await this.hydrateTokensFromStorage();
    }

    if (!this.accessToken) {
      return null;
    }

    if (this.isTokenExpiringSoon()) {
      const refreshedToken = await this.refreshAccessToken();
      if (refreshedToken) {
        return refreshedToken;
      }
    }

    return this.accessToken;
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<string | null> {
    if (!this.refreshToken) {
      const storedRefreshToken = await AsyncStorage.getItem(STORAGE_KEYS.USER_REFRESH_TOKEN);
      this.refreshToken = storedRefreshToken;
    }

    if (!this.refreshToken) {
      return null;
    }

    try {
      const tokenResponse = await AuthSession.refreshAsync(
        {
          clientId: KEYCLOAK_CONFIG.clientId,
          refreshToken: this.refreshToken,
        },
        DISCOVERY
      );

      const nextAccessToken = tokenResponse.accessToken;
      if (!nextAccessToken) {
        return null;
      }

      const nextRefreshToken = tokenResponse.refreshToken ?? this.refreshToken;
      const nextExpiresAt = this.resolveTokenExpiry(tokenResponse, nextAccessToken);

      this.accessToken = nextAccessToken;
      this.refreshToken = nextRefreshToken;
      this.tokenExpiresAt = nextExpiresAt;

      await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN, nextAccessToken);
      if (nextRefreshToken) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_REFRESH_TOKEN, nextRefreshToken);
      }
      if (nextExpiresAt) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_TOKEN_EXPIRES_AT, String(nextExpiresAt));
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.USER_TOKEN_EXPIRES_AT);
      }

      return nextAccessToken;
    } catch (error) {
      console.error('Silent token refresh failed:', error);
      await this.clearSession();
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null && token.length > 0;
  }

  async getUserProfile(): Promise<UserProfile | null> {
    if (this.userProfile) {
      return this.userProfile;
    }

    try {
      const profileStr = await AsyncStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (profileStr) {
        this.userProfile = JSON.parse(profileStr);
        return this.userProfile;
      }
    } catch (error) {
      console.error('Error getting user profile:', error);
    }
    return null;
  }

  private resolveTokenExpiry(
    tokenResponse: AuthSession.TokenResponse,
    accessToken: string
  ): number | null {
    if (typeof tokenResponse.issuedAt === 'number' && typeof tokenResponse.expiresIn === 'number') {
      return (tokenResponse.issuedAt + tokenResponse.expiresIn) * 1000;
    }

    return this.readJwtExpiry(accessToken);
  }

  private readJwtExpiry(token: string): number | null {
    try {
      const [, payload] = token.split('.');
      if (!payload) {
        return null;
      }

      const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const decoded = atob(padded);
      const parsed = JSON.parse(decoded) as { exp?: number };

      return typeof parsed.exp === 'number' ? parsed.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  private isTokenExpiringSoon(): boolean {
    if (!this.accessToken) {
      return true;
    }

    if (!this.tokenExpiresAt) {
      this.tokenExpiresAt = this.readJwtExpiry(this.accessToken);
    }

    if (!this.tokenExpiresAt) {
      return false;
    }

    const oneMinuteFromNow = Date.now() + 60_000;
    return oneMinuteFromNow >= this.tokenExpiresAt;
  }

  private async hydrateTokensFromStorage(): Promise<void> {
    const [storedToken, storedRefreshToken, storedExpiresAt] = await AsyncStorage.multiGet([
      STORAGE_KEYS.USER_TOKEN,
      STORAGE_KEYS.USER_REFRESH_TOKEN,
      STORAGE_KEYS.USER_TOKEN_EXPIRES_AT,
    ]);

    this.accessToken = storedToken[1] ?? null;
    this.refreshToken = storedRefreshToken[1] ?? null;

    const expiresAtMs = storedExpiresAt[1] ? Number(storedExpiresAt[1]) : NaN;
    this.tokenExpiresAt = Number.isFinite(expiresAtMs) ? expiresAtMs : null;

    if (!this.tokenExpiresAt && this.accessToken) {
      this.tokenExpiresAt = this.readJwtExpiry(this.accessToken);
    }
  }

  private async clearSession(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.userProfile = null;

    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_TOKEN,
      STORAGE_KEYS.USER_REFRESH_TOKEN,
      STORAGE_KEYS.USER_TOKEN_EXPIRES_AT,
      STORAGE_KEYS.USER_PROFILE,
    ]);
  }

  private async revokeWithTimeout(token: string): Promise<void> {
    await Promise.race([
      AuthSession.revokeAsync(
        {
          token,
          clientId: KEYCLOAK_CONFIG.clientId,
        },
        DISCOVERY
      ),
      new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Token revoke timeout')), 2500);
      }),
    ]);
  }
}

export default new AuthService();