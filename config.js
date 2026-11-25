// Configuración de FinGlory.
// 1) Pega aquí los datos de tu app web de Firebase:
//    Firebase → ⚙ Configuración del proyecto → General → Tus apps → Configuración del SDK (objeto firebaseConfig).
//    Estos valores son públicos a propósito: lo que protege los datos son las reglas de firestore.rules.
window.APP_CONFIG = {
  appName: 'FinGlory',
  backend: 'firebase', // 'firebase' o 'supabase'
  firebase: {
    apiKey: 'TU-API-KEY',
    authDomain: 'TU-PROYECTO.firebaseapp.com',
    projectId: 'TU-PROYECTO',
    appId: 'TU-APP-ID'
  },
  // Solo si algún día usas Supabase en vez de Firebase (ver schema.sql):
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'TU-ANON-KEY'
};
