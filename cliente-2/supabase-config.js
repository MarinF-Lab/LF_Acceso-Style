// Configuración de Supabase para LF Acceso Style.
// Crea tu proyecto en https://supabase.com, ejecuta supabase/schema.sql en el
// SQL Editor, y copia aquí la Project URL y la anon public key
// (Settings → API). Plan gratis, sin tarjeta de crédito.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "REEMPLAZAR_CON_TU_PROJECT_URL";
const SUPABASE_ANON_KEY = "REEMPLAZAR_CON_TU_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
