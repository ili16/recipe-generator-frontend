# Migration Guide: Vanilla JS to React Native with Expo

## Overview

This document outlines the transformation of the Recipe Generator from a vanilla HTML/CSS/JavaScript web application to a modern React Native cross-platform mobile application.

## Architecture Comparison

### Old Stack (Vanilla JS)
```
- HTML files (index.html, generate.html, recipes.html, profile.html)
- CSS files (styles.css, navbar.css, recipes.css, loading.css)
- Vanilla JavaScript modules
- Nginx static file server
- Docker containerization
- Keycloak JS adapter
```

### New Stack (React Native + Expo)
```
- React Native + TypeScript
- Expo framework
- React Navigation
- React Native App Auth (OIDC)
- Axios for API calls
- Native mobile components
- Cross-platform: iOS, Android, Web
```

## Feature Mapping

| Old Feature | New Implementation | File Location |
|-------------|-------------------|---------------|
| **Authentication** |
| login.js + keycloak.js | authService.ts | src/services/authService.ts |
| Silent SSO check | Auth check in LoginScreen | src/screens/LoginScreen.tsx |
| **Recipe Generation** |
| generate.html | GenerateScreen component | src/screens/GenerateScreen.tsx |
| recipeSubmission.js | apiService.ts methods | src/services/apiService.ts |
| Image upload (input) | expo-image-picker | GenerateScreen.tsx |
| Voice upload (input) | expo-document-picker | GenerateScreen.tsx |
| **Recipe Management** |
| recipes.html | RecipesScreen component | src/screens/RecipesScreen.tsx |
| DisplayRecipes.js | RecipesScreen logic | src/screens/RecipesScreen.tsx |
| GetRecipes.js | apiService.getRecipes() | src/services/apiService.ts |
| **User Profile** |
| profile.html | ProfileScreen component | src/screens/ProfileScreen.tsx |
| DisplayProfile.js | ProfileScreen logic | src/screens/ProfileScreen.tsx |
| **Navigation** |
| navbar.js | React Navigation | src/navigation/AppNavigator.tsx |
| Manual page links | Stack Navigator | AppNavigator.tsx |
| **UI Components** |
| loading.css | Loading component | src/components/Loading.tsx |
| Custom CSS | React Native StyleSheet | Inline in components |
| **State Management** |
| localStorage | AsyncStorage | authService.ts, apiService.ts |
| Global keycloak object | authService singleton | src/services/authService.ts |

## Key Improvements

### 1. **Type Safety**
- **Before**: Plain JavaScript, runtime errors
- **After**: TypeScript with full type checking
- **Benefit**: Catch errors at compile time, better IDE support

### 2. **Code Organization**
- **Before**: Scattered HTML/CSS/JS files
- **After**: Modular component architecture
- **Benefit**: Easier to maintain and scale

### 3. **Authentication**
- **Before**: Keycloak JS adapter (web-only)
- **After**: React Native App Auth (OAuth2/OIDC standard)
- **Benefit**: Works natively on mobile devices

### 4. **Cross-Platform**
- **Before**: Web browser only
- **After**: iOS, Android, and Web from single codebase
- **Benefit**: Reach more users with native mobile apps

### 5. **Developer Experience**
- **Before**: Manual file refreshes, basic debugging
- **After**: Hot reload, React DevTools, TypeScript IntelliSense
- **Benefit**: Faster development cycles

### 6. **File Handling**
- **Before**: HTML file inputs (limited)
- **After**: Native image picker and document picker
- **Benefit**: Better UX, access to device features

### 7. **Performance**
- **Before**: DOM manipulation, CSS reflows
- **After**: React Native's optimized rendering
- **Benefit**: Smoother animations and interactions

## File Structure Comparison

### Old Structure
```
recipe-generator-frontend/
├── html/
│   ├── index.html
│   ├── generate.html
│   ├── recipes.html
│   └── profile.html
├── css/
│   ├── styles.css
│   ├── navbar.css
│   ├── recipes.css
│   └── loading.css
├── js/
│   ├── keycloak.js
│   ├── login.js
│   ├── recipeSubmission.js
│   ├── GetRecipes.js
│   ├── DisplayRecipes.js
│   ├── DisplayProfile.js
│   ├── Voice.js
│   ├── markdownEditor.js
│   ├── navbar.js
│   └── loading.js
└── Dockerfile
```

### New Structure
```
recipe-generator-mobile/
├── src/
│   ├── components/
│   │   └── Loading.tsx
│   ├── constants/
│   │   └── index.ts
│   ├── navigation/
│   │   └── AppNavigator.tsx
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── GenerateScreen.tsx
│   │   ├── RecipesScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── services/
│   │   ├── apiService.ts
│   │   └── authService.ts
│   └── types/
│       └── index.ts
├── App.tsx
└── package.json
```

## API Integration Changes

### Before (Vanilla JS)
```javascript
const response = await fetch(
  `${window.location.protocol}//${window.location.hostname}:${window.location.port}/api/v1/generate/by-description`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }
);
```

### After (React Native)
```typescript
const result = await apiService.generateByDescription(
  description,
  isGerman
);
// Axios client with interceptors handles auth, base URL, etc.
```

## Authentication Flow Changes

### Before (Keycloak JS)
```javascript
window.keycloak = new Keycloak({/* config */});
await keycloak.init({ onLoad: 'check-sso' });
await keycloak.login();
```

### After (React Native App Auth)
```typescript
const result = await authorize(authConfig);
// PKCE flow, secure token storage
```

## Styling Changes

### Before (CSS)
```css
.recipe-card {
  background-color: white;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 15px;
}
```

### After (React Native StyleSheet)
```typescript
const styles = StyleSheet.create({
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  }
});
```

## Deployment Changes

### Old Deployment
1. Build Docker image with Nginx
2. Deploy container to server
3. Serve static HTML/CSS/JS files
4. Access via browser

### New Deployment

**Mobile (iOS)**
1. Build with `expo build:ios` or EAS Build
2. Upload to App Store Connect
3. Submit for review
4. Users download from App Store

**Mobile (Android)**
1. Build with `expo build:android` or EAS Build
2. Upload to Google Play Console
3. Submit for review
4. Users download from Google Play

**Web**
1. Build with `expo build:web`
2. Deploy static files to CDN/server
3. Access via browser (same as before)

## Migration Benefits Summary

✅ **Native Mobile Apps** - iOS and Android from one codebase
✅ **Better UX** - Native UI components and interactions
✅ **Type Safety** - TypeScript catches errors early
✅ **Modern Architecture** - Component-based, maintainable
✅ **Better Developer Tools** - Hot reload, debugging, testing
✅ **Scalability** - Easy to add features and scale
✅ **Community & Ecosystem** - Large React Native community
✅ **Future-Proof** - Modern tech stack with active development

## Next Steps

1. **Test the new app** on iOS, Android, and Web
2. **Configure Keycloak** for mobile OAuth redirect URIs
3. **Update backend CORS** settings for mobile API access
4. **Add app icons and splash screens**
5. **Set up analytics and crash reporting** (Firebase, Sentry)
6. **Implement push notifications** if needed
7. **Add app store assets** (screenshots, descriptions)
8. **Submit to app stores** for review

## Running Side-by-Side

During the transition, you can run both versions:

**Old Version:**
```bash
cd recipe-generator-frontend
make local
# Access at http://localhost:1000
```

**New Version:**
```bash
cd recipe-generator-mobile
npm start
# Scan QR code with Expo Go or run on simulator
```

---

The migration to React Native with Expo provides a solid foundation for modern mobile app development while maintaining all the features of the original web application.
