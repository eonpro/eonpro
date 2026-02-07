/**
 * Patient portal translations (English / Spanish).
 * Used when clinic offers language toggle; preference stored on user profile.
 */

export type PatientPortalLang = 'en' | 'es';

export const patientPortalTranslations: Record<PatientPortalLang, Record<string, string>> = {
  en: {
    // Nav
    navHome: 'Home',
    navAppointments: 'Appointments',
    navAppts: 'Appts',
    navCarePlan: 'My Care Plan',
    navProgress: 'Progress',
    navPhotos: 'Photos',
    navAchievements: 'Achievements',
    navMedications: 'Medications',
    navMeds: 'Meds',
    navShipments: 'Shipments',
    navSymptomChecker: 'Symptom Checker',
    navTools: 'Tools',
    navResources: 'Resources',
    navBilling: 'Billing',
    navSettings: 'Settings',
    navProfile: 'Profile',
    navSignOut: 'Sign Out',
    // Settings
    settingsTitle: 'Settings',
    settingsSubtitle: 'Manage your account and preferences',
    settingsProfile: 'Profile',
    settingsPassword: 'Password',
    settingsNotifications: 'Notifications',
    settingsPrivacy: 'Privacy',
    settingsLanguage: 'Language',
    settingsLanguageDesc: 'Choose your preferred language for the patient portal',
    settingsEnglish: 'English',
    settingsSpanish: 'Spanish',
    personalInfo: 'Personal Information',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    phone: 'Phone',
    dateOfBirth: 'Date of Birth',
    saveChanges: 'Save Changes',
    saving: 'Saving...',
    changePassword: 'Change Password',
    currentPassword: 'Current Password',
    newPassword: 'New Password',
    confirmNewPassword: 'Confirm New Password',
    updatePassword: 'Update Password',
    updating: 'Updating...',
    notificationPreferences: 'Notification Preferences',
    emailReminders: 'Email Reminders',
    emailRemindersDesc: 'Medication and appointment reminders via email',
    smsReminders: 'SMS Reminders',
    smsRemindersDesc: 'Text message reminders for appointments',
    shipmentUpdates: 'Shipment Updates',
    shipmentUpdatesDesc: 'Notifications about your medication shipments',
    appointmentReminders: 'Appointment Reminders',
    appointmentRemindersDesc: '24-hour advance notice for appointments',
    promotionalEmails: 'Promotional Emails',
    promotionalEmailsDesc: 'News, tips, and special offers',
    privacyData: 'Privacy & Data',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    hipaaNotice: 'HIPAA Notice',
    requestDataExport: 'Request Data Export',
    requestDataExportDesc: 'You can request a copy of all your personal data. This may take up to 30 days to process.',
    requestDataExportBtn: 'Request Data Export →',
    changesSaved: 'Changes saved successfully!',
  },
  es: {
    navHome: 'Inicio',
    navAppointments: 'Citas',
    navAppts: 'Citas',
    navCarePlan: 'Mi plan de cuidado',
    navProgress: 'Progreso',
    navPhotos: 'Fotos',
    navAchievements: 'Logros',
    navMedications: 'Medicamentos',
    navMeds: 'Meds',
    navShipments: 'Envíos',
    navSymptomChecker: 'Verificador de síntomas',
    navTools: 'Herramientas',
    navResources: 'Recursos',
    navBilling: 'Facturación',
    navSettings: 'Configuración',
    navProfile: 'Perfil',
    navSignOut: 'Cerrar sesión',
    settingsTitle: 'Configuración',
    settingsSubtitle: 'Administra tu cuenta y preferencias',
    settingsProfile: 'Perfil',
    settingsPassword: 'Contraseña',
    settingsNotifications: 'Notificaciones',
    settingsPrivacy: 'Privacidad',
    settingsLanguage: 'Idioma',
    settingsLanguageDesc: 'Elige tu idioma preferido para el portal del paciente',
    settingsEnglish: 'Inglés',
    settingsSpanish: 'Español',
    personalInfo: 'Información personal',
    firstName: 'Nombre',
    lastName: 'Apellido',
    email: 'Correo electrónico',
    phone: 'Teléfono',
    dateOfBirth: 'Fecha de nacimiento',
    saveChanges: 'Guardar cambios',
    saving: 'Guardando...',
    changePassword: 'Cambiar contraseña',
    currentPassword: 'Contraseña actual',
    newPassword: 'Nueva contraseña',
    confirmNewPassword: 'Confirmar nueva contraseña',
    updatePassword: 'Actualizar contraseña',
    updating: 'Actualizando...',
    notificationPreferences: 'Preferencias de notificaciones',
    emailReminders: 'Recordatorios por correo',
    emailRemindersDesc: 'Recordatorios de medicamentos y citas por correo',
    smsReminders: 'Recordatorios por SMS',
    smsRemindersDesc: 'Recordatorios por mensaje de texto para citas',
    shipmentUpdates: 'Actualizaciones de envío',
    shipmentUpdatesDesc: 'Notificaciones sobre el envío de tus medicamentos',
    appointmentReminders: 'Recordatorios de citas',
    appointmentRemindersDesc: 'Aviso con 24 horas de anticipación para citas',
    promotionalEmails: 'Correos promocionales',
    promotionalEmailsDesc: 'Noticias, consejos y ofertas especiales',
    privacyData: 'Privacidad y datos',
    privacyPolicy: 'Política de privacidad',
    termsOfService: 'Términos de servicio',
    hipaaNotice: 'Aviso HIPAA',
    requestDataExport: 'Solicitar exportación de datos',
    requestDataExportDesc: 'Puedes solicitar una copia de todos tus datos personales. Puede tardar hasta 30 días en procesarse.',
    requestDataExportBtn: 'Solicitar exportación de datos →',
    changesSaved: '¡Cambios guardados correctamente!',
  },
};

const STORAGE_KEY = 'patient-portal-language';

export function getPatientPortalTranslation(lang: PatientPortalLang, key: string): string {
  const dict = patientPortalTranslations[lang];
  return dict?.[key] ?? patientPortalTranslations.en[key] ?? key;
}

export function getStoredPatientPortalLanguage(): PatientPortalLang {
  if (typeof window === 'undefined') return 'en';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'es' ? 'es' : 'en';
}

export function setStoredPatientPortalLanguage(lang: PatientPortalLang): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, lang);
}
