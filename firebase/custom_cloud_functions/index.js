const { getApps, initializeApp } = require("firebase-admin/app");
if (getApps().length === 0) {
  initializeApp();
}

const createInscricao = require("./create_inscricao.js");
exports.createInscricao = createInscricao.createInscricao;

const createSetupIntent = require("./create_setup_intent.js");
exports.createSetupIntent = createSetupIntent.createSetupIntent;

const stripeConnectStatus = require("./stripe_connect_status.js");
exports.stripeConnectStatus = stripeConnectStatus.stripeConnectStatus;

const createCheckoutSession = require("./create_checkout_session.js");
exports.createCheckoutSession = createCheckoutSession.createCheckoutSession;

const createAndVerifyStripeAccount = require("./create_and_verify_stripe_account.js");
exports.createAndVerifyStripeAccount =
  createAndVerifyStripeAccount.createAndVerifyStripeAccount;

const subscriptionStatus = require("./subscription_status.js");
exports.subscriptionStatus = subscriptionStatus.subscriptionStatus;

const cancelSubscription = require("./cancel_subscription.js");
exports.cancelSubscription = cancelSubscription.cancelSubscription;

const stripeWebhook = require("./stripe_webhook.js");
exports.stripeWebhook = stripeWebhook.stripeWebhook;

const openRouterAi = require("./openrouter_ai.js");
exports.openrouterGenerateText = openRouterAi.openrouterGenerateText;
exports.openrouterCountTokens = openRouterAi.openrouterCountTokens;
exports.openrouterTextFromImage = openRouterAi.openrouterTextFromImage;
exports.AIparaconversarcomosusers = openRouterAi.AIparaconversarcomosusers;

const emailAdmin = require("./email_admin.js");
exports.adminEmailInbox = emailAdmin.adminEmailInbox;
exports.adminEmailMessage = emailAdmin.adminEmailMessage;
exports.adminEmailSend = emailAdmin.adminEmailSend;

const aiProgressPlanner = require("./ai_progress_planner.js");
exports.reviewPremiumStudentsWeekly =
  aiProgressPlanner.reviewPremiumStudentsWeekly;
exports.reviewProgressOnWorkoutCompletion =
  aiProgressPlanner.reviewProgressOnWorkoutCompletion;

const personalNotifications = require("./personal_notifications.js");
exports.notifyPersonalOnStudentLinkChange =
  personalNotifications.notifyPersonalOnStudentLinkChange;
exports.notifyPersonalOnWorkoutCompletion =
  personalNotifications.notifyPersonalOnWorkoutCompletion;
exports.notifyPersonalOnFeedbackCreated =
  personalNotifications.notifyPersonalOnFeedbackCreated;
exports.notifyPersonalOnOnlineEvaluationCreated =
  personalNotifications.notifyPersonalOnOnlineEvaluationCreated;
exports.notifyPersonalOnPersonalizedEvaluationCreated =
  personalNotifications.notifyPersonalOnPersonalizedEvaluationCreated;
exports.notifyPersonalOnPosturalEvaluationCreated =
  personalNotifications.notifyPersonalOnPosturalEvaluationCreated;
exports.notifyPersonalOnPhysicalEvaluationCreated =
  personalNotifications.notifyPersonalOnPhysicalEvaluationCreated;
exports.notifyPersonalOnStudentMessage =
  personalNotifications.notifyPersonalOnStudentMessage;
exports.notifyStudentOnWorkoutAssigned =
  personalNotifications.notifyStudentOnWorkoutAssigned;
exports.notifyStudentOnAerobicWorkoutAssigned =
  personalNotifications.notifyStudentOnAerobicWorkoutAssigned;
exports.notifyStudentOnOnlineEvaluationAssigned =
  personalNotifications.notifyStudentOnOnlineEvaluationAssigned;
exports.notifyStudentOnPersonalizedEvaluationAssigned =
  personalNotifications.notifyStudentOnPersonalizedEvaluationAssigned;
exports.notifyStudentOnPosturalEvaluationAssigned =
  personalNotifications.notifyStudentOnPosturalEvaluationAssigned;
exports.notifyStudentOnPhysicalEvaluationAssigned =
  personalNotifications.notifyStudentOnPhysicalEvaluationAssigned;

const resolveInvitePersonal = require("./resolve_invite_personal.js");
exports.resolveInvitePersonal = resolveInvitePersonal.resolveInvitePersonal;

const mobileAuthHandoff = require("./mobile_auth_handoff.js");
exports.startMobileAuthHandoff = mobileAuthHandoff.startMobileAuthHandoff;
exports.consumeMobileAuthHandoff = mobileAuthHandoff.consumeMobileAuthHandoff;

const notificationAiDispatcher = require("./notification_ai_dispatcher.js");
exports.runNotificationAssistantAutoDispatch =
  notificationAiDispatcher.runNotificationAssistantAutoDispatch;
