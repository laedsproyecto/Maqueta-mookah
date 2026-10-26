import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { telefono } = req.query;
    if (!telefono) {
        return res.status(400).json({ error: 'Teléfono requerido' });
    }

    try {
        // Verificar variables de entorno
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({ error: 'Faltan credenciales de Supabase en Vercel' });
        }
        if (!process.env.PASSKIT_KEY || !process.env.PASSKIT_SECRET || !process.env.PASSKIT_PROGRAM_ID) {
            return res.status(500).json({ error: 'Faltan credenciales de PassKit en Vercel' });
        }

        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // Obtener datos del cliente desde Supabase
        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefono', telefono)
            .single();

        if (error || !cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado en la base de datos' });
        }

        const visitas = cliente.visitas_totales || 1;

        // Autenticación básica para PassKit API
        const credentials = Buffer.from(`${process.env.PASSKIT_KEY}:${process.env.PASSKIT_SECRET}`).toString('base64');

        // Emitir pase mediante PassKit
        const response = await fetch(`https://api.pub2.passkit.io/member/member`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                programId: process.env.PASSKIT_PROGRAM_ID,
                externalId: cliente.telefono,
                person: {
                    forename: cliente.nombre || 'Cliente',
                    surname: cliente.apellido || ''
                },
                points: visitas,
                mobile: cliente.telefono
            })
        });

        const passResult = await response.json();

        if (!response.ok) {
            console.error("Error de PassKit API:", passResult);
            return res.status(500).json({ error: 'Error al comunicarse con PassKit', details: passResult });
        }

        if (passResult && passResult.passUrl) {
            return res.status(200).json({ downloadUrl: passResult.passUrl });
        } else {
            return res.status(500).json({ error: 'PassKit no devolvió una URL de descarga válida', details: passResult });
        }

    } catch (err) {
        console.error("Error interno en generate-apple-pass:", err);
        return res.status(500).json({ error: 'Error interno del servidor', details: err.message });
    }
}
