import '/auth/firebase_auth/auth_util.dart';
import '/backend/backend.dart';
import '/components/aindanaoexistegrupos_widget.dart';
import '/components/alunos_web_actions_sheet_widget.dart';
import '/components/headerweb_widget.dart';
import '/components/mandeparaseualunocriarconta_widget.dart';
import '/components/naoexistealuno_widget.dart';
import '/flutter_flow/flutter_flow_animations.dart';
import '/flutter_flow/flutter_flow_charts.dart';
import '/flutter_flow/flutter_flow_icon_button.dart';
import '/flutter_flow/flutter_flow_theme.dart';
import '/flutter_flow/flutter_flow_util.dart';
import '/flutter_flow/flutter_flow_widgets.dart';
import '/personal/card_acoes/card_acoes_widget.dart';
import 'dart:math';
import 'dart:ui';
import '/index.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:collection/collection.dart';
import 'package:easy_debounce/easy_debounce.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:simple_gradient_text/simple_gradient_text.dart';
import 'package:text_search/text_search.dart';
import 'gerenciamentodealunos_model.dart';
export 'gerenciamentodealunos_model.dart';

/// GERENCIAR ALUNOS
class GerenciamentodealunosWidget extends StatefulWidget {
  const GerenciamentodealunosWidget({super.key});

  static String routeName = 'gerenciamentodealunos';
  static String routePath = 'gerenciamentodealunos';

  @override
  State<GerenciamentodealunosWidget> createState() =>
      _GerenciamentodealunosWidgetState();
}

class _GerenciamentodealunosWidgetState
    extends State<GerenciamentodealunosWidget> with TickerProviderStateMixin {
  late GerenciamentodealunosModel _model;

  final scaffoldKey = GlobalKey<ScaffoldState>();

  final animationsMap = <String, AnimationInfo>{};

  Future<void> _openAcoesAlunoSheet(
    PersonalAccountRecord? personalAccount,
  ) async {
    await showModalBottomSheet(
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      context: context,
      builder: (context) {
        return Padding(
          padding: MediaQuery.viewInsetsOf(context),
          child: AlunosWebActionsSheetWidget(
            onCriarAluno: () async {
              if (Navigator.of(context).canPop()) {
                context.pop();
              }
              await showModalBottomSheet(
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                enableDrag: false,
                context: context,
                builder: (context) {
                  return GestureDetector(
                    onTap: () {
                      FocusScope.of(context).unfocus();
                      FocusManager.instance.primaryFocus?.unfocus();
                    },
                    child: Padding(
                      padding: MediaQuery.viewInsetsOf(context),
                      child: MandeparaseualunocriarcontaWidget(),
                    ),
                  );
                },
              ).then((value) => safeSetState(() {}));
            },
            onVincularPorEmail: () async {
              if (Navigator.of(context).canPop()) {
                context.pop();
              }
              await _vincularAlunoPorEmail(personalAccount);
            },
            onGerenciar: () async {
              if (Navigator.of(context).canPop()) {
                context.pop();
              }
              _model.howStep = 'All';
              safeSetState(() {});
            },
          ),
        );
      },
    ).then((value) => safeSetState(() {}));
  }

  Future<void> _vincularAlunoPorEmail(
    PersonalAccountRecord? personalAccount,
  ) async {
    final emailController = TextEditingController();
    final confirmed = await showDialog<bool>(
          context: context,
          builder: (dialogContext) {
            return AlertDialog(
              title: const Text('Vincular por e-mail'),
              content: TextFormField(
                controller: emailController,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Digite o e-mail do aluno',
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, false),
                  child: const Text('Cancelar'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(dialogContext, true),
                  child: const Text('Vincular'),
                ),
              ],
            );
          },
        ) ??
        false;

    if (!confirmed) {
      emailController.dispose();
      return;
    }

    final email = emailController.text.trim().toLowerCase();
    emailController.dispose();

    if (email.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Informe um e-mail vÃ¡lido.')),
      );
      return;
    }

    final codigoPersonal = personalAccount?.codigoPersonal ?? 0;
    if (codigoPersonal == 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('CÃ³digo de personal invÃ¡lido.')),
      );
      return;
    }

    final userByEmail = await queryUsersRecordOnce(
      queryBuilder: (usersRecord) => usersRecord.where(
        'email',
        isEqualTo: email,
      ),
      singleRecord: true,
    ).then((s) => s.firstOrNull);

    if (userByEmail == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Aluno nÃ£o encontrado para esse e-mail.')),
      );
      return;
    }

    await userByEmail.reference.update({
      ...createUsersRecordData(
        codigoPersonal: codigoPersonal,
        personalAccount: currentUserReference,
        nameDoSeuPersonal: personalAccount?.displayName,
      ),
      'codigodospersonaisagendado': FieldValue.arrayUnion([codigoPersonal]),
    });

    if (!mounted) {
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Aluno ${userByEmail.displayName.isNotEmpty ? userByEmail.displayName : userByEmail.email} vinculado com sucesso.',
        ),
      ),
    );
  }

  Widget _buildResumoAcademiaCard(PersonalAccountRecord? personalAccount) {
    final codigoPersonal = personalAccount?.codigoPersonal ?? 0;
    if (codigoPersonal == 0) {
      return const SizedBox.shrink();
    }

    return StreamBuilder<List<UsersRecord>>(
      stream: queryUsersRecord(
        queryBuilder: (usersRecord) => usersRecord.where(
          'codigodospersonaisagendado',
          arrayContains: codigoPersonal,
        ),
      ),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return Container(
            width: double.infinity,
            height: 220.0,
            decoration: BoxDecoration(
              color: FlutterFlowTheme.of(context).secondaryBackground,
              borderRadius: BorderRadius.circular(12.0),
            ),
            child: Center(
              child: SizedBox(
                width: 36.0,
                height: 36.0,
                child: SpinKitFadingFour(
                  color: FlutterFlowTheme.of(context).customColor3,
                  size: 36.0,
                ),
              ),
            ),
          );
        }

        final users = snapshot.data!;
        final now = DateTime.now();
        final alunosAtivos =
            users.where((u) => u.codigoPersonal == codigoPersonal).length;
        final alunosPerdidos = users
            .where((u) =>
                u.codigodospersonaisagendado.contains(codigoPersonal) &&
                u.codigoPersonal != codigoPersonal)
            .length;
        final alunosEngajados = users
            .where((u) =>
                u.codigoPersonal == codigoPersonal &&
                u.lastActiveTime != null &&
                now.difference(u.lastActiveTime!).inDays <= 30)
            .length;

        final chartData = [
          alunosAtivos.toDouble(),
          alunosPerdidos.toDouble(),
          alunosEngajados.toDouble(),
        ];
        final hasData = chartData.any((value) => value > 0);

        return Material(
          color: Colors.transparent,
          elevation: 2.0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12.0),
          ),
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: FlutterFlowTheme.of(context).secondaryBackground,
              borderRadius: BorderRadius.circular(12.0),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16.0, 16.0, 16.0, 18.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'VisÃ£o da Academia',
                        style:
                            FlutterFlowTheme.of(context).bodyLarge.override(
                                  font: GoogleFonts.readexPro(
                                    fontWeight: FontWeight.w700,
                                    fontStyle: FlutterFlowTheme.of(context)
                                        .bodyLarge
                                        .fontStyle,
                                  ),
                                  letterSpacing: 0.0,
                                  fontWeight: FontWeight.w700,
                                  fontStyle: FlutterFlowTheme.of(context)
                                      .bodyLarge
                                      .fontStyle,
                                ),
                      ),
                      Text(
                        '${users.length} no total',
                        style:
                            FlutterFlowTheme.of(context).bodySmall.override(
                                  font: GoogleFonts.readexPro(
                                    fontWeight: FlutterFlowTheme.of(context)
                                        .bodySmall
                                        .fontWeight,
                                    fontStyle: FlutterFlowTheme.of(context)
                                        .bodySmall
                                        .fontStyle,
                                  ),
                                  color:
                                      FlutterFlowTheme.of(context).secondaryText,
                                  letterSpacing: 0.0,
                                  fontWeight: FlutterFlowTheme.of(context)
                                      .bodySmall
                                      .fontWeight,
                                  fontStyle: FlutterFlowTheme.of(context)
                                      .bodySmall
                                      .fontStyle,
                                ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12.0),
                  SizedBox(
                    height: 160.0,
                    child: hasData
                        ? FlutterFlowPieChart(
                            data: FFPieChartData(
                              values: chartData,
                              colors: [
                                FlutterFlowTheme.of(context).primary,
                                const Color(0xFFE66D5E),
                                const Color(0xFF2BC08A),
                              ],
                              radius: [70.0, 70.0, 70.0],
                              borderColor: [
                                FlutterFlowTheme.of(context)
                                    .secondaryBackground,
                                FlutterFlowTheme.of(context)
                                    .secondaryBackground,
                                FlutterFlowTheme.of(context)
                                    .secondaryBackground,
                              ],
                            ),
                            donutHoleRadius: 42.0,
                            donutHoleColor:
                                FlutterFlowTheme.of(context).secondaryBackground,
                            sectionLabelType: PieChartSectionLabelType.percent,
                            sectionLabelStyle:
                                FlutterFlowTheme.of(context).labelSmall.override(
                                      font: GoogleFonts.readexPro(
                                        fontWeight: FontWeight.w600,
                                        fontStyle: FlutterFlowTheme.of(context)
                                            .labelSmall
                                            .fontStyle,
                                      ),
                                      color: FlutterFlowTheme.of(context).info,
                                      letterSpacing: 0.0,
                                      fontWeight: FontWeight.w600,
                                      fontStyle: FlutterFlowTheme.of(context)
                                          .labelSmall
                                          .fontStyle,
                                    ),
                          )
                        : Center(
                            child: Text(
                              'Sem dados para o grÃ¡fico ainda.',
                              style: FlutterFlowTheme.of(context)
                                  .bodySmall
                                  .override(
                                    font: GoogleFonts.readexPro(
                                      fontWeight: FlutterFlowTheme.of(context)
                                          .bodySmall
                                          .fontWeight,
                                      fontStyle: FlutterFlowTheme.of(context)
                                          .bodySmall
                                          .fontStyle,
                                    ),
                                    color: FlutterFlowTheme.of(context)
                                        .secondaryText,
                                    letterSpacing: 0.0,
                                    fontWeight: FlutterFlowTheme.of(context)
                                        .bodySmall
                                        .fontWeight,
                                    fontStyle: FlutterFlowTheme.of(context)
                                        .bodySmall
                                        .fontStyle,
                                  ),
                            ),
                          ),
                  ),
                  const SizedBox(height: 12.0),
                  Wrap(
                    spacing: 8.0,
                    runSpacing: 8.0,
                    children: [
                      _buildMetricChip(
                        'Alunos',
                        alunosAtivos,
                        FlutterFlowTheme.of(context).primary,
                      ),
                      _buildMetricChip(
                        'Perdidos',
                        alunosPerdidos,
                        const Color(0xFFE66D5E),
                      ),
                      _buildMetricChip(
                        'Engajados',
                        alunosEngajados,
                        const Color(0xFF2BC08A),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildMetricChip(String label, int value, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20.0),
      ),
      padding: const EdgeInsets.fromLTRB(10.0, 6.0, 10.0, 6.0),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8.0,
            height: 8.0,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6.0),
          Text(
            '$label: $value',
            style: FlutterFlowTheme.of(context).bodySmall.override(
                  font: GoogleFonts.readexPro(
                    fontWeight: FontWeight.w600,
                    fontStyle:
                        FlutterFlowTheme.of(context).bodySmall.fontStyle,
                  ),
                  letterSpacing: 0.0,
                  fontWeight: FontWeight.w600,
                  fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                ),
          ),
        ],
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _model = createModel(context, () => GerenciamentodealunosModel());

    logFirebaseEvent('screen_view',
        parameters: {'screen_name': 'gerenciamentodealunos'});
    _model.textController1 ??= TextEditingController();
    _model.textFieldFocusNode1 ??= FocusNode();

    _model.textController2 ??= TextEditingController();
    _model.textFieldFocusNode2 ??= FocusNode();

    animationsMap.addAll({
      'iconOnPageLoadAnimation1': AnimationInfo(
        loop: true,
        trigger: AnimationTrigger.onPageLoad,
        effectsBuilder: () => [
          TiltEffect(
            curve: Curves.easeInOut,
            delay: 730.0.ms,
            duration: 1710.0.ms,
            begin: Offset(0, 0.401),
            end: Offset(0, 0),
          ),
        ],
      ),
      'iconOnPageLoadAnimation2': AnimationInfo(
        loop: true,
        trigger: AnimationTrigger.onPageLoad,
        effectsBuilder: () => [
          TiltEffect(
            curve: Curves.easeInOut,
            delay: 730.0.ms,
            duration: 1710.0.ms,
            begin: Offset(0, 0.401),
            end: Offset(0, 0),
          ),
        ],
      ),
    });

    WidgetsBinding.instance.addPostFrameCallback((_) => safeSetState(() {}));
  }

  @override
  void dispose() {
    _model.dispose();

    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<PersonalAccountRecord>>(
      stream: queryPersonalAccountRecord(
        parent: currentUserReference,
        singleRecord: true,
      ),
      builder: (context, snapshot) {
        // Customize what your widget looks like when it's loading.
        if (!snapshot.hasData) {
          return Scaffold(
            backgroundColor: FlutterFlowTheme.of(context).primaryBackground,
            body: Center(
              child: SizedBox(
                width: 50.0,
                height: 50.0,
                child: SpinKitFadingFour(
                  color: FlutterFlowTheme.of(context).customColor3,
                  size: 50.0,
                ),
              ),
            ),
          );
        }
        List<PersonalAccountRecord>
            gerenciamentodealunosPersonalAccountRecordList = snapshot.data!;
        final gerenciamentodealunosPersonalAccountRecord =
            gerenciamentodealunosPersonalAccountRecordList.isNotEmpty
                ? gerenciamentodealunosPersonalAccountRecordList.first
                : null;

        return Title(
            title: 'Seus Alunos',
            color: FlutterFlowTheme.of(context).primary.withAlpha(0XFF),
            child: GestureDetector(
              onTap: () {
                FocusScope.of(context).unfocus();
                FocusManager.instance.primaryFocus?.unfocus();
              },
              child: Scaffold(
                key: scaffoldKey,
                backgroundColor: FlutterFlowTheme.of(context).primaryBackground,
                appBar: responsiveVisibility(
                  context: context,
                  desktop: false,
                )
                    ? PreferredSize(
                        preferredSize: Size.fromHeight(90.0),
                        child: AppBar(
                          backgroundColor:
                              FlutterFlowTheme.of(context).secondaryBackground,
                          automaticallyImplyLeading: false,
                          title: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.max,
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.max,
                                    children: [
                                      FlutterFlowIconButton(
                                        borderRadius: 8.0,
                                        buttonSize: 40.0,
                                        icon: Icon(
                                          Icons.arrow_back_rounded,
                                          color: FlutterFlowTheme.of(context)
                                              .primaryText,
                                          size: 24.0,
                                        ),
                                        onPressed: () async {
                                          logFirebaseEvent(
                                              'GERENCIAMENTODEALUNOS_arrow_back_rounded');
                                          logFirebaseEvent(
                                              'IconButton_navigate_back');
                                          context.safePop();
                                        },
                                      ),
                                      Text(
                                        FFLocalizations.of(context).getText(
                                          'd2on6s7n' /* Gerenciar Alunos */,
                                        ),
                                        style: FlutterFlowTheme.of(context)
                                            .headlineMedium
                                            .override(
                                              font: GoogleFonts.outfit(
                                                fontWeight: FontWeight.w500,
                                                fontStyle:
                                                    FlutterFlowTheme.of(context)
                                                        .headlineMedium
                                                        .fontStyle,
                                              ),
                                              color:
                                                  FlutterFlowTheme.of(context)
                                                      .primaryText,
                                              fontSize: 24.0,
                                              letterSpacing: 0.0,
                                              fontWeight: FontWeight.w500,
                                              fontStyle:
                                                  FlutterFlowTheme.of(context)
                                                      .headlineMedium
                                                      .fontStyle,
                                            ),
                                      ),
                                    ],
                                  ),
                                  FlutterFlowIconButton(
                                    borderRadius: 8.0,
                                    buttonSize: 40.0,
                                    icon: Icon(
                                      Icons.groups_3,
                                      color: FlutterFlowTheme.of(context)
                                          .primaryText,
                                      size: 24.0,
                                    ),
                                    onPressed: () async {
                                      logFirebaseEvent(
                                          'GERENCIAMENTODEALUNOS_groups_3_ICN_ON_TA');
                                      logFirebaseEvent(
                                          'IconButton_navigate_to');
                                      if (Navigator.of(context).canPop()) {
                                        context.pop();
                                      }
                                      context.pushNamed(
                                        GrupodetreinosWidget.routeName,
                                        extra: <String, dynamic>{
                                          kTransitionInfoKey: TransitionInfo(
                                            hasTransition: true,
                                            transitionType:
                                                PageTransitionType.fade,
                                            duration:
                                                Duration(milliseconds: 350),
                                          ),
                                        },
                                      );
                                    },
                                  ),
                                ].divide(SizedBox(width: 4.0)),
                              ),
                              Padding(
                                padding: EdgeInsetsDirectional.fromSTEB(
                                    30.0, 0.0, 0.0, 0.0),
                                child: Text(
                                  FFLocalizations.of(context).getText(
                                    'le7a2hjh' /* Gerencie todos os alunos matri... */,
                                  ),
                                  style: FlutterFlowTheme.of(context)
                                      .labelMedium
                                      .override(
                                        font: GoogleFonts.readexPro(
                                          fontWeight: FontWeight.w500,
                                          fontStyle:
                                              FlutterFlowTheme.of(context)
                                                  .labelMedium
                                                  .fontStyle,
                                        ),
                                        color: FlutterFlowTheme.of(context)
                                            .secondaryText,
                                        fontSize: 14.0,
                                        letterSpacing: 0.0,
                                        fontWeight: FontWeight.w500,
                                        fontStyle: FlutterFlowTheme.of(context)
                                            .labelMedium
                                            .fontStyle,
                                      ),
                                ),
                              ),
                            ].divide(SizedBox(height: 4.0)),
                          ),
                          actions: [],
                          centerTitle: false,
                          toolbarHeight: 90.0,
                          elevation: 0.0,
                        ),
                      )
                    : null,
                body: SafeArea(
                  top: true,
                  child: Stack(
                    children: [
                      SingleChildScrollView(
                        child: Column(
                          mainAxisSize: MainAxisSize.max,
                          children: [
                            if (responsiveVisibility(
                              context: context,
                              desktop: false,
                            ))
                              Padding(
                                padding: EdgeInsetsDirectional.fromSTEB(
                                    24.0, 10.0, 24.0, 0.0),
                                child: SingleChildScrollView(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      _buildResumoAcademiaCard(
                                        gerenciamentodealunosPersonalAccountRecord,
                                      ),
                                      Material(
                                        color: Colors.transparent,
                                        elevation: 2.0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12.0),
                                        ),
                                        child: Container(
                                          width:
                                              MediaQuery.sizeOf(context).width *
                                                  1.0,
                                          decoration: BoxDecoration(
                                            color: FlutterFlowTheme.of(context)
                                                .secondaryBackground,
                                            borderRadius:
                                                BorderRadius.circular(12.0),
                                          ),
                                          child: Padding(
                                            padding:
                                                EdgeInsetsDirectional.fromSTEB(
                                                    16.0, 16.0, 16.0, 16.0),
                                            child: Column(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Row(
                                                  mainAxisSize:
                                                      MainAxisSize.max,
                                                  mainAxisAlignment:
                                                      MainAxisAlignment
                                                          .spaceBetween,
                                                  children: [
                                                    Text(
                                                      FFLocalizations.of(
                                                              context)
                                                          .getText(
                                                        'u4ap4l45' /* Buscar aluno */,
                                                      ),
                                                      style: FlutterFlowTheme
                                                              .of(context)
                                                          .bodyLarge
                                                          .override(
                                                            font: GoogleFonts
                                                                .readexPro(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w600,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyLarge
                                                                      .fontStyle,
                                                            ),
                                                            letterSpacing: 0.0,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyLarge
                                                                    .fontStyle,
                                                          ),
                                                    ),
                                                    InkWell(
                                                      splashColor:
                                                          Colors.transparent,
                                                      focusColor:
                                                          Colors.transparent,
                                                      hoverColor:
                                                          Colors.transparent,
                                                      highlightColor:
                                                          Colors.transparent,
                                                      onTap: () async {
                                                        logFirebaseEvent(
                                                            'GERENCIAMENTODEALUNOS_Row_t51ttjtg_ON_TA');
                                                        logFirebaseEvent(
                                                            'Row_bottom_sheet');
                                                        await showModalBottomSheet(
                                                          isScrollControlled:
                                                              true,
                                                          backgroundColor:
                                                              Colors
                                                                  .transparent,
                                                          enableDrag: false,
                                                          context: context,
                                                          builder: (context) {
                                                            return GestureDetector(
                                                              onTap: () {
                                                                FocusScope.of(
                                                                        context)
                                                                    .unfocus();
                                                                FocusManager
                                                                    .instance
                                                                    .primaryFocus
                                                                    ?.unfocus();
                                                              },
                                                              child: Padding(
                                                                padding: MediaQuery
                                                                    .viewInsetsOf(
                                                                        context),
                                                                child:
                                                                    MandeparaseualunocriarcontaWidget(),
                                                              ),
                                                            );
                                                          },
                                                        ).then((value) =>
                                                            safeSetState(
                                                                () {}));
                                                      },
                                                      child: Row(
                                                        mainAxisSize:
                                                            MainAxisSize.max,
                                                        children: [
                                                          GradientText(
                                                            FFLocalizations.of(
                                                                    context)
                                                                .getText(
                                                              'yxil6ccq' /* Link de afiliaÃ§Ã£o */,
                                                            ),
                                                            style: FlutterFlowTheme
                                                                    .of(context)
                                                                .bodyMedium
                                                                .override(
                                                                  font: GoogleFonts
                                                                      .readexPro(
                                                                    fontWeight: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontWeight,
                                                                    fontStyle:
                                                                        FontStyle
                                                                            .italic,
                                                                  ),
                                                                  letterSpacing:
                                                                      0.0,
                                                                  fontWeight: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontWeight,
                                                                  fontStyle:
                                                                      FontStyle
                                                                          .italic,
                                                                ),
                                                            colors: [
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .primaryText,
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .primary
                                                            ],
                                                            gradientDirection:
                                                                GradientDirection
                                                                    .ltr,
                                                            gradientType:
                                                                GradientType
                                                                    .linear,
                                                          ),
                                                          Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        4.0,
                                                                        0.0,
                                                                        0.0,
                                                                        0.0),
                                                            child: Icon(
                                                              Icons.send_sharp,
                                                              color: FlutterFlowTheme
                                                                      .of(context)
                                                                  .primary,
                                                              size: 16.0,
                                                            ).animateOnPageLoad(
                                                                animationsMap[
                                                                    'iconOnPageLoadAnimation1']!),
                                                          ),
                                                        ],
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                TextFormField(
                                                  controller:
                                                      _model.textController1,
                                                  focusNode: _model
                                                      .textFieldFocusNode1,
                                                  onChanged: (_) =>
                                                      EasyDebounce.debounce(
                                                    '_model.textController1',
                                                    Duration(
                                                        milliseconds: 2000),
                                                    () async {
                                                      logFirebaseEvent(
                                                          'GERENCIAMENTODEALUNOS_TextField_090cytfh');
                                                      if ((_model.textFieldFocusNode1
                                                                  ?.hasFocus ??
                                                              false) !=
                                                          null) {
                                                        logFirebaseEvent(
                                                            'TextField_firestore_query');
                                                        _model.queryUsers =
                                                            await queryUsersRecordOnce(
                                                          queryBuilder:
                                                              (usersRecord) =>
                                                                  usersRecord
                                                                      .where(
                                                            'codigoPersonal',
                                                            isEqualTo:
                                                                gerenciamentodealunosPersonalAccountRecord
                                                                    ?.codigoPersonal,
                                                          ),
                                                        );
                                                        logFirebaseEvent(
                                                            'TextField_simple_search');
                                                        safeSetState(() {
                                                          _model.simpleSearchResults1 =
                                                              TextSearch(
                                                            _model.queryUsers!
                                                                .map(
                                                                  (record) => TextSearchItem
                                                                      .fromTerms(
                                                                          record,
                                                                          [
                                                                        record
                                                                            .displayName!
                                                                      ]),
                                                                )
                                                                .toList(),
                                                          )
                                                                  .search(_model
                                                                      .textController1
                                                                      .text)
                                                                  .map((r) =>
                                                                      r.object)
                                                                  .toList();
                                                          ;
                                                        });
                                                        logFirebaseEvent(
                                                            'TextField_update_page_state');
                                                        _model.howStep =
                                                            'search';
                                                        safeSetState(() {});
                                                      } else {
                                                        logFirebaseEvent(
                                                            'TextField_update_page_state');
                                                        _model.howStep = 'All';
                                                        safeSetState(() {});
                                                      }

                                                      safeSetState(() {});
                                                    },
                                                  ),
                                                  autofocus: false,
                                                  obscureText: false,
                                                  decoration: InputDecoration(
                                                    hintText:
                                                        FFLocalizations.of(
                                                                context)
                                                            .getText(
                                                      '7pgbkz65' /* Digite o nome ou matrÃ­cula... */,
                                                    ),
                                                    hintStyle:
                                                        FlutterFlowTheme.of(
                                                                context)
                                                            .bodyMedium
                                                            .override(
                                                              font: GoogleFonts
                                                                  .readexPro(
                                                                fontWeight: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontWeight,
                                                                fontStyle: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                              ),
                                                              letterSpacing:
                                                                  0.0,
                                                              fontWeight:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontWeight,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                            ),
                                                    enabledBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .alternate,
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    focusedBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            Color(0x00000000),
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    errorBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            Color(0x00000000),
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    focusedErrorBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            Color(0x00000000),
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    filled: true,
                                                    fillColor:
                                                        FlutterFlowTheme.of(
                                                                context)
                                                            .primaryBackground,
                                                    suffixIcon: Icon(
                                                      Icons.search,
                                                    ),
                                                  ),
                                                  style: FlutterFlowTheme.of(
                                                          context)
                                                      .bodyMedium
                                                      .override(
                                                        font: GoogleFonts
                                                            .readexPro(
                                                          fontWeight:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontWeight,
                                                          fontStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontStyle,
                                                        ),
                                                        letterSpacing: 0.0,
                                                        fontWeight:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontWeight,
                                                        fontStyle:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontStyle,
                                                      ),
                                                  minLines: 1,
                                                  validator: _model
                                                      .textController1Validator
                                                      .asValidator(context),
                                                ),
                                              ].divide(SizedBox(height: 16.0)),
                                            ),
                                          ),
                                        ),
                                      ),
                                      Material(
                                        color: Colors.transparent,
                                        elevation: 2.0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12.0),
                                        ),
                                        child: Container(
                                          width:
                                              MediaQuery.sizeOf(context).width *
                                                  1.0,
                                          height: _model.filtros ? 200.0 : 60.0,
                                          decoration: BoxDecoration(
                                            color: FlutterFlowTheme.of(context)
                                                .secondaryBackground,
                                            borderRadius:
                                                BorderRadius.circular(12.0),
                                          ),
                                          child: Padding(
                                            padding:
                                                EdgeInsetsDirectional.fromSTEB(
                                                    16.0, 16.0, 16.0, 16.0),
                                            child: Column(
                                              mainAxisSize: MainAxisSize.max,
                                              children: [
                                                Row(
                                                  mainAxisSize:
                                                      MainAxisSize.max,
                                                  mainAxisAlignment:
                                                      MainAxisAlignment
                                                          .spaceBetween,
                                                  children: [
                                                    Text(
                                                      FFLocalizations.of(
                                                              context)
                                                          .getText(
                                                        'dv51x06v' /* Filtros */,
                                                      ),
                                                      style: FlutterFlowTheme
                                                              .of(context)
                                                          .bodyLarge
                                                          .override(
                                                            font: GoogleFonts
                                                                .readexPro(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w600,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyLarge
                                                                      .fontStyle,
                                                            ),
                                                            letterSpacing: 0.0,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyLarge
                                                                    .fontStyle,
                                                          ),
                                                    ),
                                                    InkWell(
                                                      splashColor:
                                                          Colors.transparent,
                                                      focusColor:
                                                          Colors.transparent,
                                                      hoverColor:
                                                          Colors.transparent,
                                                      highlightColor:
                                                          Colors.transparent,
                                                      onTap: () async {
                                                        logFirebaseEvent(
                                                            'GERENCIAMENTODEALUNOS_Icon_vq266ttj_ON_T');
                                                        if (_model.filtros) {
                                                          logFirebaseEvent(
                                                              'Icon_update_page_state');
                                                          _model.filtros =
                                                              false;
                                                          safeSetState(() {});
                                                        } else {
                                                          logFirebaseEvent(
                                                              'Icon_update_page_state');
                                                          _model.filtros = true;
                                                          safeSetState(() {});
                                                        }
                                                      },
                                                      child: Icon(
                                                        Icons.filter_list,
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .secondaryText,
                                                        size: 24.0,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                if (_model.filtros)
                                                  StreamBuilder<
                                                      List<
                                                          GrupoDeGerenciamentosRecord>>(
                                                    stream:
                                                        queryGrupoDeGerenciamentosRecord(
                                                      parent:
                                                          currentUserReference,
                                                    ),
                                                    builder:
                                                        (context, snapshot) {
                                                      // Customize what your widget looks like when it's loading.
                                                      if (!snapshot.hasData) {
                                                        return Center(
                                                          child: SizedBox(
                                                            width: 50.0,
                                                            height: 50.0,
                                                            child:
                                                                SpinKitFadingFour(
                                                              color: FlutterFlowTheme
                                                                      .of(context)
                                                                  .customColor3,
                                                              size: 50.0,
                                                            ),
                                                          ),
                                                        );
                                                      }
                                                      List<GrupoDeGerenciamentosRecord>
                                                          wrapGrupoDeGerenciamentosRecordList =
                                                          snapshot.data!;
                                                      if (wrapGrupoDeGerenciamentosRecordList
                                                          .isEmpty) {
                                                        return AindanaoexistegruposWidget();
                                                      }

                                                      return Wrap(
                                                        spacing: 8.0,
                                                        runSpacing: 8.0,
                                                        alignment: WrapAlignment
                                                            .center,
                                                        crossAxisAlignment:
                                                            WrapCrossAlignment
                                                                .start,
                                                        direction:
                                                            Axis.horizontal,
                                                        runAlignment:
                                                            WrapAlignment.start,
                                                        verticalDirection:
                                                            VerticalDirection
                                                                .down,
                                                        clipBehavior: Clip.none,
                                                        children: List.generate(
                                                            wrapGrupoDeGerenciamentosRecordList
                                                                .length,
                                                            (wrapIndex) {
                                                          final wrapGrupoDeGerenciamentosRecord =
                                                              wrapGrupoDeGerenciamentosRecordList[
                                                                  wrapIndex];
                                                          return InkWell(
                                                            splashColor: Colors
                                                                .transparent,
                                                            focusColor: Colors
                                                                .transparent,
                                                            hoverColor: Colors
                                                                .transparent,
                                                            highlightColor:
                                                                Colors
                                                                    .transparent,
                                                            onTap: () async {
                                                              logFirebaseEvent(
                                                                  'GERENCIAMENTODEALUNOS_Container_1jz2o9aw');
                                                              if (valueOrDefault(
                                                                      currentUserDocument
                                                                          ?.tipoDeAssinatura,
                                                                      '') !=
                                                                  wrapGrupoDeGerenciamentosRecord
                                                                      .nomeDoGrupo) {
                                                                logFirebaseEvent(
                                                                    'Container_update_page_state');
                                                                _model.tipoDeAssinatura =
                                                                    wrapGrupoDeGerenciamentosRecord
                                                                        .nomeDoGrupo;
                                                                _model.howStep =
                                                                    'gerenciamento';
                                                                safeSetState(
                                                                    () {});
                                                                logFirebaseEvent(
                                                                    'Container_firestore_query');
                                                                _model.queryUsres =
                                                                    await queryGrupoDeGerenciamentosRecordOnce(
                                                                  parent:
                                                                      currentUserReference,
                                                                  queryBuilder:
                                                                      (grupoDeGerenciamentosRecord) =>
                                                                          grupoDeGerenciamentosRecord
                                                                              .where(
                                                                    'nomeDoGrupo',
                                                                    isEqualTo:
                                                                        wrapGrupoDeGerenciamentosRecord
                                                                            .nomeDoGrupo,
                                                                  ),
                                                                  singleRecord:
                                                                      true,
                                                                ).then((s) => s
                                                                        .firstOrNull);
                                                              } else {
                                                                logFirebaseEvent(
                                                                    'Container_update_page_state');
                                                                _model.tipoDeAssinatura =
                                                                    'Todos';
                                                                _model.howStep =
                                                                    'All';
                                                                safeSetState(
                                                                    () {});
                                                              }

                                                              safeSetState(
                                                                  () {});
                                                            },
                                                            child: Container(
                                                              decoration:
                                                                  BoxDecoration(
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .accent1,
                                                                borderRadius:
                                                                    BorderRadius
                                                                        .circular(
                                                                            20.0),
                                                              ),
                                                              child: Padding(
                                                                padding: EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        8.0,
                                                                        16.0,
                                                                        8.0,
                                                                        16.0),
                                                                child: Text(
                                                                  wrapGrupoDeGerenciamentosRecord
                                                                      .nomeDoGrupo,
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .readexPro(
                                                                          fontWeight: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontWeight,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .primaryText,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontWeight,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                            ),
                                                          );
                                                        }),
                                                      );
                                                    },
                                                  ),
                                              ].divide(SizedBox(height: 16.0)),
                                            ),
                                          ),
                                        ),
                                      ),
                                      if (_model.howStep == 'search')
                                        Builder(
                                          builder: (context) {
                                            final user = _model
                                                .simpleSearchResults1
                                                .toList();
                                            if (user.isEmpty) {
                                              return NaoexistealunoWidget();
                                            }

                                            return ListView.separated(
                                              padding: EdgeInsets.zero,
                                              primary: false,
                                              shrinkWrap: true,
                                              cacheExtent: 800.0,
                                              addAutomaticKeepAlives: false,
                                              scrollDirection: Axis.vertical,
                                              itemCount: user.length,
                                              separatorBuilder: (_, __) =>
                                                  SizedBox(height: 12.0),
                                              itemBuilder:
                                                  (context, userIndex) {
                                                final userItem =
                                                    user[userIndex];
                                                return InkWell(
                                                  splashColor:
                                                      Colors.transparent,
                                                  focusColor:
                                                      Colors.transparent,
                                                  hoverColor:
                                                      Colors.transparent,
                                                  highlightColor:
                                                      Colors.transparent,
                                                  onTap: () async {
                                                    logFirebaseEvent(
                                                        'GERENCIAMENTODEALUNOS_Container_4dt6j7sw');
                                                    logFirebaseEvent(
                                                        'Container_bottom_sheet');
                                                    await showModalBottomSheet(
                                                      isScrollControlled: true,
                                                      backgroundColor:
                                                          Colors.transparent,
                                                      enableDrag: false,
                                                      context: context,
                                                      builder: (context) {
                                                        return GestureDetector(
                                                          onTap: () {
                                                            FocusScope.of(
                                                                    context)
                                                                .unfocus();
                                                            FocusManager
                                                                .instance
                                                                .primaryFocus
                                                                ?.unfocus();
                                                          },
                                                          child: Padding(
                                                            padding: MediaQuery
                                                                .viewInsetsOf(
                                                                    context),
                                                            child:
                                                                CardAcoesWidget(
                                                              cliente: userItem
                                                                  .reference,
                                                            ),
                                                          ),
                                                        );
                                                      },
                                                    ).then((value) =>
                                                        safeSetState(() {}));
                                                  },
                                                  child: Material(
                                                    color: Colors.transparent,
                                                    elevation: 2.0,
                                                    shape:
                                                        RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12.0),
                                                    ),
                                                    child: Container(
                                                      width: MediaQuery.sizeOf(
                                                                  context)
                                                              .width *
                                                          1.0,
                                                      decoration: BoxDecoration(
                                                        color: FlutterFlowTheme
                                                                .of(context)
                                                            .secondaryBackground,
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(12.0),
                                                      ),
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    16.0,
                                                                    16.0,
                                                                    16.0,
                                                                    16.0),
                                                        child: Row(
                                                          mainAxisSize:
                                                              MainAxisSize.max,
                                                          mainAxisAlignment:
                                                              MainAxisAlignment
                                                                  .spaceBetween,
                                                          children: [
                                                            Flexible(
                                                              child: Row(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                children: [
                                                                  Container(
                                                                    width: 50.0,
                                                                    height:
                                                                        50.0,
                                                                    decoration:
                                                                        BoxDecoration(
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .accent1,
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                    ),
                                                                    child:
                                                                        ClipRRect(
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                      child: Image
                                                                          .network(
                                                                        userItem
                                                                            .photoUrl,
                                                                        width:
                                                                            50.0,
                                                                        height:
                                                                            50.0,
                                                                        fit: BoxFit
                                                                            .cover,
                                                                      ),
                                                                    ),
                                                                  ),
                                                                  Column(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .min,
                                                                    mainAxisAlignment:
                                                                        MainAxisAlignment
                                                                            .center,
                                                                    crossAxisAlignment:
                                                                        CrossAxisAlignment
                                                                            .start,
                                                                    children: [
                                                                      if (userItem
                                                                          .codigodospersonaisagendado
                                                                          .contains(
                                                                              gerenciamentodealunosPersonalAccountRecord?.codigoPersonal))
                                                                        GradientText(
                                                                          FFLocalizations.of(context)
                                                                              .getText(
                                                                            'xhik2dac' /* MH Agenda Fit */,
                                                                          ),
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyLarge
                                                                              .override(
                                                                                font: GoogleFonts.readexPro(
                                                                                  fontWeight: FontWeight.w600,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                ),
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                          colors: [
                                                                            FlutterFlowTheme.of(context).primary,
                                                                            Color(0xFF063F83)
                                                                          ],
                                                                          gradientDirection:
                                                                              GradientDirection.ltr,
                                                                          gradientType:
                                                                              GradientType.linear,
                                                                        ),
                                                                      Text(
                                                                        userItem
                                                                            .displayName,
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodyLarge
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FontWeight.w600,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                            ),
                                                                      ),
                                                                      Text(
                                                                        'Aluno desde: ${dateTimeFormat(
                                                                          "MMMEd",
                                                                          userItem
                                                                              .alunoDesde,
                                                                          locale:
                                                                              FFLocalizations.of(context).languageCode,
                                                                        )}',
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodySmall
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                              ),
                                                                              color: FlutterFlowTheme.of(context).secondaryText,
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                            ),
                                                                      ),
                                                                    ],
                                                                  ),
                                                                ].divide(SizedBox(
                                                                    width:
                                                                        12.0)),
                                                              ),
                                                            ),
                                                            InkWell(
                                                              splashColor: Colors
                                                                  .transparent,
                                                              focusColor: Colors
                                                                  .transparent,
                                                              hoverColor: Colors
                                                                  .transparent,
                                                              highlightColor:
                                                                  Colors
                                                                      .transparent,
                                                              onTap: () async {
                                                                logFirebaseEvent(
                                                                    'GERENCIAMENTODEALUNOS_Icon_4b1xyqdn_ON_T');
                                                                logFirebaseEvent(
                                                                    'Icon_navigate_to');
                                                                if (Navigator.of(
                                                                        context)
                                                                    .canPop()) {
                                                                  context.pop();
                                                                }
                                                                context
                                                                    .pushNamed(
                                                                  EditarAlunoWidget
                                                                      .routeName,
                                                                  queryParameters:
                                                                      {
                                                                    'users':
                                                                        serializeParam(
                                                                      userItem
                                                                          .reference,
                                                                      ParamType
                                                                          .DocumentReference,
                                                                    ),
                                                                  }.withoutNulls,
                                                                  extra: <String,
                                                                      dynamic>{
                                                                    kTransitionInfoKey:
                                                                        TransitionInfo(
                                                                      hasTransition:
                                                                          true,
                                                                      transitionType:
                                                                          PageTransitionType
                                                                              .fade,
                                                                      duration: Duration(
                                                                          milliseconds:
                                                                              50),
                                                                    ),
                                                                  },
                                                                );
                                                              },
                                                              child: Icon(
                                                                Icons.more_vert,
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .secondaryText,
                                                                size: 24.0,
                                                              ),
                                                            ),
                                                          ],
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            );
                                          },
                                        ),
                                      if (_model.howStep == 'All')
                                        StreamBuilder<List<UsersRecord>>(
                                          stream: queryUsersRecord(
                                            queryBuilder: (usersRecord) =>
                                                usersRecord.where(
                                              'codigoPersonal',
                                              isEqualTo:
                                                  gerenciamentodealunosPersonalAccountRecord
                                                      ?.codigoPersonal,
                                            ),
                                          ),
                                          builder: (context, snapshot) {
                                            // Customize what your widget looks like when it's loading.
                                            if (!snapshot.hasData) {
                                              return Center(
                                                child: SizedBox(
                                                  width: 50.0,
                                                  height: 50.0,
                                                  child: SpinKitFadingFour(
                                                    color: FlutterFlowTheme.of(
                                                            context)
                                                        .customColor3,
                                                    size: 50.0,
                                                  ),
                                                ),
                                              );
                                            }
                                            List<UsersRecord>
                                                listViewUsersRecordList =
                                                snapshot.data!;
                                            if (listViewUsersRecordList
                                                .isEmpty) {
                                              return NaoexistealunoWidget();
                                            }

                                            return ListView.separated(
                                              padding: EdgeInsets.zero,
                                              primary: false,
                                              shrinkWrap: true,
                                              cacheExtent: 800.0,
                                              addAutomaticKeepAlives: false,
                                              scrollDirection: Axis.vertical,
                                              itemCount: listViewUsersRecordList
                                                  .length,
                                              separatorBuilder: (_, __) =>
                                                  SizedBox(height: 12.0),
                                              itemBuilder:
                                                  (context, listViewIndex) {
                                                final listViewUsersRecord =
                                                    listViewUsersRecordList[
                                                        listViewIndex];
                                                return InkWell(
                                                  splashColor:
                                                      Colors.transparent,
                                                  focusColor:
                                                      Colors.transparent,
                                                  hoverColor:
                                                      Colors.transparent,
                                                  highlightColor:
                                                      Colors.transparent,
                                                  onTap: () async {
                                                    logFirebaseEvent(
                                                        'GERENCIAMENTODEALUNOS_Container_og0tqu2t');
                                                    logFirebaseEvent(
                                                        'Container_bottom_sheet');
                                                    await showModalBottomSheet(
                                                      isScrollControlled: true,
                                                      backgroundColor:
                                                          Colors.transparent,
                                                      enableDrag: false,
                                                      context: context,
                                                      builder: (context) {
                                                        return GestureDetector(
                                                          onTap: () {
                                                            FocusScope.of(
                                                                    context)
                                                                .unfocus();
                                                            FocusManager
                                                                .instance
                                                                .primaryFocus
                                                                ?.unfocus();
                                                          },
                                                          child: Padding(
                                                            padding: MediaQuery
                                                                .viewInsetsOf(
                                                                    context),
                                                            child:
                                                                CardAcoesWidget(
                                                              cliente:
                                                                  listViewUsersRecord
                                                                      .reference,
                                                            ),
                                                          ),
                                                        );
                                                      },
                                                    ).then((value) =>
                                                        safeSetState(() {}));
                                                  },
                                                  child: Material(
                                                    color: Colors.transparent,
                                                    elevation: 2.0,
                                                    shape:
                                                        RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12.0),
                                                    ),
                                                    child: Container(
                                                      width: MediaQuery.sizeOf(
                                                                  context)
                                                              .width *
                                                          1.0,
                                                      decoration: BoxDecoration(
                                                        color: FlutterFlowTheme
                                                                .of(context)
                                                            .secondaryBackground,
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(12.0),
                                                      ),
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    16.0,
                                                                    16.0,
                                                                    16.0,
                                                                    16.0),
                                                        child: Row(
                                                          mainAxisSize:
                                                              MainAxisSize.max,
                                                          mainAxisAlignment:
                                                              MainAxisAlignment
                                                                  .spaceBetween,
                                                          children: [
                                                            Flexible(
                                                              child: Row(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                children: [
                                                                  Container(
                                                                    width: 50.0,
                                                                    height:
                                                                        50.0,
                                                                    decoration:
                                                                        BoxDecoration(
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .accent1,
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                    ),
                                                                    child:
                                                                        ClipRRect(
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                      child: Image
                                                                          .network(
                                                                        listViewUsersRecord
                                                                            .photoUrl,
                                                                        width:
                                                                            50.0,
                                                                        height:
                                                                            50.0,
                                                                        fit: BoxFit
                                                                            .cover,
                                                                      ),
                                                                    ),
                                                                  ),
                                                                  Column(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .min,
                                                                    mainAxisAlignment:
                                                                        MainAxisAlignment
                                                                            .center,
                                                                    crossAxisAlignment:
                                                                        CrossAxisAlignment
                                                                            .start,
                                                                    children: [
                                                                      if (listViewUsersRecord
                                                                          .codigodospersonaisagendado
                                                                          .contains(
                                                                              gerenciamentodealunosPersonalAccountRecord?.codigoPersonal))
                                                                        GradientText(
                                                                          FFLocalizations.of(context)
                                                                              .getText(
                                                                            'hdw0nsuf' /* MH Agenda Fit */,
                                                                          ),
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyLarge
                                                                              .override(
                                                                                font: GoogleFonts.readexPro(
                                                                                  fontWeight: FontWeight.w600,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                ),
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                          colors: [
                                                                            FlutterFlowTheme.of(context).primary,
                                                                            Color(0xFF063F83)
                                                                          ],
                                                                          gradientDirection:
                                                                              GradientDirection.ltr,
                                                                          gradientType:
                                                                              GradientType.linear,
                                                                        ),
                                                                      Text(
                                                                        listViewUsersRecord
                                                                            .displayName,
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodyLarge
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FontWeight.w600,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                            ),
                                                                      ),
                                                                      Text(
                                                                        'Aluno desde: ${dateTimeFormat(
                                                                          "MMMEd",
                                                                          listViewUsersRecord
                                                                              .alunoDesde,
                                                                          locale:
                                                                              FFLocalizations.of(context).languageCode,
                                                                        )}',
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodySmall
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                              ),
                                                                              color: FlutterFlowTheme.of(context).secondaryText,
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                            ),
                                                                      ),
                                                                    ],
                                                                  ),
                                                                ].divide(SizedBox(
                                                                    width:
                                                                        12.0)),
                                                              ),
                                                            ),
                                                            InkWell(
                                                              splashColor: Colors
                                                                  .transparent,
                                                              focusColor: Colors
                                                                  .transparent,
                                                              hoverColor: Colors
                                                                  .transparent,
                                                              highlightColor:
                                                                  Colors
                                                                      .transparent,
                                                              onTap: () async {
                                                                logFirebaseEvent(
                                                                    'GERENCIAMENTODEALUNOS_Icon_vkmuvqzf_ON_T');
                                                                logFirebaseEvent(
                                                                    'Icon_navigate_to');
                                                                if (Navigator.of(
                                                                        context)
                                                                    .canPop()) {
                                                                  context.pop();
                                                                }
                                                                context
                                                                    .pushNamed(
                                                                  EditarAlunoWidget
                                                                      .routeName,
                                                                  queryParameters:
                                                                      {
                                                                    'users':
                                                                        serializeParam(
                                                                      listViewUsersRecord
                                                                          .reference,
                                                                      ParamType
                                                                          .DocumentReference,
                                                                    ),
                                                                  }.withoutNulls,
                                                                  extra: <String,
                                                                      dynamic>{
                                                                    kTransitionInfoKey:
                                                                        TransitionInfo(
                                                                      hasTransition:
                                                                          true,
                                                                      transitionType:
                                                                          PageTransitionType
                                                                              .fade,
                                                                      duration: Duration(
                                                                          milliseconds:
                                                                              50),
                                                                    ),
                                                                  },
                                                                );
                                                              },
                                                              child: Icon(
                                                                Icons.more_vert,
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .secondaryText,
                                                                size: 24.0,
                                                              ),
                                                            ),
                                                          ],
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            );
                                          },
                                        ),
                                      if (_model.howStep == 'gerenciamento')
                                        Builder(
                                          builder: (context) {
                                            final usersgerencimento = _model
                                                    .queryUsres?.users
                                                    ?.toList() ??
                                                [];
                                            if (usersgerencimento.isEmpty) {
                                              return NaoexistealunoWidget();
                                            }

                                            return ListView.separated(
                                              padding: EdgeInsets.zero,
                                              primary: false,
                                              shrinkWrap: true,
                                              cacheExtent: 800.0,
                                              addAutomaticKeepAlives: false,
                                              scrollDirection: Axis.vertical,
                                              itemCount:
                                                  usersgerencimento.length,
                                              separatorBuilder: (_, __) =>
                                                  SizedBox(height: 12.0),
                                              itemBuilder: (context,
                                                  usersgerencimentoIndex) {
                                                final usersgerencimentoItem =
                                                    usersgerencimento[
                                                        usersgerencimentoIndex];
                                                return StreamBuilder<
                                                    UsersRecord>(
                                                  stream: UsersRecord
                                                      .getDocument(
                                                          usersgerencimentoItem),
                                                  builder: (context, snapshot) {
                                                    // Customize what your widget looks like when it's loading.
                                                    if (!snapshot.hasData) {
                                                      return Center(
                                                        child: SizedBox(
                                                          width: 50.0,
                                                          height: 50.0,
                                                          child:
                                                              SpinKitFadingFour(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .customColor3,
                                                            size: 50.0,
                                                          ),
                                                        ),
                                                      );
                                                    }

                                                    final containerUsersRecord =
                                                        snapshot.data!;

                                                    return InkWell(
                                                      splashColor:
                                                          Colors.transparent,
                                                      focusColor:
                                                          Colors.transparent,
                                                      hoverColor:
                                                          Colors.transparent,
                                                      highlightColor:
                                                          Colors.transparent,
                                                      onTap: () async {
                                                        logFirebaseEvent(
                                                            'GERENCIAMENTODEALUNOS_Container_k0foqkf6');
                                                        logFirebaseEvent(
                                                            'Container_bottom_sheet');
                                                        await showModalBottomSheet(
                                                          isScrollControlled:
                                                              true,
                                                          backgroundColor:
                                                              Colors
                                                                  .transparent,
                                                          enableDrag: false,
                                                          context: context,
                                                          builder: (context) {
                                                            return GestureDetector(
                                                              onTap: () {
                                                                FocusScope.of(
                                                                        context)
                                                                    .unfocus();
                                                                FocusManager
                                                                    .instance
                                                                    .primaryFocus
                                                                    ?.unfocus();
                                                              },
                                                              child: Padding(
                                                                padding: MediaQuery
                                                                    .viewInsetsOf(
                                                                        context),
                                                                child:
                                                                    CardAcoesWidget(
                                                                  cliente:
                                                                      containerUsersRecord
                                                                          .reference,
                                                                ),
                                                              ),
                                                            );
                                                          },
                                                        ).then((value) =>
                                                            safeSetState(
                                                                () {}));
                                                      },
                                                      child: Material(
                                                        color:
                                                            Colors.transparent,
                                                        elevation: 2.0,
                                                        shape:
                                                            RoundedRectangleBorder(
                                                          borderRadius:
                                                              BorderRadius
                                                                  .circular(
                                                                      12.0),
                                                        ),
                                                        child: Container(
                                                          width:
                                                              MediaQuery.sizeOf(
                                                                          context)
                                                                      .width *
                                                                  1.0,
                                                          decoration:
                                                              BoxDecoration(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .secondaryBackground,
                                                            borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                                        12.0),
                                                          ),
                                                          child: Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        16.0,
                                                                        16.0,
                                                                        16.0,
                                                                        16.0),
                                                            child: Row(
                                                              mainAxisSize:
                                                                  MainAxisSize
                                                                      .max,
                                                              mainAxisAlignment:
                                                                  MainAxisAlignment
                                                                      .spaceBetween,
                                                              children: [
                                                                Flexible(
                                                                  child: Row(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .max,
                                                                    children: [
                                                                      Container(
                                                                        width:
                                                                            50.0,
                                                                        height:
                                                                            50.0,
                                                                        decoration:
                                                                            BoxDecoration(
                                                                          color:
                                                                              FlutterFlowTheme.of(context).accent1,
                                                                          borderRadius:
                                                                              BorderRadius.circular(25.0),
                                                                        ),
                                                                        child:
                                                                            ClipRRect(
                                                                          borderRadius:
                                                                              BorderRadius.circular(25.0),
                                                                          child:
                                                                              CachedNetworkImage(
                                                                            imageUrl:
                                                                                containerUsersRecord.photoUrl,
                                                                            width:
                                                                                50.0,
                                                                            height:
                                                                                50.0,
                                                                            fit:
                                                                                BoxFit.cover,
                                                                            memCacheWidth:
                                                                                100,
                                                                            memCacheHeight:
                                                                                100,
                                                                            placeholder: (context, url) =>
                                                                                Container(
                                                                              color: FlutterFlowTheme.of(context).accent1,
                                                                            ),
                                                                            errorWidget: (context, url, error) =>
                                                                                const Icon(
                                                                              Icons.person,
                                                                              size: 28.0,
                                                                            ),
                                                                          ),
                                                                        ),
                                                                      ),
                                                                      Flexible(
                                                                        child:
                                                                            Column(
                                                                          mainAxisSize:
                                                                              MainAxisSize.min,
                                                                          mainAxisAlignment:
                                                                              MainAxisAlignment.center,
                                                                          crossAxisAlignment:
                                                                              CrossAxisAlignment.start,
                                                                          children: [
                                                                            if (containerUsersRecord.codigodospersonaisagendado.contains(gerenciamentodealunosPersonalAccountRecord?.codigoPersonal))
                                                                              GradientText(
                                                                                FFLocalizations.of(context).getText(
                                                                                  'vdatelqh' /* MH Agenda Fit */,
                                                                                ),
                                                                                style: FlutterFlowTheme.of(context).bodyLarge.override(
                                                                                      font: GoogleFonts.readexPro(
                                                                                        fontWeight: FontWeight.w600,
                                                                                        fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                      ),
                                                                                      letterSpacing: 0.0,
                                                                                      fontWeight: FontWeight.w600,
                                                                                      fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                    ),
                                                                                colors: [
                                                                                  FlutterFlowTheme.of(context).primary,
                                                                                  Color(0xFF063F83)
                                                                                ],
                                                                                gradientDirection: GradientDirection.ltr,
                                                                                gradientType: GradientType.linear,
                                                                              ),
                                                                            Text(
                                                                              containerUsersRecord.displayName,
                                                                              style: FlutterFlowTheme.of(context).bodyLarge.override(
                                                                                    font: GoogleFonts.readexPro(
                                                                                      fontWeight: FontWeight.w600,
                                                                                      fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                    ),
                                                                                    letterSpacing: 0.0,
                                                                                    fontWeight: FontWeight.w600,
                                                                                    fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                  ),
                                                                            ),
                                                                            Text(
                                                                              'Aluno desde: ${dateTimeFormat(
                                                                                "d/M/y",
                                                                                containerUsersRecord.alunoDesde,
                                                                                locale: FFLocalizations.of(context).languageCode,
                                                                              )}',
                                                                              style: FlutterFlowTheme.of(context).bodySmall.override(
                                                                                    font: GoogleFonts.readexPro(
                                                                                      fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                      fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                                    ),
                                                                                    color: FlutterFlowTheme.of(context).secondaryText,
                                                                                    letterSpacing: 0.0,
                                                                                    fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                    fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                                  ),
                                                                            ),
                                                                          ],
                                                                        ),
                                                                      ),
                                                                    ].divide(SizedBox(
                                                                        width:
                                                                            12.0)),
                                                                  ),
                                                                ),
                                                                InkWell(
                                                                  splashColor:
                                                                      Colors
                                                                          .transparent,
                                                                  focusColor: Colors
                                                                      .transparent,
                                                                  hoverColor: Colors
                                                                      .transparent,
                                                                  highlightColor:
                                                                      Colors
                                                                          .transparent,
                                                                  onTap:
                                                                      () async {
                                                                    logFirebaseEvent(
                                                                        'GERENCIAMENTODEALUNOS_Icon_sx0gtsqs_ON_T');
                                                                    logFirebaseEvent(
                                                                        'Icon_navigate_to');
                                                                    if (Navigator.of(
                                                                            context)
                                                                        .canPop()) {
                                                                      context
                                                                          .pop();
                                                                    }
                                                                    context
                                                                        .pushNamed(
                                                                      EditarAlunoWidget
                                                                          .routeName,
                                                                      queryParameters:
                                                                          {
                                                                        'users':
                                                                            serializeParam(
                                                                          containerUsersRecord
                                                                              .reference,
                                                                          ParamType
                                                                              .DocumentReference,
                                                                        ),
                                                                      }.withoutNulls,
                                                                      extra: <String,
                                                                          dynamic>{
                                                                        kTransitionInfoKey:
                                                                            TransitionInfo(
                                                                          hasTransition:
                                                                              true,
                                                                          transitionType:
                                                                              PageTransitionType.fade,
                                                                          duration:
                                                                              Duration(milliseconds: 50),
                                                                        ),
                                                                      },
                                                                    );
                                                                  },
                                                                  child: Icon(
                                                                    Icons
                                                                        .more_vert,
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .secondaryText,
                                                                    size: 24.0,
                                                                  ),
                                                                ),
                                                              ],
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    );
                                                  },
                                                );
                                              },
                                            );
                                          },
                                        ),
                                    ].divide(SizedBox(height: 16.0)),
                                  ),
                                ),
                              ),
                            if (responsiveVisibility(
                              context: context,
                              phone: false,
                              tablet: false,
                              tabletLandscape: false,
                            ))
                              Padding(
                                padding: EdgeInsetsDirectional.fromSTEB(
                                    300.0, 70.0, 300.0, 0.0),
                                child: SingleChildScrollView(
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Row(
                                        mainAxisSize: MainAxisSize.max,
                                        children: [
                                          InkWell(
                                            splashColor: Colors.transparent,
                                            focusColor: Colors.transparent,
                                            hoverColor: Colors.transparent,
                                            highlightColor: Colors.transparent,
                                            onTap: () async {
                                              logFirebaseEvent(
                                                  'GERENCIAMENTODEALUNOS_Row_tdl2ivkg_ON_TA');
                                              logFirebaseEvent(
                                                  'Row_navigate_back');
                                              context.safePop();
                                            },
                                            child: Row(
                                              mainAxisSize: MainAxisSize.max,
                                              children: [
                                                Padding(
                                                  padding: EdgeInsetsDirectional
                                                      .fromSTEB(
                                                          0.0, 0.0, 4.0, 0.0),
                                                  child: Icon(
                                                    Icons.chevron_left,
                                                    color: FlutterFlowTheme.of(
                                                            context)
                                                        .primaryText,
                                                    size: 20.0,
                                                  ),
                                                ),
                                                Text(
                                                  FFLocalizations.of(context)
                                                      .getText(
                                                    'fkfxqmtz' /* Voltar */,
                                                  ),
                                                  style: FlutterFlowTheme.of(
                                                          context)
                                                      .bodyMedium
                                                      .override(
                                                        font: GoogleFonts
                                                            .readexPro(
                                                          fontWeight:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontWeight,
                                                          fontStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontStyle,
                                                        ),
                                                        letterSpacing: 0.0,
                                                        fontWeight:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontWeight,
                                                        fontStyle:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontStyle,
                                                      ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                      Align(
                                        alignment:
                                            AlignmentDirectional(-1.0, -1.0),
                                        child: Text(
                                          FFLocalizations.of(context).getText(
                                            'prdbw4ve' /* Gerenciamento de Alunos */,
                                          ),
                                          style: FlutterFlowTheme.of(context)
                                              .bodyMedium
                                              .override(
                                                font: GoogleFonts.readexPro(
                                                  fontWeight:
                                                      FlutterFlowTheme.of(
                                                              context)
                                                          .bodyMedium
                                                          .fontWeight,
                                                  fontStyle: FontStyle.italic,
                                                ),
                                                fontSize: 24.0,
                                                letterSpacing: 0.0,
                                                fontWeight:
                                                    FlutterFlowTheme.of(context)
                                                        .bodyMedium
                                                        .fontWeight,
                                                fontStyle: FontStyle.italic,
                                              ),
                                        ),
                                      ),
                                      _buildResumoAcademiaCard(
                                        gerenciamentodealunosPersonalAccountRecord,
                                      ),
                                      Material(
                                        color: Colors.transparent,
                                        elevation: 2.0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12.0),
                                        ),
                                        child: Container(
                                          width:
                                              MediaQuery.sizeOf(context).width *
                                                  1.0,
                                          decoration: BoxDecoration(
                                            color: FlutterFlowTheme.of(context)
                                                .secondaryBackground,
                                            borderRadius:
                                                BorderRadius.circular(12.0),
                                          ),
                                          child: Padding(
                                            padding:
                                                EdgeInsetsDirectional.fromSTEB(
                                                    16.0, 16.0, 16.0, 16.0),
                                            child: Column(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                Row(
                                                  mainAxisSize:
                                                      MainAxisSize.max,
                                                  mainAxisAlignment:
                                                      MainAxisAlignment
                                                          .spaceBetween,
                                                  children: [
                                                    Text(
                                                      FFLocalizations.of(
                                                              context)
                                                          .getText(
                                                        '58fj6rt9' /* Buscar aluno */,
                                                      ),
                                                      style: FlutterFlowTheme
                                                              .of(context)
                                                          .bodyLarge
                                                          .override(
                                                            font: GoogleFonts
                                                                .readexPro(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w600,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyLarge
                                                                      .fontStyle,
                                                            ),
                                                            letterSpacing: 0.0,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyLarge
                                                                    .fontStyle,
                                                          ),
                                                    ),
                                                    InkWell(
                                                      splashColor:
                                                          Colors.transparent,
                                                      focusColor:
                                                          Colors.transparent,
                                                      hoverColor:
                                                          Colors.transparent,
                                                      highlightColor:
                                                          Colors.transparent,
                                                      onTap: () async {
                                                        logFirebaseEvent(
                                                            'GERENCIAMENTODEALUNOS_Row_jzzq0wsl_ON_TA');
                                                        logFirebaseEvent(
                                                            'Row_bottom_sheet');
                                                        await _openAcoesAlunoSheet(
                                                          gerenciamentodealunosPersonalAccountRecord,
                                                        );
                                                      },
                                                      child: Row(
                                                        mainAxisSize:
                                                            MainAxisSize.max,
                                                        children: [
                                                          GradientText(
                                                            'Ações',
                                                            style: FlutterFlowTheme
                                                                    .of(context)
                                                                .bodyMedium
                                                                .override(
                                                                  font: GoogleFonts
                                                                      .readexPro(
                                                                    fontWeight: FlutterFlowTheme.of(
                                                                            context)
                                                                        .bodyMedium
                                                                        .fontWeight,
                                                                    fontStyle:
                                                                        FontStyle
                                                                            .italic,
                                                                  ),
                                                                  letterSpacing:
                                                                      0.0,
                                                                  fontWeight: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontWeight,
                                                                  fontStyle:
                                                                      FontStyle
                                                                          .italic,
                                                                ),
                                                            colors: [
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .primaryText,
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .primary
                                                            ],
                                                            gradientDirection:
                                                                GradientDirection
                                                                    .ltr,
                                                            gradientType:
                                                                GradientType
                                                                    .linear,
                                                          ),
                                                          Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        4.0,
                                                                        0.0,
                                                                        0.0,
                                                                        0.0),
                                                            child: Icon(
                                                              Icons
                                                                  .more_horiz_rounded,
                                                              color: FlutterFlowTheme
                                                                      .of(context)
                                                                  .primary,
                                                              size: 16.0,
                                                            ).animateOnPageLoad(
                                                                animationsMap[
                                                                    'iconOnPageLoadAnimation2']!),
                                                          ),
                                                        ],
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                TextFormField(
                                                  controller:
                                                      _model.textController2,
                                                  focusNode: _model
                                                      .textFieldFocusNode2,
                                                  onChanged: (_) =>
                                                      EasyDebounce.debounce(
                                                    '_model.textController2',
                                                    Duration(
                                                        milliseconds: 2000),
                                                    () async {
                                                      logFirebaseEvent(
                                                          'GERENCIAMENTODEALUNOS_TextField_v9vkfhtm');
                                                      if ((_model.textFieldFocusNode2
                                                                  ?.hasFocus ??
                                                              false) !=
                                                          null) {
                                                        logFirebaseEvent(
                                                            'TextField_firestore_query');
                                                        _model.queryUserses =
                                                            await queryUsersRecordOnce(
                                                          queryBuilder:
                                                              (usersRecord) =>
                                                                  usersRecord
                                                                      .where(
                                                            'codigoPersonal',
                                                            isEqualTo:
                                                                gerenciamentodealunosPersonalAccountRecord
                                                                    ?.codigoPersonal,
                                                          ),
                                                        );
                                                        logFirebaseEvent(
                                                            'TextField_simple_search');
                                                        safeSetState(() {
                                                          _model.simpleSearchResults2 =
                                                              TextSearch(
                                                            _model.queryUserses!
                                                                .map(
                                                                  (record) => TextSearchItem
                                                                      .fromTerms(
                                                                          record,
                                                                          [
                                                                        record
                                                                            .displayName!
                                                                      ]),
                                                                )
                                                                .toList(),
                                                          )
                                                                  .search(_model
                                                                      .textController2
                                                                      .text)
                                                                  .map((r) =>
                                                                      r.object)
                                                                  .toList();
                                                          ;
                                                        });
                                                        logFirebaseEvent(
                                                            'TextField_update_page_state');
                                                        _model.howStep =
                                                            'search';
                                                        safeSetState(() {});
                                                      } else {
                                                        logFirebaseEvent(
                                                            'TextField_update_page_state');
                                                        _model.howStep = 'All';
                                                        safeSetState(() {});
                                                      }

                                                      safeSetState(() {});
                                                    },
                                                  ),
                                                  autofocus: false,
                                                  obscureText: false,
                                                  decoration: InputDecoration(
                                                    hintText:
                                                        FFLocalizations.of(
                                                                context)
                                                            .getText(
                                                      '9lfsn6k1' /* Digite o nome ou matrÃ­cula... */,
                                                    ),
                                                    hintStyle:
                                                        FlutterFlowTheme.of(
                                                                context)
                                                            .bodyMedium
                                                            .override(
                                                              font: GoogleFonts
                                                                  .readexPro(
                                                                fontWeight: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontWeight,
                                                                fontStyle: FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyMedium
                                                                    .fontStyle,
                                                              ),
                                                              letterSpacing:
                                                                  0.0,
                                                              fontWeight:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontWeight,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .fontStyle,
                                                            ),
                                                    enabledBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .alternate,
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    focusedBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            Color(0x00000000),
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    errorBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            Color(0x00000000),
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    focusedErrorBorder:
                                                        OutlineInputBorder(
                                                      borderSide: BorderSide(
                                                        color:
                                                            Color(0x00000000),
                                                        width: 1.0,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              8.0),
                                                    ),
                                                    filled: true,
                                                    fillColor:
                                                        FlutterFlowTheme.of(
                                                                context)
                                                            .primaryBackground,
                                                    suffixIcon: Icon(
                                                      Icons.search,
                                                    ),
                                                  ),
                                                  style: FlutterFlowTheme.of(
                                                          context)
                                                      .bodyMedium
                                                      .override(
                                                        font: GoogleFonts
                                                            .readexPro(
                                                          fontWeight:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontWeight,
                                                          fontStyle:
                                                              FlutterFlowTheme.of(
                                                                      context)
                                                                  .bodyMedium
                                                                  .fontStyle,
                                                        ),
                                                        letterSpacing: 0.0,
                                                        fontWeight:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontWeight,
                                                        fontStyle:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .bodyMedium
                                                                .fontStyle,
                                                      ),
                                                  minLines: 1,
                                                  validator: _model
                                                      .textController2Validator
                                                      .asValidator(context),
                                                ),
                                              ].divide(SizedBox(height: 16.0)),
                                            ),
                                          ),
                                        ),
                                      ),
                                      Material(
                                        color: Colors.transparent,
                                        elevation: 2.0,
                                        shape: RoundedRectangleBorder(
                                          borderRadius:
                                              BorderRadius.circular(12.0),
                                        ),
                                        child: Container(
                                          width:
                                              MediaQuery.sizeOf(context).width *
                                                  1.0,
                                          height: _model.filtros ? 200.0 : 60.0,
                                          decoration: BoxDecoration(
                                            color: FlutterFlowTheme.of(context)
                                                .secondaryBackground,
                                            borderRadius:
                                                BorderRadius.circular(12.0),
                                          ),
                                          child: Padding(
                                            padding:
                                                EdgeInsetsDirectional.fromSTEB(
                                                    16.0, 16.0, 16.0, 16.0),
                                            child: Column(
                                              mainAxisSize: MainAxisSize.max,
                                              children: [
                                                Row(
                                                  mainAxisSize:
                                                      MainAxisSize.max,
                                                  mainAxisAlignment:
                                                      MainAxisAlignment
                                                          .spaceBetween,
                                                  children: [
                                                    Text(
                                                      FFLocalizations.of(
                                                              context)
                                                          .getText(
                                                        '6fyhyddu' /* Filtros */,
                                                      ),
                                                      style: FlutterFlowTheme
                                                              .of(context)
                                                          .bodyLarge
                                                          .override(
                                                            font: GoogleFonts
                                                                .readexPro(
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w600,
                                                              fontStyle:
                                                                  FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyLarge
                                                                      .fontStyle,
                                                            ),
                                                            letterSpacing: 0.0,
                                                            fontWeight:
                                                                FontWeight.w600,
                                                            fontStyle:
                                                                FlutterFlowTheme.of(
                                                                        context)
                                                                    .bodyLarge
                                                                    .fontStyle,
                                                          ),
                                                    ),
                                                    InkWell(
                                                      splashColor:
                                                          Colors.transparent,
                                                      focusColor:
                                                          Colors.transparent,
                                                      hoverColor:
                                                          Colors.transparent,
                                                      highlightColor:
                                                          Colors.transparent,
                                                      onTap: () async {
                                                        logFirebaseEvent(
                                                            'GERENCIAMENTODEALUNOS_Icon_8gabbhfj_ON_T');
                                                        if (_model.filtros) {
                                                          logFirebaseEvent(
                                                              'Icon_update_page_state');
                                                          _model.filtros =
                                                              false;
                                                          safeSetState(() {});
                                                        } else {
                                                          logFirebaseEvent(
                                                              'Icon_update_page_state');
                                                          _model.filtros = true;
                                                          safeSetState(() {});
                                                        }
                                                      },
                                                      child: Icon(
                                                        Icons.filter_list,
                                                        color:
                                                            FlutterFlowTheme.of(
                                                                    context)
                                                                .secondaryText,
                                                        size: 24.0,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                if (_model.filtros)
                                                  StreamBuilder<
                                                      List<
                                                          GrupoDeGerenciamentosRecord>>(
                                                    stream:
                                                        queryGrupoDeGerenciamentosRecord(
                                                      parent:
                                                          currentUserReference,
                                                    ),
                                                    builder:
                                                        (context, snapshot) {
                                                      // Customize what your widget looks like when it's loading.
                                                      if (!snapshot.hasData) {
                                                        return Center(
                                                          child: SizedBox(
                                                            width: 50.0,
                                                            height: 50.0,
                                                            child:
                                                                SpinKitFadingFour(
                                                              color: FlutterFlowTheme
                                                                      .of(context)
                                                                  .customColor3,
                                                              size: 50.0,
                                                            ),
                                                          ),
                                                        );
                                                      }
                                                      List<GrupoDeGerenciamentosRecord>
                                                          wrapGrupoDeGerenciamentosRecordList =
                                                          snapshot.data!;
                                                      if (wrapGrupoDeGerenciamentosRecordList
                                                          .isEmpty) {
                                                        return AindanaoexistegruposWidget();
                                                      }

                                                      return Wrap(
                                                        spacing: 8.0,
                                                        runSpacing: 8.0,
                                                        alignment: WrapAlignment
                                                            .center,
                                                        crossAxisAlignment:
                                                            WrapCrossAlignment
                                                                .start,
                                                        direction:
                                                            Axis.horizontal,
                                                        runAlignment:
                                                            WrapAlignment.start,
                                                        verticalDirection:
                                                            VerticalDirection
                                                                .down,
                                                        clipBehavior: Clip.none,
                                                        children: List.generate(
                                                            wrapGrupoDeGerenciamentosRecordList
                                                                .length,
                                                            (wrapIndex) {
                                                          final wrapGrupoDeGerenciamentosRecord =
                                                              wrapGrupoDeGerenciamentosRecordList[
                                                                  wrapIndex];
                                                          return InkWell(
                                                            splashColor: Colors
                                                                .transparent,
                                                            focusColor: Colors
                                                                .transparent,
                                                            hoverColor: Colors
                                                                .transparent,
                                                            highlightColor:
                                                                Colors
                                                                    .transparent,
                                                            onTap: () async {
                                                              logFirebaseEvent(
                                                                  'GERENCIAMENTODEALUNOS_Container_xnwztawd');
                                                              if (valueOrDefault(
                                                                      currentUserDocument
                                                                          ?.tipoDeAssinatura,
                                                                      '') !=
                                                                  wrapGrupoDeGerenciamentosRecord
                                                                      .nomeDoGrupo) {
                                                                logFirebaseEvent(
                                                                    'Container_update_page_state');
                                                                _model.tipoDeAssinatura =
                                                                    wrapGrupoDeGerenciamentosRecord
                                                                        .nomeDoGrupo;
                                                                _model.howStep =
                                                                    'gerenciamento';
                                                                safeSetState(
                                                                    () {});
                                                                logFirebaseEvent(
                                                                    'Container_firestore_query');
                                                                _model.queryUsrese =
                                                                    await queryGrupoDeGerenciamentosRecordOnce(
                                                                  parent:
                                                                      currentUserReference,
                                                                  queryBuilder:
                                                                      (grupoDeGerenciamentosRecord) =>
                                                                          grupoDeGerenciamentosRecord
                                                                              .where(
                                                                    'nomeDoGrupo',
                                                                    isEqualTo:
                                                                        wrapGrupoDeGerenciamentosRecord
                                                                            .nomeDoGrupo,
                                                                  ),
                                                                  singleRecord:
                                                                      true,
                                                                ).then((s) => s
                                                                        .firstOrNull);
                                                              } else {
                                                                logFirebaseEvent(
                                                                    'Container_update_page_state');
                                                                _model.tipoDeAssinatura =
                                                                    'Todos';
                                                                _model.howStep =
                                                                    'All';
                                                                safeSetState(
                                                                    () {});
                                                              }

                                                              safeSetState(
                                                                  () {});
                                                            },
                                                            child: Container(
                                                              decoration:
                                                                  BoxDecoration(
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .accent1,
                                                                borderRadius:
                                                                    BorderRadius
                                                                        .circular(
                                                                            20.0),
                                                              ),
                                                              child: Padding(
                                                                padding: EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        8.0,
                                                                        16.0,
                                                                        8.0,
                                                                        16.0),
                                                                child: Text(
                                                                  wrapGrupoDeGerenciamentosRecord
                                                                      .nomeDoGrupo,
                                                                  style: FlutterFlowTheme.of(
                                                                          context)
                                                                      .bodyMedium
                                                                      .override(
                                                                        font: GoogleFonts
                                                                            .readexPro(
                                                                          fontWeight: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontWeight,
                                                                          fontStyle: FlutterFlowTheme.of(context)
                                                                              .bodyMedium
                                                                              .fontStyle,
                                                                        ),
                                                                        color: FlutterFlowTheme.of(context)
                                                                            .primaryText,
                                                                        letterSpacing:
                                                                            0.0,
                                                                        fontWeight: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontWeight,
                                                                        fontStyle: FlutterFlowTheme.of(context)
                                                                            .bodyMedium
                                                                            .fontStyle,
                                                                      ),
                                                                ),
                                                              ),
                                                            ),
                                                          );
                                                        }),
                                                      );
                                                    },
                                                  ),
                                              ].divide(SizedBox(height: 16.0)),
                                            ),
                                          ),
                                        ),
                                      ),
                                      if (_model.howStep == 'search')
                                        Builder(
                                          builder: (context) {
                                            final user = _model
                                                .simpleSearchResults2
                                                .toList();
                                            if (user.isEmpty) {
                                              return NaoexistealunoWidget();
                                            }

                                            return ListView.separated(
                                              padding: EdgeInsets.zero,
                                              primary: false,
                                              shrinkWrap: true,
                                              cacheExtent: 800.0,
                                              addAutomaticKeepAlives: false,
                                              scrollDirection: Axis.vertical,
                                              itemCount: user.length,
                                              separatorBuilder: (_, __) =>
                                                  SizedBox(height: 12.0),
                                              itemBuilder:
                                                  (context, userIndex) {
                                                final userItem =
                                                    user[userIndex];
                                                return InkWell(
                                                  splashColor:
                                                      Colors.transparent,
                                                  focusColor:
                                                      Colors.transparent,
                                                  hoverColor:
                                                      Colors.transparent,
                                                  highlightColor:
                                                      Colors.transparent,
                                                  onTap: () async {
                                                    logFirebaseEvent(
                                                        'GERENCIAMENTODEALUNOS_Container_nlwq8vas');
                                                    logFirebaseEvent(
                                                        'Container_bottom_sheet');
                                                    await showModalBottomSheet(
                                                      isScrollControlled: true,
                                                      backgroundColor:
                                                          Colors.transparent,
                                                      enableDrag: false,
                                                      context: context,
                                                      builder: (context) {
                                                        return GestureDetector(
                                                          onTap: () {
                                                            FocusScope.of(
                                                                    context)
                                                                .unfocus();
                                                            FocusManager
                                                                .instance
                                                                .primaryFocus
                                                                ?.unfocus();
                                                          },
                                                          child: Padding(
                                                            padding: MediaQuery
                                                                .viewInsetsOf(
                                                                    context),
                                                            child:
                                                                CardAcoesWidget(
                                                              cliente: userItem
                                                                  .reference,
                                                            ),
                                                          ),
                                                        );
                                                      },
                                                    ).then((value) =>
                                                        safeSetState(() {}));
                                                  },
                                                  child: Material(
                                                    color: Colors.transparent,
                                                    elevation: 2.0,
                                                    shape:
                                                        RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12.0),
                                                    ),
                                                    child: Container(
                                                      width: MediaQuery.sizeOf(
                                                                  context)
                                                              .width *
                                                          1.0,
                                                      decoration: BoxDecoration(
                                                        color: FlutterFlowTheme
                                                                .of(context)
                                                            .secondaryBackground,
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(12.0),
                                                      ),
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    16.0,
                                                                    16.0,
                                                                    16.0,
                                                                    16.0),
                                                        child: Row(
                                                          mainAxisSize:
                                                              MainAxisSize.max,
                                                          mainAxisAlignment:
                                                              MainAxisAlignment
                                                                  .spaceBetween,
                                                          children: [
                                                            Flexible(
                                                              child: Row(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                children: [
                                                                  Container(
                                                                    width: 50.0,
                                                                    height:
                                                                        50.0,
                                                                    decoration:
                                                                        BoxDecoration(
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .accent1,
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                    ),
                                                                    child:
                                                                        ClipRRect(
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                      child: Image
                                                                          .network(
                                                                        userItem
                                                                            .photoUrl,
                                                                        width:
                                                                            50.0,
                                                                        height:
                                                                            50.0,
                                                                        fit: BoxFit
                                                                            .cover,
                                                                      ),
                                                                    ),
                                                                  ),
                                                                  Column(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .min,
                                                                    mainAxisAlignment:
                                                                        MainAxisAlignment
                                                                            .center,
                                                                    crossAxisAlignment:
                                                                        CrossAxisAlignment
                                                                            .start,
                                                                    children: [
                                                                      if (userItem
                                                                          .codigodospersonaisagendado
                                                                          .contains(
                                                                              gerenciamentodealunosPersonalAccountRecord?.codigoPersonal))
                                                                        GradientText(
                                                                          FFLocalizations.of(context)
                                                                              .getText(
                                                                            'kkv6kxcp' /* MH Agenda Fit */,
                                                                          ),
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyLarge
                                                                              .override(
                                                                                font: GoogleFonts.readexPro(
                                                                                  fontWeight: FontWeight.w600,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                ),
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                          colors: [
                                                                            FlutterFlowTheme.of(context).primary,
                                                                            Color(0xFF063F83)
                                                                          ],
                                                                          gradientDirection:
                                                                              GradientDirection.ltr,
                                                                          gradientType:
                                                                              GradientType.linear,
                                                                        ),
                                                                      Text(
                                                                        userItem
                                                                            .displayName,
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodyLarge
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FontWeight.w600,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                            ),
                                                                      ),
                                                                      Text(
                                                                        'Aluno desde: ${dateTimeFormat(
                                                                          "MMMEd",
                                                                          userItem
                                                                              .alunoDesde,
                                                                          locale:
                                                                              FFLocalizations.of(context).languageCode,
                                                                        )}',
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodySmall
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                              ),
                                                                              color: FlutterFlowTheme.of(context).secondaryText,
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                            ),
                                                                      ),
                                                                    ],
                                                                  ),
                                                                ].divide(SizedBox(
                                                                    width:
                                                                        12.0)),
                                                              ),
                                                            ),
                                                            InkWell(
                                                              splashColor: Colors
                                                                  .transparent,
                                                              focusColor: Colors
                                                                  .transparent,
                                                              hoverColor: Colors
                                                                  .transparent,
                                                              highlightColor:
                                                                  Colors
                                                                      .transparent,
                                                              onTap: () async {
                                                                logFirebaseEvent(
                                                                    'GERENCIAMENTODEALUNOS_Icon_2pz648ee_ON_T');
                                                                logFirebaseEvent(
                                                                    'Icon_navigate_to');
                                                                if (Navigator.of(
                                                                        context)
                                                                    .canPop()) {
                                                                  context.pop();
                                                                }
                                                                context
                                                                    .pushNamed(
                                                                  EditarAlunoWidget
                                                                      .routeName,
                                                                  queryParameters:
                                                                      {
                                                                    'users':
                                                                        serializeParam(
                                                                      userItem
                                                                          .reference,
                                                                      ParamType
                                                                          .DocumentReference,
                                                                    ),
                                                                  }.withoutNulls,
                                                                  extra: <String,
                                                                      dynamic>{
                                                                    kTransitionInfoKey:
                                                                        TransitionInfo(
                                                                      hasTransition:
                                                                          true,
                                                                      transitionType:
                                                                          PageTransitionType
                                                                              .fade,
                                                                      duration: Duration(
                                                                          milliseconds:
                                                                              50),
                                                                    ),
                                                                  },
                                                                );
                                                              },
                                                              child: Icon(
                                                                Icons.more_vert,
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .secondaryText,
                                                                size: 24.0,
                                                              ),
                                                            ),
                                                          ],
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            );
                                          },
                                        ),
                                      if (_model.howStep == 'All')
                                        StreamBuilder<List<UsersRecord>>(
                                          stream: queryUsersRecord(
                                            queryBuilder: (usersRecord) =>
                                                usersRecord.where(
                                              'codigoPersonal',
                                              isEqualTo:
                                                  gerenciamentodealunosPersonalAccountRecord
                                                      ?.codigoPersonal,
                                            ),
                                          ),
                                          builder: (context, snapshot) {
                                            // Customize what your widget looks like when it's loading.
                                            if (!snapshot.hasData) {
                                              return Center(
                                                child: SizedBox(
                                                  width: 50.0,
                                                  height: 50.0,
                                                  child: SpinKitFadingFour(
                                                    color: FlutterFlowTheme.of(
                                                            context)
                                                        .customColor3,
                                                    size: 50.0,
                                                  ),
                                                ),
                                              );
                                            }
                                            List<UsersRecord>
                                                listViewUsersRecordList =
                                                snapshot.data!;
                                            if (listViewUsersRecordList
                                                .isEmpty) {
                                              return NaoexistealunoWidget();
                                            }

                                            return ListView.separated(
                                              padding: EdgeInsets.zero,
                                              primary: false,
                                              shrinkWrap: true,
                                              cacheExtent: 800.0,
                                              addAutomaticKeepAlives: false,
                                              scrollDirection: Axis.vertical,
                                              itemCount: listViewUsersRecordList
                                                  .length,
                                              separatorBuilder: (_, __) =>
                                                  SizedBox(height: 12.0),
                                              itemBuilder:
                                                  (context, listViewIndex) {
                                                final listViewUsersRecord =
                                                    listViewUsersRecordList[
                                                        listViewIndex];
                                                return InkWell(
                                                  splashColor:
                                                      Colors.transparent,
                                                  focusColor:
                                                      Colors.transparent,
                                                  hoverColor:
                                                      Colors.transparent,
                                                  highlightColor:
                                                      Colors.transparent,
                                                  onTap: () async {
                                                    logFirebaseEvent(
                                                        'GERENCIAMENTODEALUNOS_Container_ga31v627');
                                                    logFirebaseEvent(
                                                        'Container_bottom_sheet');
                                                    await showModalBottomSheet(
                                                      isScrollControlled: true,
                                                      backgroundColor:
                                                          Colors.transparent,
                                                      enableDrag: false,
                                                      context: context,
                                                      builder: (context) {
                                                        return GestureDetector(
                                                          onTap: () {
                                                            FocusScope.of(
                                                                    context)
                                                                .unfocus();
                                                            FocusManager
                                                                .instance
                                                                .primaryFocus
                                                                ?.unfocus();
                                                          },
                                                          child: Padding(
                                                            padding: MediaQuery
                                                                .viewInsetsOf(
                                                                    context),
                                                            child:
                                                                CardAcoesWidget(
                                                              cliente:
                                                                  listViewUsersRecord
                                                                      .reference,
                                                            ),
                                                          ),
                                                        );
                                                      },
                                                    ).then((value) =>
                                                        safeSetState(() {}));
                                                  },
                                                  child: Material(
                                                    color: Colors.transparent,
                                                    elevation: 2.0,
                                                    shape:
                                                        RoundedRectangleBorder(
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              12.0),
                                                    ),
                                                    child: Container(
                                                      width: MediaQuery.sizeOf(
                                                                  context)
                                                              .width *
                                                          1.0,
                                                      decoration: BoxDecoration(
                                                        color: FlutterFlowTheme
                                                                .of(context)
                                                            .secondaryBackground,
                                                        borderRadius:
                                                            BorderRadius
                                                                .circular(12.0),
                                                      ),
                                                      child: Padding(
                                                        padding:
                                                            EdgeInsetsDirectional
                                                                .fromSTEB(
                                                                    16.0,
                                                                    16.0,
                                                                    16.0,
                                                                    16.0),
                                                        child: Row(
                                                          mainAxisSize:
                                                              MainAxisSize.max,
                                                          mainAxisAlignment:
                                                              MainAxisAlignment
                                                                  .spaceBetween,
                                                          children: [
                                                            Flexible(
                                                              child: Row(
                                                                mainAxisSize:
                                                                    MainAxisSize
                                                                        .max,
                                                                children: [
                                                                  Container(
                                                                    width: 50.0,
                                                                    height:
                                                                        50.0,
                                                                    decoration:
                                                                        BoxDecoration(
                                                                      color: FlutterFlowTheme.of(
                                                                              context)
                                                                          .accent1,
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                    ),
                                                                    child:
                                                                        ClipRRect(
                                                                      borderRadius:
                                                                          BorderRadius.circular(
                                                                              25.0),
                                                                      child: Image
                                                                          .network(
                                                                        listViewUsersRecord
                                                                            .photoUrl,
                                                                        width:
                                                                            50.0,
                                                                        height:
                                                                            50.0,
                                                                        fit: BoxFit
                                                                            .cover,
                                                                      ),
                                                                    ),
                                                                  ),
                                                                  Column(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .min,
                                                                    mainAxisAlignment:
                                                                        MainAxisAlignment
                                                                            .center,
                                                                    crossAxisAlignment:
                                                                        CrossAxisAlignment
                                                                            .start,
                                                                    children: [
                                                                      if (listViewUsersRecord
                                                                          .codigodospersonaisagendado
                                                                          .contains(
                                                                              gerenciamentodealunosPersonalAccountRecord?.codigoPersonal))
                                                                        GradientText(
                                                                          FFLocalizations.of(context)
                                                                              .getText(
                                                                            '0wboxbnj' /* MH Agenda Fit */,
                                                                          ),
                                                                          style: FlutterFlowTheme.of(context)
                                                                              .bodyLarge
                                                                              .override(
                                                                                font: GoogleFonts.readexPro(
                                                                                  fontWeight: FontWeight.w600,
                                                                                  fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                ),
                                                                                letterSpacing: 0.0,
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                          colors: [
                                                                            FlutterFlowTheme.of(context).primary,
                                                                            Color(0xFF063F83)
                                                                          ],
                                                                          gradientDirection:
                                                                              GradientDirection.ltr,
                                                                          gradientType:
                                                                              GradientType.linear,
                                                                        ),
                                                                      Text(
                                                                        listViewUsersRecord
                                                                            .displayName,
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodyLarge
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FontWeight.w600,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                              ),
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FontWeight.w600,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                            ),
                                                                      ),
                                                                      Text(
                                                                        'Aluno desde: ${dateTimeFormat(
                                                                          "MMMEd",
                                                                          listViewUsersRecord
                                                                              .alunoDesde,
                                                                          locale:
                                                                              FFLocalizations.of(context).languageCode,
                                                                        )}',
                                                                        style: FlutterFlowTheme.of(context)
                                                                            .bodySmall
                                                                            .override(
                                                                              font: GoogleFonts.readexPro(
                                                                                fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                              ),
                                                                              color: FlutterFlowTheme.of(context).secondaryText,
                                                                              letterSpacing: 0.0,
                                                                              fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                              fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                            ),
                                                                      ),
                                                                    ],
                                                                  ),
                                                                ].divide(SizedBox(
                                                                    width:
                                                                        12.0)),
                                                              ),
                                                            ),
                                                            InkWell(
                                                              splashColor: Colors
                                                                  .transparent,
                                                              focusColor: Colors
                                                                  .transparent,
                                                              hoverColor: Colors
                                                                  .transparent,
                                                              highlightColor:
                                                                  Colors
                                                                      .transparent,
                                                              onTap: () async {
                                                                logFirebaseEvent(
                                                                    'GERENCIAMENTODEALUNOS_Icon_6rjum3gw_ON_T');
                                                                logFirebaseEvent(
                                                                    'Icon_navigate_to');
                                                                if (Navigator.of(
                                                                        context)
                                                                    .canPop()) {
                                                                  context.pop();
                                                                }
                                                                context
                                                                    .pushNamed(
                                                                  EditarAlunoWidget
                                                                      .routeName,
                                                                  queryParameters:
                                                                      {
                                                                    'users':
                                                                        serializeParam(
                                                                      listViewUsersRecord
                                                                          .reference,
                                                                      ParamType
                                                                          .DocumentReference,
                                                                    ),
                                                                  }.withoutNulls,
                                                                  extra: <String,
                                                                      dynamic>{
                                                                    kTransitionInfoKey:
                                                                        TransitionInfo(
                                                                      hasTransition:
                                                                          true,
                                                                      transitionType:
                                                                          PageTransitionType
                                                                              .fade,
                                                                      duration: Duration(
                                                                          milliseconds:
                                                                              50),
                                                                    ),
                                                                  },
                                                                );
                                                              },
                                                              child: Icon(
                                                                Icons.more_vert,
                                                                color: FlutterFlowTheme.of(
                                                                        context)
                                                                    .secondaryText,
                                                                size: 24.0,
                                                              ),
                                                            ),
                                                          ],
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                                );
                                              },
                                            );
                                          },
                                        ),
                                      if (_model.howStep == 'gerenciamento')
                                        Builder(
                                          builder: (context) {
                                            final usersgerencimento = _model
                                                    .queryUsrese?.users
                                                    ?.toList() ??
                                                [];
                                            if (usersgerencimento.isEmpty) {
                                              return NaoexistealunoWidget();
                                            }

                                            return ListView.separated(
                                              padding: EdgeInsets.zero,
                                              primary: false,
                                              shrinkWrap: true,
                                              cacheExtent: 800.0,
                                              addAutomaticKeepAlives: false,
                                              scrollDirection: Axis.vertical,
                                              itemCount:
                                                  usersgerencimento.length,
                                              separatorBuilder: (_, __) =>
                                                  SizedBox(height: 12.0),
                                              itemBuilder: (context,
                                                  usersgerencimentoIndex) {
                                                final usersgerencimentoItem =
                                                    usersgerencimento[
                                                        usersgerencimentoIndex];
                                                return StreamBuilder<
                                                    UsersRecord>(
                                                  stream: UsersRecord
                                                      .getDocument(
                                                          usersgerencimentoItem),
                                                  builder: (context, snapshot) {
                                                    // Customize what your widget looks like when it's loading.
                                                    if (!snapshot.hasData) {
                                                      return Center(
                                                        child: SizedBox(
                                                          width: 50.0,
                                                          height: 50.0,
                                                          child:
                                                              SpinKitFadingFour(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .customColor3,
                                                            size: 50.0,
                                                          ),
                                                        ),
                                                      );
                                                    }

                                                    final containerUsersRecord =
                                                        snapshot.data!;

                                                    return InkWell(
                                                      splashColor:
                                                          Colors.transparent,
                                                      focusColor:
                                                          Colors.transparent,
                                                      hoverColor:
                                                          Colors.transparent,
                                                      highlightColor:
                                                          Colors.transparent,
                                                      onTap: () async {
                                                        logFirebaseEvent(
                                                            'GERENCIAMENTODEALUNOS_Container_7wqclxci');
                                                        logFirebaseEvent(
                                                            'Container_bottom_sheet');
                                                        await showModalBottomSheet(
                                                          isScrollControlled:
                                                              true,
                                                          backgroundColor:
                                                              Colors
                                                                  .transparent,
                                                          enableDrag: false,
                                                          context: context,
                                                          builder: (context) {
                                                            return GestureDetector(
                                                              onTap: () {
                                                                FocusScope.of(
                                                                        context)
                                                                    .unfocus();
                                                                FocusManager
                                                                    .instance
                                                                    .primaryFocus
                                                                    ?.unfocus();
                                                              },
                                                              child: Padding(
                                                                padding: MediaQuery
                                                                    .viewInsetsOf(
                                                                        context),
                                                                child:
                                                                    CardAcoesWidget(
                                                                  cliente:
                                                                      containerUsersRecord
                                                                          .reference,
                                                                ),
                                                              ),
                                                            );
                                                          },
                                                        ).then((value) =>
                                                            safeSetState(
                                                                () {}));
                                                      },
                                                      child: Material(
                                                        color:
                                                            Colors.transparent,
                                                        elevation: 2.0,
                                                        shape:
                                                            RoundedRectangleBorder(
                                                          borderRadius:
                                                              BorderRadius
                                                                  .circular(
                                                                      12.0),
                                                        ),
                                                        child: Container(
                                                          width:
                                                              MediaQuery.sizeOf(
                                                                          context)
                                                                      .width *
                                                                  1.0,
                                                          decoration:
                                                              BoxDecoration(
                                                            color: FlutterFlowTheme
                                                                    .of(context)
                                                                .secondaryBackground,
                                                            borderRadius:
                                                                BorderRadius
                                                                    .circular(
                                                                        12.0),
                                                          ),
                                                          child: Padding(
                                                            padding:
                                                                EdgeInsetsDirectional
                                                                    .fromSTEB(
                                                                        16.0,
                                                                        16.0,
                                                                        16.0,
                                                                        16.0),
                                                            child: Row(
                                                              mainAxisSize:
                                                                  MainAxisSize
                                                                      .max,
                                                              mainAxisAlignment:
                                                                  MainAxisAlignment
                                                                      .spaceBetween,
                                                              children: [
                                                                Flexible(
                                                                  child: Row(
                                                                    mainAxisSize:
                                                                        MainAxisSize
                                                                            .max,
                                                                    children: [
                                                                      Container(
                                                                        width:
                                                                            50.0,
                                                                        height:
                                                                            50.0,
                                                                        decoration:
                                                                            BoxDecoration(
                                                                          color:
                                                                              FlutterFlowTheme.of(context).accent1,
                                                                          borderRadius:
                                                                              BorderRadius.circular(25.0),
                                                                        ),
                                                                        child:
                                                                            ClipRRect(
                                                                          borderRadius:
                                                                              BorderRadius.circular(25.0),
                                                                          child:
                                                                              CachedNetworkImage(
                                                                            imageUrl:
                                                                                containerUsersRecord.photoUrl,
                                                                            width:
                                                                                50.0,
                                                                            height:
                                                                                50.0,
                                                                            fit:
                                                                                BoxFit.cover,
                                                                            memCacheWidth:
                                                                                100,
                                                                            memCacheHeight:
                                                                                100,
                                                                            placeholder: (context, url) =>
                                                                                Container(
                                                                              color: FlutterFlowTheme.of(context).accent1,
                                                                            ),
                                                                            errorWidget: (context, url, error) =>
                                                                                const Icon(
                                                                              Icons.person,
                                                                              size: 28.0,
                                                                            ),
                                                                          ),
                                                                        ),
                                                                      ),
                                                                      Flexible(
                                                                        child:
                                                                            Column(
                                                                          mainAxisSize:
                                                                              MainAxisSize.min,
                                                                          mainAxisAlignment:
                                                                              MainAxisAlignment.center,
                                                                          crossAxisAlignment:
                                                                              CrossAxisAlignment.start,
                                                                          children: [
                                                                            if (containerUsersRecord.codigodospersonaisagendado.contains(gerenciamentodealunosPersonalAccountRecord?.codigoPersonal))
                                                                              GradientText(
                                                                                FFLocalizations.of(context).getText(
                                                                                  'j7w82zx2' /* MH Agenda Fit */,
                                                                                ),
                                                                                style: FlutterFlowTheme.of(context).bodyLarge.override(
                                                                                      font: GoogleFonts.readexPro(
                                                                                        fontWeight: FontWeight.w600,
                                                                                        fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                      ),
                                                                                      letterSpacing: 0.0,
                                                                                      fontWeight: FontWeight.w600,
                                                                                      fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                    ),
                                                                                colors: [
                                                                                  FlutterFlowTheme.of(context).primary,
                                                                                  Color(0xFF063F83)
                                                                                ],
                                                                                gradientDirection: GradientDirection.ltr,
                                                                                gradientType: GradientType.linear,
                                                                              ),
                                                                            Text(
                                                                              containerUsersRecord.displayName,
                                                                              style: FlutterFlowTheme.of(context).bodyLarge.override(
                                                                                    font: GoogleFonts.readexPro(
                                                                                      fontWeight: FontWeight.w600,
                                                                                      fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                    ),
                                                                                    letterSpacing: 0.0,
                                                                                    fontWeight: FontWeight.w600,
                                                                                    fontStyle: FlutterFlowTheme.of(context).bodyLarge.fontStyle,
                                                                                  ),
                                                                            ),
                                                                            Text(
                                                                              'Aluno desde: ${dateTimeFormat(
                                                                                "d/M/y",
                                                                                containerUsersRecord.alunoDesde,
                                                                                locale: FFLocalizations.of(context).languageCode,
                                                                              )}',
                                                                              style: FlutterFlowTheme.of(context).bodySmall.override(
                                                                                    font: GoogleFonts.readexPro(
                                                                                      fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                      fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                                    ),
                                                                                    color: FlutterFlowTheme.of(context).secondaryText,
                                                                                    letterSpacing: 0.0,
                                                                                    fontWeight: FlutterFlowTheme.of(context).bodySmall.fontWeight,
                                                                                    fontStyle: FlutterFlowTheme.of(context).bodySmall.fontStyle,
                                                                                  ),
                                                                            ),
                                                                          ],
                                                                        ),
                                                                      ),
                                                                    ].divide(SizedBox(
                                                                        width:
                                                                            12.0)),
                                                                  ),
                                                                ),
                                                                InkWell(
                                                                  splashColor:
                                                                      Colors
                                                                          .transparent,
                                                                  focusColor: Colors
                                                                      .transparent,
                                                                  hoverColor: Colors
                                                                      .transparent,
                                                                  highlightColor:
                                                                      Colors
                                                                          .transparent,
                                                                  onTap:
                                                                      () async {
                                                                    logFirebaseEvent(
                                                                        'GERENCIAMENTODEALUNOS_Icon_nhpmmpo6_ON_T');
                                                                    logFirebaseEvent(
                                                                        'Icon_navigate_to');
                                                                    if (Navigator.of(
                                                                            context)
                                                                        .canPop()) {
                                                                      context
                                                                          .pop();
                                                                    }
                                                                    context
                                                                        .pushNamed(
                                                                      EditarAlunoWidget
                                                                          .routeName,
                                                                      queryParameters:
                                                                          {
                                                                        'users':
                                                                            serializeParam(
                                                                          containerUsersRecord
                                                                              .reference,
                                                                          ParamType
                                                                              .DocumentReference,
                                                                        ),
                                                                      }.withoutNulls,
                                                                      extra: <String,
                                                                          dynamic>{
                                                                        kTransitionInfoKey:
                                                                            TransitionInfo(
                                                                          hasTransition:
                                                                              true,
                                                                          transitionType:
                                                                              PageTransitionType.fade,
                                                                          duration:
                                                                              Duration(milliseconds: 50),
                                                                        ),
                                                                      },
                                                                    );
                                                                  },
                                                                  child: Icon(
                                                                    Icons
                                                                        .more_vert,
                                                                    color: FlutterFlowTheme.of(
                                                                            context)
                                                                        .secondaryText,
                                                                    size: 24.0,
                                                                  ),
                                                                ),
                                                              ],
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    );
                                                  },
                                                );
                                              },
                                            );
                                          },
                                        ),
                                    ].divide(SizedBox(height: 16.0)),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      if (responsiveVisibility(
                        context: context,
                        phone: false,
                        tablet: false,
                        tabletLandscape: false,
                      ))
                        wrapWithModel(
                          model: _model.headerwebModel,
                          updateCallback: () => safeSetState(() {}),
                          child: HeaderwebWidget(),
                        ),
                    ],
                  ),
                ),
              ),
            ));
      },
    );
  }
}


