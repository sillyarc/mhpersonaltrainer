# MH Personal Trainer

A complete personal trainer management platform with AI-powered training routines. The project includes two implementations:
1. **Flutter Web App** (original) - FlutterFlow-generated Flutter application
2. **React Native/Expo App** (new) - Cross-platform mobile/tablet/PC application

## Project Overview

Both applications provide:
- Personal trainer management platform
- AI-generated workout routines (OpenRouter integration)
- Client assessment tracking (online, personalized, postural evaluations)
- Online scheduling for clients
- Firebase backend integration (Auth, Firestore, Storage)
- PostgreSQL for heavy data (exercises, evaluations history, payments)
- Stripe payment integration
- Push notifications
- Multi-language support (PT, EN, ES, FR, DE)

## Tech Stack

### Flutter Web (Original)
- **Frontend**: Flutter Web (Dart)
- **Backend**: Firebase (Firestore, Auth, Storage, Functions)
- **Payments**: Stripe
- **Maps**: Google Maps API
- **Language**: Dart SDK >=3.0.0 <4.0.0

### React Native/Expo (New)
- **Frontend**: React Native 0.81.5 + Expo 54
- **Navigation**: Expo Router 6
- **State**: Zustand + React Query
- **UI**: React Native Paper + Custom Components
- **Backend**: Firebase + PostgreSQL
- **Payments**: Stripe
- **AI**: OpenRouter API
- **Language**: TypeScript 5.9

## Project Structure

### Flutter Web (Original)
```
lib/                    # Main Dart source code
  main.dart            # Application entry point
  backend/             # Backend integrations (Firebase, Stripe)
  components/          # Reusable UI components
  flutter_flow/        # FlutterFlow generated utilities
  auth/                # Authentication logic
web/                   # Web-specific files
  index.html           # Main HTML template
assets/                # Static assets (images, fonts, etc.)
plugins/               # Local Flutter plugins
build/web/             # Built web application (served by server.py)
```

### React Native/Expo (New)
```
mh-personal-trainer-react-native/
  app/                  # Expo Router screens
    (auth)/             # Authentication screens (login, register)
    (tabs)/             # Main tab navigation (home, workouts, chat, students, profile)
    admin/              # Admin dashboard screens
    chat/               # Chat and AI screens
    evaluations/        # Evaluation screens
    profile/            # Profile edit screens
    schedule/           # Scheduling screens
    workout/            # Workout detail/create screens
  src/
    components/         # Reusable UI components
      common/           # Button, Input, Card, Avatar, Loading
      chat/             # MessageBubble, ChatInput
      evaluation/       # EvaluationCard, MeasurementForm
      scheduling/       # CalendarDay, AppointmentCard
      workout/          # ExerciseCard, WorkoutTimer
    hooks/              # Custom React hooks (useAuth, useTheme, useResponsive)
    i18n/               # Internationalization (pt, en, es, fr, de)
    services/           # API services (firebase, database, ai, payments, notifications)
    store/              # Zustand stores
    theme/              # Theme configuration (colors, spacing, typography)
    types/              # TypeScript type definitions
```

## Running the Application

### Flutter Web (Original)
```bash
flutter build web --release
python server.py  # Serves on port 5000
```

### React Native/Expo (New)
```bash
cd mh-personal-trainer-react-native
npm install
npx expo start --web  # For web development
npx expo start        # For mobile (requires Expo Go app)
```

#### Required Environment Variables
Copy `.env.example` to `.env` and configure:
- `EXPO_PUBLIC_FIREBASE_*` - Firebase configuration
- `EXPO_PUBLIC_API_URL` - Backend API URL for PostgreSQL operations
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe public key
- `EXPO_PUBLIC_OPENROUTER_API_KEY` - OpenRouter AI API key

#### Backend API Required Endpoints
The React Native app expects these API endpoints for PostgreSQL data:
- `GET /api/exercises` - Exercise catalog
- `POST /api/evaluations` - Save evaluations
- `GET /api/evaluations/user/:userId` - User evaluation history
- `POST /api/workout-logs` - Save workout logs
- `GET /api/payments/user/:userId` - Payment history

## Development

To rebuild after code changes:
```bash
flutter pub get
flutter build web --release
```

Then restart the workflow.

## Environment Notes

- The app uses Firebase services that are pre-configured
- Stripe integration requires HTTPS in production
- Google Maps API key is embedded in index.html

## Known Considerations

- The app uses CanvasKit rendering which requires WebGL
- CPU-only fallback may occur in environments without WebGL support
- Modern browsers with WebGL support will render properly

## Recent Changes (January 2026)

### Bug Fixes Implemented

1. **BUG 10 - Video Player Error Handling** (`lib/iniciar_treino_novo/iniciar_treino_novo_widget.dart`)
   - Fixed `_VideoSection` widget to properly handle null/empty video URLs
   - Added error state with retry functionality
   - Shows user-friendly message when exercise has no video registered

2. **BUG 11 - Firebase Query Caching** (`lib/backend/cache_service.dart`)
   - Created `CacheService` singleton for query result caching
   - TTL-based caching: defaultTTL (5min), shortTTL (2min), longTTL (15min)
   - Prevents duplicate Firebase queries via pending request deduplication
   - Pattern-based cache invalidation support

3. **BUG 2 - Null SeriesRepeticoes Handling** (`lib/personal/painel_administrativo_do_personal/`)
   - The existing code already has proper null checks for SeriesRepeticoesRecord
   - The record schema provides safe default values (empty strings) for null fields

### React Native App Navigation Fixes (January 2026)

1. **Firebase Auth Initialization** (`mh-personal-trainer-react-native/src/services/firebase.ts`)
   - Fixed singleton pattern with `initialized` flag to prevent double initialization
   - Added `initializeFirebase()` function that returns `{ app, auth, db, storage }`
   - Firebase Auth now properly initializes before being used by components

2. **Auth State Loading Fix** (`mh-personal-trainer-react-native/app/_layout.tsx`)
   - Fixed auth state listener to call `setLoading(false)` for both authenticated and unauthenticated users
   - Previously only called when user was null, causing navigation to hang

3. **Splash Screen Navigation** (`mh-personal-trainer-react-native/app/index.tsx`)
   - Refactored navigation logic to use `useRef` for tracking navigation state
   - Prevents duplicate navigation calls
   - Navigates immediately when auth state is resolved

4. **useAuth Hook Fix** (`mh-personal-trainer-react-native/src/hooks/useAuth.ts`)
   - Changed from static import of `auth` to using `initializeFirebase()` function
   - Ensures Firebase is always initialized before auth operations are called

### Theme System Migration (January 2026)

Complete theme system rebuild to match Flutter app exactly:

1. **Color System** (`mh-personal-trainer-react-native/src/theme/colors.ts`)
   - Primary: #38B6FF (MH blue)
   - Secondary: #002A5D (dark blue)
   - Tertiary: #EE8B60 (orange accent)
   - Light and dark mode variants matching Flutter's FlutterFlowTheme
   - Gradient support for backgrounds

2. **Typography** (`mh-personal-trainer-react-native/src/theme/typography.ts`)
   - Outfit font for headings (displayLarge, headlineMedium, titleLarge, etc.)
   - Readex Pro font for body text (bodyLarge, bodyMedium, labelSmall, etc.)
   - Matches Flutter's typography scale exactly

3. **useTheme Hook** (`mh-personal-trainer-react-native/src/hooks/useTheme.ts`)
   - Provides colors, typography, spacing, and borderRadius
   - Auto-detects system color scheme (light/dark)
   - isDark boolean for conditional rendering

4. **Updated Screens**
   - Login screen with gradient background and new colors
   - Splash screen with LinearGradient and new theme
   - Home screen with role-based content (aluno vs personal)
   - Workouts screen with filtering and responsive grid
   - Students screen for personal trainers with search and status filters
   - All tabs use new color scheme (primary, secondaryBackground, etc.)

5. **Responsive Design** (`mh-personal-trainer-react-native/src/hooks/useResponsive.ts`)
   - Breakpoints: mobile (<768px), tablet (768-1024px), desktop (>1024px)
   - Dynamic columns, padding, and font sizes based on screen size

### Phase 1 Migration: Authentication & Home (January 2026)

1. **Firebase Auth Persistence** (`mh-personal-trainer-react-native/src/services/firebase.ts`)
   - Implemented platform-specific auth initialization
   - Uses `initializeAuth` with `getReactNativePersistence(AsyncStorage)` on mobile
   - Uses standard `getAuth` on web with browser local persistence
   - Added singleton pattern to prevent double initialization

2. **Firestore Service** (`mh-personal-trainer-react-native/src/services/firestoreService.ts`)
   - Created comprehensive service for fetching data from Firebase
   - `getUserDocument()` - Fetch complete user profile from Firestore
   - `getTreinosDoAluno()` - Fetch workout list for students
   - `getAlunosDoPersonal()` - Fetch student list for personal trainers
   - `getAvaliacoesDoAluno()` - Fetch evaluation history
   - `getDashboardStatsForAluno()` - Calculate stats from real treino data
   - `getDashboardStatsForPersonal()` - Calculate stats from real aluno data
   - All stats derived from actual Firestore data (no random/mock values)

3. **Dashboard Data Hook** (`mh-personal-trainer-react-native/src/hooks/useDashboardData.ts`)
   - Custom hook for managing dashboard data fetching
   - Automatic data loading on mount
   - Pull-to-refresh support
   - Role-based data fetching (aluno vs personal)
   - Error handling with user feedback

4. **Updated Root Layout** (`mh-personal-trainer-react-native/app/_layout.tsx`)
   - Fetches complete user data from Firestore on auth state change
   - Updates last active time in Firestore
   - Proper error handling for user data fetch failures

5. **Updated Home Screen** (`mh-personal-trainer-react-native/app/(tabs)/index.tsx`)
   - Dynamic data from Firebase instead of mock data
   - Real-time workout list for students
   - Real-time student list for personal trainers
   - Dashboard stats calculated from actual data
   - Last evaluation display with real data
   - Empty states for when no data exists

6. **Metro Config Update** (`mh-personal-trainer-react-native/metro.config.js`)
   - Added `.cjs` extension support for Firebase compatibility
   - Disabled package exports for better module resolution
