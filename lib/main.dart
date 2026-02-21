import 'package:provider/provider.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:google_fonts/google_fonts.dart';
import 'auth/firebase_auth/firebase_user_provider.dart';
import 'auth/firebase_auth/auth_util.dart';

import 'backend/push_notifications/push_notifications_util.dart';
import 'backend/firebase/firebase_config.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import 'flutter_flow/flutter_flow_util.dart';
import 'flutter_flow/internationalization.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'flutter_flow/firebase_app_check_util.dart';
import 'flutter_flow/nav/nav.dart';
import 'index.dart';

import 'backend/stripe/payment_manager.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  GoRouter.optionURLReflectsImperativeAPIs = true;
  usePathUrlStrategy();

  await initFirebase();

  await FlutterFlowTheme.initialize();

  await FFLocalizations.initialize();

  final appState = FFAppState(); // Initialize FFAppState
  await appState.initializePersistedState();

  await initializeStripe();
  if (!kIsWeb) {
    FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
  }

  await initializeFirebaseAppCheck();

  runApp(ChangeNotifierProvider(
    create: (context) => appState,
    child: MyApp(),
  ));
}

class MyApp extends StatefulWidget {
  // This widget is the root of your application.
  @override
  State<MyApp> createState() => _MyAppState();

  static _MyAppState of(BuildContext context) =>
      context.findAncestorStateOfType<_MyAppState>()!;
}

class MyAppScrollBehavior extends MaterialScrollBehavior {
  @override
  Set<PointerDeviceKind> get dragDevices => {
        PointerDeviceKind.touch,
        PointerDeviceKind.mouse,
      };
}

class _MyAppState extends State<MyApp> {
  Locale? _locale = FFLocalizations.getStoredLocale();

  ThemeMode _themeMode = FlutterFlowTheme.themeMode;

  late AppStateNotifier _appStateNotifier;
  late GoRouter _router;
  String getRoute([RouteMatch? routeMatch]) {
    final RouteMatch lastMatch =
        routeMatch ?? _router.routerDelegate.currentConfiguration.last;
    final RouteMatchList matchList = lastMatch is ImperativeRouteMatch
        ? lastMatch.matches
        : _router.routerDelegate.currentConfiguration;
    return matchList.uri.toString();
  }

  List<String> getRouteStack() =>
      _router.routerDelegate.currentConfiguration.matches
          .map((e) => getRoute(e))
          .toList();
  late Stream<BaseAuthUser> userStream;

  final authUserSub = authenticatedUserStream.listen((_) {});
  final fcmTokenSub = fcmTokenUserStream.listen((_) {});

  @override
  void initState() {
    super.initState();

    _appStateNotifier = AppStateNotifier.instance;
    _router = createRouter(_appStateNotifier);
    userStream = mHPersonalTrainerFirebaseUserStream()
      ..listen((user) {
        _appStateNotifier.update(user);
      });
    jwtTokenStream.listen((_) {});
    Future.delayed(
      Duration(milliseconds: isWeb ? 0 : 1000),
      () => _appStateNotifier.stopShowingSplashImage(),
    );
  }

  @override
  void dispose() {
    authUserSub.cancel();
    fcmTokenSub.cancel();
    super.dispose();
  }

  void setLocale(String language) {
    safeSetState(() => _locale = createLocale(language));
    FFLocalizations.storeLocale(language);
  }

  void setThemeMode(ThemeMode mode) => safeSetState(() {
        _themeMode = mode;
        FlutterFlowTheme.saveThemeMode(mode);
      });

  ThemeData _buildLightTheme() {
    const primary = Color(0xFF2F9BFF);
    const secondary = Color(0xFF0E376D);
    const background = Color(0xFFF7F9FC);
    const surface = Color(0xFFFFFFFF);
    const text = Color(0xFF111827);
    const secondaryText = Color(0xFF5B6B7E);
    const border = Color(0xFFD5DCE5);
    const error = Color(0xFFD92D20);

    final base = ThemeData(
      brightness: Brightness.light,
      colorScheme: const ColorScheme.light(
        primary: primary,
        secondary: secondary,
        surface: surface,
        error: error,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: text,
        onError: Colors.white,
      ),
      scaffoldBackgroundColor: background,
      useMaterial3: false,
      visualDensity: VisualDensity.adaptivePlatformDensity,
      dividerColor: border,
      splashColor: primary.withAlpha(20),
      highlightColor: primary.withAlpha(12),
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: text,
        elevation: 0.0,
        centerTitle: false,
        iconTheme: const IconThemeData(
          color: text,
          size: 22.0,
        ),
        titleTextStyle: GoogleFonts.outfit(
          color: text,
          fontWeight: FontWeight.w600,
          fontSize: 22.0,
        ),
      ),
      cardTheme: CardTheme(
        color: surface,
        elevation: 0.0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.0),
          side: const BorderSide(
            color: border,
            width: 1.0,
          ),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18.0),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        modalBackgroundColor: surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(20.0),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: background,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14.0,
          vertical: 14.0,
        ),
        labelStyle: GoogleFonts.readexPro(
          color: secondaryText,
          fontSize: 14.0,
          fontWeight: FontWeight.w500,
        ),
        hintStyle: GoogleFonts.readexPro(
          color: secondaryText.withAlpha(190),
          fontSize: 14.0,
        ),
        errorStyle: GoogleFonts.readexPro(
          color: error,
          fontSize: 12.0,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: border,
            width: 1.5,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: primary,
            width: 2.0,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: error,
            width: 1.5,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: error,
            width: 2.0,
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(44.0, 44.0),
          padding: const EdgeInsets.symmetric(
            horizontal: 20.0,
            vertical: 12.0,
          ),
          elevation: 0.0,
          backgroundColor: primary,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.0),
          ),
          textStyle: GoogleFonts.readexPro(
            fontSize: 14.0,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(44.0, 44.0),
          padding: const EdgeInsets.symmetric(
            horizontal: 18.0,
            vertical: 12.0,
          ),
          side: const BorderSide(
            color: border,
            width: 1.2,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.0),
          ),
          foregroundColor: text,
          textStyle: GoogleFonts.readexPro(
            fontSize: 14.0,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(40.0, 40.0),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10.0),
          ),
          foregroundColor: primary,
          textStyle: GoogleFonts.readexPro(
            fontSize: 14.0,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          minimumSize: MaterialStateProperty.all(const Size(44.0, 44.0)),
          padding: MaterialStateProperty.all(const EdgeInsets.all(10.0)),
          shape: MaterialStateProperty.all(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12.0),
            ),
          ),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        elevation: 0.0,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: primary,
        unselectedItemColor: secondaryText,
        selectedLabelStyle: GoogleFonts.readexPro(
          fontSize: 12.0,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: GoogleFonts.readexPro(
          fontSize: 12.0,
          fontWeight: FontWeight.w500,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: primary.withAlpha(36),
        iconTheme: MaterialStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(MaterialState.selected)
                ? primary
                : secondaryText,
          ),
        ),
        labelTextStyle: MaterialStateProperty.resolveWith(
          (states) => GoogleFonts.readexPro(
            color: states.contains(MaterialState.selected)
                ? primary
                : secondaryText,
            fontSize: 12.0,
            fontWeight: states.contains(MaterialState.selected)
                ? FontWeight.w600
                : FontWeight.w500,
          ),
        ),
      ),
      scrollbarTheme: ScrollbarThemeData(
        thumbVisibility: MaterialStateProperty.resolveWith(
          (states) =>
              states.contains(MaterialState.dragged) ||
              states.contains(MaterialState.hovered),
        ),
        thickness: MaterialStateProperty.all(6.0),
        radius: const Radius.circular(100.0),
        thumbColor: MaterialStateProperty.all(primary.withAlpha(170)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: text,
        contentTextStyle: GoogleFonts.readexPro(
          color: Colors.white,
          fontSize: 13.0,
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12.0),
        ),
      ),
    );
  }

  ThemeData _buildDarkTheme() {
    const primary = Color(0xFF5EBBFF);
    const secondary = Color(0xFF1B4A84);
    const background = Color(0xFF0F151E);
    const surface = Color(0xFF161F2B);
    const text = Color(0xFFF7FAFC);
    const secondaryText = Color(0xFFA7B3C2);
    const border = Color(0xFF2A3340);
    const error = Color(0xFFF97066);

    final base = ThemeData(
      brightness: Brightness.dark,
      colorScheme: const ColorScheme.dark(
        primary: primary,
        secondary: secondary,
        surface: surface,
        error: error,
        onPrimary: Color(0xFF0F151E),
        onSecondary: Colors.white,
        onSurface: text,
        onError: Color(0xFF0F151E),
      ),
      scaffoldBackgroundColor: background,
      useMaterial3: false,
      visualDensity: VisualDensity.adaptivePlatformDensity,
      dividerColor: border,
      splashColor: primary.withAlpha(24),
      highlightColor: primary.withAlpha(14),
    );

    return base.copyWith(
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: text,
        elevation: 0.0,
        centerTitle: false,
        iconTheme: const IconThemeData(
          color: text,
          size: 22.0,
        ),
        titleTextStyle: GoogleFonts.outfit(
          color: text,
          fontWeight: FontWeight.w600,
          fontSize: 22.0,
        ),
      ),
      cardTheme: CardTheme(
        color: surface,
        elevation: 0.0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16.0),
          side: const BorderSide(
            color: border,
            width: 1.0,
          ),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18.0),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        modalBackgroundColor: surface,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(20.0),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF101A25),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14.0,
          vertical: 14.0,
        ),
        labelStyle: GoogleFonts.readexPro(
          color: secondaryText,
          fontSize: 14.0,
          fontWeight: FontWeight.w500,
        ),
        hintStyle: GoogleFonts.readexPro(
          color: secondaryText.withAlpha(190),
          fontSize: 14.0,
        ),
        errorStyle: GoogleFonts.readexPro(
          color: error,
          fontSize: 12.0,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: border,
            width: 1.5,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: primary,
            width: 2.0,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: error,
            width: 1.5,
          ),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12.0),
          borderSide: const BorderSide(
            color: error,
            width: 2.0,
          ),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(44.0, 44.0),
          padding: const EdgeInsets.symmetric(
            horizontal: 20.0,
            vertical: 12.0,
          ),
          elevation: 0.0,
          backgroundColor: primary,
          foregroundColor: const Color(0xFF0F151E),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.0),
          ),
          textStyle: GoogleFonts.readexPro(
            fontSize: 14.0,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(44.0, 44.0),
          padding: const EdgeInsets.symmetric(
            horizontal: 18.0,
            vertical: 12.0,
          ),
          side: const BorderSide(
            color: border,
            width: 1.2,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.0),
          ),
          foregroundColor: text,
          textStyle: GoogleFonts.readexPro(
            fontSize: 14.0,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(40.0, 40.0),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10.0),
          ),
          foregroundColor: primary,
          textStyle: GoogleFonts.readexPro(
            fontSize: 14.0,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: ButtonStyle(
          minimumSize: MaterialStateProperty.all(const Size(44.0, 44.0)),
          padding: MaterialStateProperty.all(const EdgeInsets.all(10.0)),
          shape: MaterialStateProperty.all(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12.0),
            ),
          ),
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        elevation: 0.0,
        type: BottomNavigationBarType.fixed,
        selectedItemColor: primary,
        unselectedItemColor: secondaryText,
        selectedLabelStyle: GoogleFonts.readexPro(
          fontSize: 12.0,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: GoogleFonts.readexPro(
          fontSize: 12.0,
          fontWeight: FontWeight.w500,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: primary.withAlpha(48),
        iconTheme: MaterialStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(MaterialState.selected)
                ? primary
                : secondaryText,
          ),
        ),
        labelTextStyle: MaterialStateProperty.resolveWith(
          (states) => GoogleFonts.readexPro(
            color: states.contains(MaterialState.selected)
                ? primary
                : secondaryText,
            fontSize: 12.0,
            fontWeight: states.contains(MaterialState.selected)
                ? FontWeight.w600
                : FontWeight.w500,
          ),
        ),
      ),
      scrollbarTheme: ScrollbarThemeData(
        thumbVisibility: MaterialStateProperty.resolveWith(
          (states) =>
              states.contains(MaterialState.dragged) ||
              states.contains(MaterialState.hovered),
        ),
        thickness: MaterialStateProperty.all(6.0),
        radius: const Radius.circular(100.0),
        thumbColor: MaterialStateProperty.all(primary.withAlpha(170)),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: const Color(0xFF1E293B),
        contentTextStyle: GoogleFonts.readexPro(
          color: text,
          fontSize: 13.0,
        ),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12.0),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'MH Personal Trainer',
      scrollBehavior: MyAppScrollBehavior(),
      localizationsDelegates: [
        FFLocalizationsDelegate(),
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        FallbackMaterialLocalizationDelegate(),
        FallbackCupertinoLocalizationDelegate(),
      ],
      locale: _locale,
      supportedLocales: const [
        Locale('pt'),
        Locale('en'),
        Locale('es'),
        Locale('fr'),
        Locale('de'),
      ],
      theme: _buildLightTheme(),
      darkTheme: _buildDarkTheme(),
      themeMode: _themeMode,
      routerConfig: _router,
    );
  }
}
