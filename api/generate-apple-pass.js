export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { telefono } = req.query;
    if (!telefono) {
        return res.status(400).json({ error: 'Teléfono requerido' });
    }

    try {
        // Limpiar variables de entorno para eliminar espacios invisibles
        const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
        const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
        const passkitKey = (process.env.PASSKIT_KEY || '').trim();
        const passkitSecret = (process.env.PASSKIT_SECRET || '').trim();
        const passkitProgramId = (process.env.PASSKIT_PROGRAM_ID || '').trim();

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Faltan credenciales de Supabase en Vercel' });
        }
        if (!passkitKey || !passkitSecret || !passkitProgramId) {
            return res.status(500).json({ error: 'Faltan credenciales de PassKit en Vercel' });
        }

        // Normalizar URL base de Supabase quitando barra final si la tiene
        const baseUrl = supabaseUrl.replace(/\/+$/, '');
        const targetUrl = `${baseUrl}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=*`;

        // Consultar Supabase
        const sbResponse = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        const clientes = await sbResponse.json();

        if (!sbResponse.ok || !clientes || clientes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado en la base de datos' });
        }

        const cliente = clientes[0];
        const visitas = cliente.visitas_totales || 1;
        const telefonoLimpio = cliente.telefono.replace(/\D/g, '');

        const credentials = Buffer.from(`${passkitKey}:${passkitSecret}`).toString('base64');

        // Petición a PassKit
        const pkPayload = {
            programId: passkitProgramId,
            externalId: telefonoLimpio,
            person: {
                forename: cliente.nombre || 'Cliente',
                surname: cliente.apellido || ''
            },
            points: visitas,
            mobile: telefonoLimpio
        };

        const pkResponse = await fetch(`https://api.pub2.passkit.io/member/member`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pkPayload)
        });

        const passResult = await pkResponse.json();

        if (!pkResponse.ok) {
            return res.status(500).json({ error: 'PassKit rechazó la solicitud', details: passResult });
        }

        if (passResult && passResult.passUrl) {
            return res.status(200).json({ downloadUrl: passResult.passUrl });
        } else {
            return res.status(500).json({ error: 'PassKit no devolvió una URL válida', details: passResult });
        }

    } catch (err) {
        return res.status(500).json({ error: 'Error interno en la función', details: err.message });
    }
}
