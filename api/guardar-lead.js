import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Configuración Supabase (Variables de entorno)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // Service Role Key (Secreta)
const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración Facebook
const FB_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;
const FB_PIXEL_ID = '887364637173488';

// Función de Hashing SHA-256 para CAPI
function hashData(data) {
    if (!data) return null;
    return crypto.createHash('sha256').update(data.trim().toLowerCase()).digest('hex');
}

export default async function handler(req, res) {
    // CORS (Permitir solicitudes desde tu dominio)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { nombre, apellido, telefono, email, direccion } = req.body;

    try {
        // 1. Guardar en Supabase
        const { data: dbData, error: dbError } = await supabase
            .from('leads')
            .insert([{ nombre, apellido, telefono, email, direccion }])
            .select();

        if (dbError) throw dbError;

        // 2. Enviar a Facebook CAPI
        // Preparamos datos hasheados
        const userData = {
            fn: hashData(nombre),
            ln: hashData(apellido),
            em: hashData(email),
            ph: hashData(telefono), // Formato E.164 ideal, pero enviamos hash del input limpio
        };

        const eventData = {
            data: [
                {
                    event_name: 'Lead',
                    event_time: Math.floor(Date.now() / 1000),
                    user_data: userData,
                    custom_data: {
                        direccion_propiedad: direccion,
                        source: 'Landing Vendedores'
                    }
                }
            ]
        };

        // Fetch a Graph API (Asíncrono, no bloqueamos respuesta si no es crítico, pero esperamos para log)
        try {
            const fbResponse = await fetch(`https://graph.facebook.com/v18.0/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
            const fbResult = await fbResponse.json();
            console.log('Facebook CAPI Response:', fbResult);
        } catch (fbError) {
            console.error('Error enviando a Facebook CAPI:', fbError);
            // No fallamos la request completa si falla FB, priorizamos DB
        }

        return res.status(200).json({ success: true, message: 'Lead guardado y enviado a CAPI', data: dbData });

    } catch (error) {
        console.error('Error en API:', error);
        return res.status(500).json({ error: error.message });
    }
}
