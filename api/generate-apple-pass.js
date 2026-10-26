import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { telefono } = req.query;
    if (!telefono) {
        return res.status(400).json({ error: 'Teléfono requerido' });
    }

    try {
        // Obtener datos del cliente desde Supabase
        const { data: cliente, error } = await supabase
            .from('clientes')
            .select('*')
            .eq('telefono', telefono)
            .single();

        if (error || !cliente) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
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
                    forename: cliente.nombre,
                    surname: cliente.apellido || ''
                },
                points: visitas,
                mobile: cliente.telefono
            })
        });

        const passResult = await response.json();

        if (passResult && passResult.passUrl) {
            return res.status(200).json({ downloadUrl: passResult.passUrl });
        } else {
            return res.status(500).json({ error: 'No se pudo generar la URL del pase' });
        }

    } catch (err) {
        console.error("Error generando pase Apple:", err);
        return res.status(500).json({ error: 'Error interno al procesar el pase' });
    }
}
