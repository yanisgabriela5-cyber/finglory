// Configuración de FinGlory.
// 1) Pega aquí los datos de tu app web de Firebase:
//    Firebase → ⚙ Configuración del proyecto → General → Tus apps → Configuración del SDK (objeto firebaseConfig).
//    Estos valores son públicos a propósito: lo que protege los datos son las reglas de firestore.rules.
window.APP_CONFIG = {
  appName: 'FinGlory',
  backend: 'firebase', // 'firebase' o 'supabase'
  firebase: {
    apiKey: 'AIzaSyCVWVnyekVAP50dxzS5VkfD-8KgSswNsQo',
    authDomain: 'finglory-711dd.firebaseapp.com',
    projectId: 'finglory-711dd',
    appId: '1:777458564779:web:dc5473d5064cdbcccb81ee'
  },
  // Solo si algún día usas Supabase en vez de Firebase (ver schema.sql):
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'TU-ANON-KEY'
};
