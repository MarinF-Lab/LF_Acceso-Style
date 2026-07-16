// Configuración de Supabase para LF Acceso Style.
// Crea tu proyecto en https://supabase.com, ejecuta supabase/schema.sql en el
// SQL Editor, y copia aquí la Project URL y la anon public key
// (Settings → API). Plan gratis, sin tarjeta de crédito.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://lrsabhcyaxglxggpqpta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxyc2FiaGN5YXhnbHhnZ3BxcHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTI0MTAsImV4cCI6MjA5ODA2ODQxMH0.EdgM_kjA9frJV5i_dyMOQTdqT0vJ6rKpvfV_VRzesRQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
