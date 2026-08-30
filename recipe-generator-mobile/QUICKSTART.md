# Quick Start Guide - Recipe Generator Mobile

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
cd recipe-generator-mobile
npm install
```

### Step 2: Update Configuration
Edit `src/constants/index.ts` and update:
- `API_BASE_URL` - Your backend API URL
- `KEYCLOAK_CONFIG` - Your Keycloak settings

### Step 3: Start Development Server
```bash
npm start
```

### Step 4: Run on Your Device/Simulator

**Option A: Physical Device (Easiest)**
1. Install **Expo Go** from App Store (iOS) or Google Play (Android)
2. Scan the QR code shown in terminal
3. App opens in Expo Go

**Option B: iOS Simulator**
```bash
npm run ios
```
Requirements: macOS with Xcode installed

**Option C: Android Emulator**
```bash
npm run android
```
Requirements: Android Studio with emulator configured

**Option D: Web Browser**
```bash
npm run web
```

## 📋 Prerequisites Checklist

- [ ] Node.js 16+ installed
- [ ] npm or yarn installed
- [ ] Backend API running and accessible
- [ ] Keycloak configured with mobile redirect URI
- [ ] (iOS only) Xcode installed
- [ ] (Android only) Android Studio installed

## 🔧 Common Setup Issues

### "Cannot connect to API"
✅ **Solution**: Update `API_BASE_URL` in `src/constants/index.ts`
- For physical device, use your computer's IP (not localhost)
- Example: `http://192.168.1.100:8080/api/v1`

### "Keycloak authentication fails"
✅ **Solution**: 
1. Check Keycloak client settings allow the redirect URI
2. Verify `redirectUri` in constants matches your app scheme
3. Ensure PKCE is enabled in Keycloak client

### "Expo Go won't connect"
✅ **Solution**:
1. Ensure phone and computer are on same WiFi network
2. Try running: `expo start --tunnel`
3. Check firewall settings

### "Module not found" errors
✅ **Solution**:
```bash
rm -rf node_modules
npm install
expo start -c  # Clear cache
```

## 📱 Testing Flow

1. **Login Screen** → Login with Keycloak
2. **Generate Screen** → Create a recipe (try all 4 methods)
3. **Update Recipe** → Refine the generated recipe
4. **Recipes Screen** → View your saved recipes
5. **Profile Screen** → Check your profile & logout

## 🎯 Development Tips

### Hot Reload
- Save any file and see changes instantly
- Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android) for dev menu

### Debugging
- Console logs appear in terminal
- Use React DevTools for component inspection
- Press `j` in terminal to open debugger

### Testing on Multiple Devices
- Multiple devices can connect to same dev server
- Each device shows same hot reload updates

## 🏗️ Project Structure Quick Reference

```
src/
├── screens/          # 4 main screens
├── components/       # Reusable UI components
├── services/         # API & Auth logic
├── navigation/       # App navigation setup
├── constants/        # Configuration
└── types/           # TypeScript definitions
```

## 🔑 Environment Variables

Create `.env` file (optional):
```bash
cp .env.example .env
# Edit .env with your values
```

## 📦 Build Commands

```bash
# Development
npm start           # Start dev server
npm run ios         # Run on iOS
npm run android     # Run on Android
npm run web         # Run in browser

# Production
eas build --platform ios       # Build iOS app
eas build --platform android   # Build Android app
expo build:web                 # Build web version
```

## 🆘 Need Help?

1. Check [README.md](./README.md) for detailed documentation
2. Check [MIGRATION.md](./MIGRATION.md) for architecture details
3. Visit [Expo Documentation](https://docs.expo.dev)
4. Visit [React Navigation Docs](https://reactnavigation.org)

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] App starts without errors
- [ ] Login screen appears
- [ ] Can login with Keycloak
- [ ] Can navigate to Generate screen
- [ ] Can generate recipe by description
- [ ] Can view recipes list
- [ ] Can view profile
- [ ] Can logout

---

**All set!** 🎉 You now have a modern cross-platform recipe generator app! Start coding and enjoy the React Native experience.
