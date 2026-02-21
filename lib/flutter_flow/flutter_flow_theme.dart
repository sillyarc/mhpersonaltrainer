// ignore_for_file: overridden_fields, annotate_overrides

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:shared_preferences/shared_preferences.dart';

const kThemeModeKey = '__theme_mode__';

SharedPreferences? _prefs;

abstract class FlutterFlowTheme {
  static Future initialize() async =>
      _prefs = await SharedPreferences.getInstance();

  static ThemeMode get themeMode {
    final darkMode = _prefs?.getBool(kThemeModeKey);
    return darkMode == null
        ? ThemeMode.system
        : darkMode
            ? ThemeMode.dark
            : ThemeMode.light;
  }

  static void saveThemeMode(ThemeMode mode) => mode == ThemeMode.system
      ? _prefs?.remove(kThemeModeKey)
      : _prefs?.setBool(kThemeModeKey, mode == ThemeMode.dark);

  static FlutterFlowTheme of(BuildContext context) {
    return Theme.of(context).brightness == Brightness.dark
        ? DarkModeTheme()
        : LightModeTheme();
  }

  @Deprecated('Use primary instead')
  Color get primaryColor => primary;
  @Deprecated('Use secondary instead')
  Color get secondaryColor => secondary;
  @Deprecated('Use tertiary instead')
  Color get tertiaryColor => tertiary;

  late Color primary;
  late Color secondary;
  late Color tertiary;
  late Color alternate;
  late Color primaryText;
  late Color secondaryText;
  late Color primaryBackground;
  late Color secondaryBackground;
  late Color accent1;
  late Color accent2;
  late Color accent3;
  late Color accent4;
  late Color success;
  late Color warning;
  late Color error;
  late Color info;

  late Color customColor1;
  late Color customColor2;
  late Color customColor3;
  late Color customColor4;
  late Color customColor5;
  late Color customColor6;

  @Deprecated('Use displaySmallFamily instead')
  String get title1Family => displaySmallFamily;
  @Deprecated('Use displaySmall instead')
  TextStyle get title1 => typography.displaySmall;
  @Deprecated('Use headlineMediumFamily instead')
  String get title2Family => typography.headlineMediumFamily;
  @Deprecated('Use headlineMedium instead')
  TextStyle get title2 => typography.headlineMedium;
  @Deprecated('Use headlineSmallFamily instead')
  String get title3Family => typography.headlineSmallFamily;
  @Deprecated('Use headlineSmall instead')
  TextStyle get title3 => typography.headlineSmall;
  @Deprecated('Use titleMediumFamily instead')
  String get subtitle1Family => typography.titleMediumFamily;
  @Deprecated('Use titleMedium instead')
  TextStyle get subtitle1 => typography.titleMedium;
  @Deprecated('Use titleSmallFamily instead')
  String get subtitle2Family => typography.titleSmallFamily;
  @Deprecated('Use titleSmall instead')
  TextStyle get subtitle2 => typography.titleSmall;
  @Deprecated('Use bodyMediumFamily instead')
  String get bodyText1Family => typography.bodyMediumFamily;
  @Deprecated('Use bodyMedium instead')
  TextStyle get bodyText1 => typography.bodyMedium;
  @Deprecated('Use bodySmallFamily instead')
  String get bodyText2Family => typography.bodySmallFamily;
  @Deprecated('Use bodySmall instead')
  TextStyle get bodyText2 => typography.bodySmall;

  String get displayLargeFamily => typography.displayLargeFamily;
  bool get displayLargeIsCustom => typography.displayLargeIsCustom;
  TextStyle get displayLarge => typography.displayLarge;
  String get displayMediumFamily => typography.displayMediumFamily;
  bool get displayMediumIsCustom => typography.displayMediumIsCustom;
  TextStyle get displayMedium => typography.displayMedium;
  String get displaySmallFamily => typography.displaySmallFamily;
  bool get displaySmallIsCustom => typography.displaySmallIsCustom;
  TextStyle get displaySmall => typography.displaySmall;
  String get headlineLargeFamily => typography.headlineLargeFamily;
  bool get headlineLargeIsCustom => typography.headlineLargeIsCustom;
  TextStyle get headlineLarge => typography.headlineLarge;
  String get headlineMediumFamily => typography.headlineMediumFamily;
  bool get headlineMediumIsCustom => typography.headlineMediumIsCustom;
  TextStyle get headlineMedium => typography.headlineMedium;
  String get headlineSmallFamily => typography.headlineSmallFamily;
  bool get headlineSmallIsCustom => typography.headlineSmallIsCustom;
  TextStyle get headlineSmall => typography.headlineSmall;
  String get titleLargeFamily => typography.titleLargeFamily;
  bool get titleLargeIsCustom => typography.titleLargeIsCustom;
  TextStyle get titleLarge => typography.titleLarge;
  String get titleMediumFamily => typography.titleMediumFamily;
  bool get titleMediumIsCustom => typography.titleMediumIsCustom;
  TextStyle get titleMedium => typography.titleMedium;
  String get titleSmallFamily => typography.titleSmallFamily;
  bool get titleSmallIsCustom => typography.titleSmallIsCustom;
  TextStyle get titleSmall => typography.titleSmall;
  String get labelLargeFamily => typography.labelLargeFamily;
  bool get labelLargeIsCustom => typography.labelLargeIsCustom;
  TextStyle get labelLarge => typography.labelLarge;
  String get labelMediumFamily => typography.labelMediumFamily;
  bool get labelMediumIsCustom => typography.labelMediumIsCustom;
  TextStyle get labelMedium => typography.labelMedium;
  String get labelSmallFamily => typography.labelSmallFamily;
  bool get labelSmallIsCustom => typography.labelSmallIsCustom;
  TextStyle get labelSmall => typography.labelSmall;
  String get bodyLargeFamily => typography.bodyLargeFamily;
  bool get bodyLargeIsCustom => typography.bodyLargeIsCustom;
  TextStyle get bodyLarge => typography.bodyLarge;
  String get bodyMediumFamily => typography.bodyMediumFamily;
  bool get bodyMediumIsCustom => typography.bodyMediumIsCustom;
  TextStyle get bodyMedium => typography.bodyMedium;
  String get bodySmallFamily => typography.bodySmallFamily;
  bool get bodySmallIsCustom => typography.bodySmallIsCustom;
  TextStyle get bodySmall => typography.bodySmall;

  Typography get typography => ThemeTypography(this);
}

class LightModeTheme extends FlutterFlowTheme {
  @Deprecated('Use primary instead')
  Color get primaryColor => primary;
  @Deprecated('Use secondary instead')
  Color get secondaryColor => secondary;
  @Deprecated('Use tertiary instead')
  Color get tertiaryColor => tertiary;

  late Color primary = const Color(0xFF2F9BFF);
  late Color secondary = const Color(0xFF0E376D);
  late Color tertiary = const Color(0xFFF29A70);
  late Color alternate = const Color(0xFFD5DCE5);
  late Color primaryText = const Color(0xFF111827);
  late Color secondaryText = const Color(0xFF5B6B7E);
  late Color primaryBackground = const Color(0xFFF7F9FC);
  late Color secondaryBackground = const Color(0xFFFFFFFF);
  late Color accent1 = const Color(0x1A2F9BFF);
  late Color accent2 = const Color(0x1A0E376D);
  late Color accent3 = const Color(0x1AF29A70);
  late Color accent4 = const Color(0xF2FFFFFF);
  late Color success = const Color(0xFF1F9D6F);
  late Color warning = const Color(0xFFF2B632);
  late Color error = const Color(0xFFD92D20);
  late Color info = const Color(0xFFFFFFFF);

  late Color customColor1 = const Color(0xFF2F9BFF);
  late Color customColor2 = const Color(0xFFF7F9FC);
  late Color customColor3 = const Color(0xFF0E376D);
  late Color customColor4 = const Color(0xFF2F9BFF);
  late Color customColor5 = const Color(0x33242C37);
  late Color customColor6 = const Color(0xFF0F172A);
}

abstract class Typography {
  String get displayLargeFamily;
  bool get displayLargeIsCustom;
  TextStyle get displayLarge;
  String get displayMediumFamily;
  bool get displayMediumIsCustom;
  TextStyle get displayMedium;
  String get displaySmallFamily;
  bool get displaySmallIsCustom;
  TextStyle get displaySmall;
  String get headlineLargeFamily;
  bool get headlineLargeIsCustom;
  TextStyle get headlineLarge;
  String get headlineMediumFamily;
  bool get headlineMediumIsCustom;
  TextStyle get headlineMedium;
  String get headlineSmallFamily;
  bool get headlineSmallIsCustom;
  TextStyle get headlineSmall;
  String get titleLargeFamily;
  bool get titleLargeIsCustom;
  TextStyle get titleLarge;
  String get titleMediumFamily;
  bool get titleMediumIsCustom;
  TextStyle get titleMedium;
  String get titleSmallFamily;
  bool get titleSmallIsCustom;
  TextStyle get titleSmall;
  String get labelLargeFamily;
  bool get labelLargeIsCustom;
  TextStyle get labelLarge;
  String get labelMediumFamily;
  bool get labelMediumIsCustom;
  TextStyle get labelMedium;
  String get labelSmallFamily;
  bool get labelSmallIsCustom;
  TextStyle get labelSmall;
  String get bodyLargeFamily;
  bool get bodyLargeIsCustom;
  TextStyle get bodyLarge;
  String get bodyMediumFamily;
  bool get bodyMediumIsCustom;
  TextStyle get bodyMedium;
  String get bodySmallFamily;
  bool get bodySmallIsCustom;
  TextStyle get bodySmall;
}

class ThemeTypography extends Typography {
  ThemeTypography(this.theme);

  final FlutterFlowTheme theme;

  String get displayLargeFamily => 'Outfit';
  bool get displayLargeIsCustom => false;
  TextStyle get displayLarge => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 56.0,
        letterSpacing: -0.3,
      );
  String get displayMediumFamily => 'Outfit';
  bool get displayMediumIsCustom => false;
  TextStyle get displayMedium => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 40.0,
        letterSpacing: -0.2,
      );
  String get displaySmallFamily => 'Outfit';
  bool get displaySmallIsCustom => false;
  TextStyle get displaySmall => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 32.0,
        letterSpacing: -0.1,
      );
  String get headlineLargeFamily => 'Outfit';
  bool get headlineLargeIsCustom => false;
  TextStyle get headlineLarge => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w700,
        fontSize: 28.0,
      );
  String get headlineMediumFamily => 'Outfit';
  bool get headlineMediumIsCustom => false;
  TextStyle get headlineMedium => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 24.0,
      );
  String get headlineSmallFamily => 'Outfit';
  bool get headlineSmallIsCustom => false;
  TextStyle get headlineSmall => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 22.0,
      );
  String get titleLargeFamily => 'Outfit';
  bool get titleLargeIsCustom => false;
  TextStyle get titleLarge => GoogleFonts.outfit(
        color: theme.primaryText,
        fontWeight: FontWeight.w600,
        fontSize: 20.0,
      );
  String get titleMediumFamily => 'Readex Pro';
  bool get titleMediumIsCustom => false;
  TextStyle get titleMedium => GoogleFonts.readexPro(
        color: theme.primaryText,
        fontWeight: FontWeight.w500,
        fontSize: 17.0,
        height: 1.3,
      );
  String get titleSmallFamily => 'Readex Pro';
  bool get titleSmallIsCustom => false;
  TextStyle get titleSmall => GoogleFonts.readexPro(
        color: theme.primaryText,
        fontWeight: FontWeight.w500,
        fontSize: 15.0,
        height: 1.3,
      );
  String get labelLargeFamily => 'Readex Pro';
  bool get labelLargeIsCustom => false;
  TextStyle get labelLarge => GoogleFonts.readexPro(
        color: theme.secondaryText,
        fontWeight: FontWeight.w500,
        fontSize: 15.0,
        height: 1.25,
      );
  String get labelMediumFamily => 'Readex Pro';
  bool get labelMediumIsCustom => false;
  TextStyle get labelMedium => GoogleFonts.readexPro(
        color: theme.secondaryText,
        fontWeight: FontWeight.w500,
        fontSize: 13.0,
        height: 1.25,
      );
  String get labelSmallFamily => 'Readex Pro';
  bool get labelSmallIsCustom => false;
  TextStyle get labelSmall => GoogleFonts.readexPro(
        color: theme.secondaryText,
        fontWeight: FontWeight.w500,
        fontSize: 11.0,
        height: 1.2,
      );
  String get bodyLargeFamily => 'Readex Pro';
  bool get bodyLargeIsCustom => false;
  TextStyle get bodyLarge => GoogleFonts.readexPro(
        color: theme.primaryText,
        fontWeight: FontWeight.normal,
        fontSize: 16.0,
        height: 1.35,
      );
  String get bodyMediumFamily => 'Readex Pro';
  bool get bodyMediumIsCustom => false;
  TextStyle get bodyMedium => GoogleFonts.readexPro(
        color: theme.primaryText,
        fontWeight: FontWeight.normal,
        fontSize: 14.0,
        height: 1.35,
      );
  String get bodySmallFamily => 'Readex Pro';
  bool get bodySmallIsCustom => false;
  TextStyle get bodySmall => GoogleFonts.readexPro(
        color: theme.primaryText,
        fontWeight: FontWeight.normal,
        fontSize: 12.0,
        height: 1.35,
      );
}

class DarkModeTheme extends FlutterFlowTheme {
  @Deprecated('Use primary instead')
  Color get primaryColor => primary;
  @Deprecated('Use secondary instead')
  Color get secondaryColor => secondary;
  @Deprecated('Use tertiary instead')
  Color get tertiaryColor => tertiary;

  late Color primary = const Color(0xFF5EBBFF);
  late Color secondary = const Color(0xFF1B4A84);
  late Color tertiary = const Color(0xFFF3A37F);
  late Color alternate = const Color(0xFF2A3340);
  late Color primaryText = const Color(0xFFF7FAFC);
  late Color secondaryText = const Color(0xFFA7B3C2);
  late Color primaryBackground = const Color(0xFF0F151E);
  late Color secondaryBackground = const Color(0xFF161F2B);
  late Color accent1 = const Color(0x295EBBFF);
  late Color accent2 = const Color(0x2B1B4A84);
  late Color accent3 = const Color(0x2BF3A37F);
  late Color accent4 = const Color(0xB2161F2B);
  late Color success = const Color(0xFF2FAF7A);
  late Color warning = const Color(0xFFF3BF4D);
  late Color error = const Color(0xFFF97066);
  late Color info = const Color(0xFFFFFFFF);

  late Color customColor1 = const Color(0xFF5EBBFF);
  late Color customColor2 = const Color(0xFF141B25);
  late Color customColor3 = const Color(0xFF5EBBFF);
  late Color customColor4 = const Color(0xFF1B4A84);
  late Color customColor5 = const Color(0x33141B25);
  late Color customColor6 = const Color(0xFFE6EDF5);
}

extension TextStyleHelper on TextStyle {
  TextStyle override({
    TextStyle? font,
    String? fontFamily,
    Color? color,
    double? fontSize,
    FontWeight? fontWeight,
    double? letterSpacing,
    FontStyle? fontStyle,
    bool useGoogleFonts = false,
    TextDecoration? decoration,
    double? lineHeight,
    List<Shadow>? shadows,
    String? package,
  }) {
    if (useGoogleFonts && fontFamily != null) {
      font = GoogleFonts.getFont(fontFamily,
          fontWeight: fontWeight ?? this.fontWeight,
          fontStyle: fontStyle ?? this.fontStyle);
    }

    return font != null
        ? font.copyWith(
            color: color ?? this.color,
            fontSize: fontSize ?? this.fontSize,
            letterSpacing: letterSpacing ?? this.letterSpacing,
            fontWeight: fontWeight ?? this.fontWeight,
            fontStyle: fontStyle ?? this.fontStyle,
            decoration: decoration,
            height: lineHeight,
            shadows: shadows,
          )
        : copyWith(
            fontFamily: fontFamily,
            package: package,
            color: color,
            fontSize: fontSize,
            letterSpacing: letterSpacing,
            fontWeight: fontWeight,
            fontStyle: fontStyle,
            decoration: decoration,
            height: lineHeight,
            shadows: shadows,
          );
  }
}
