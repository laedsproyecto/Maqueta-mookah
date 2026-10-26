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
        const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/[[\]()]/g, '').trim();
        const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/[[\]()]/g, '').trim();
        const passkitKey = (process.env.PASSKIT_KEY || '').replace(/[[\]()]/g, '').trim();
        const passkitSecret = (process.env.PASSKIT_SECRET || '').replace(/[[\]()]/g, '').trim();
        const passkitProgramId = (process.env.PASSKIT_PROGRAM_ID || '').replace(/[[\]()]/g, '').trim();

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Faltan credenciales de Supabase en Vercel' });
        }
        if (!passkitKey || !passkitSecret || !passkitProgramId) {
            return res.status(500).json({ error: 'Faltan credenciales de PassKit en Vercel' });
        }

        const baseUrl = supabaseUrl.replace(/\/+$/, '');
        const targetUrl = `${baseUrl}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=*`;

        const sbResponse = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });

        const rawText = await sbResponse.text();
        let clientes;
        try {
            clientes = JSON.parse(rawText);
        } catch (e) {
            return res.status(500).json({ error: 'Supabase respondió con formato inválido', details: rawText.substring(0, 150) });
        }

        if (!sbResponse.ok || !clientes || clientes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado en la base de datos', details: clientes });
        }

        const cliente = clientes[0];
        const visitas = cliente.visitas_totales || 1;
        const telefonoLimpio = cliente.telefono.replace(/\D/g, '');

        const credentials = Buffer.from(`${passkitKey}:${passkitSecret}`).toString('base64');

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

        // Ruta corregida en plural: /members/member
        const pkResponse = await fetch(`https://api.pub2.passkit.io/members/member`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pkPayload)
        });

        const passRawText = await pkResponse.text();
        let passResult;
        try {
            passResult = JSON.parse(passRawText);
        } catch (e) {
            return res.status(500).json({ error: 'PassKit respondió con formato inválido', details: passRawText.substring(0, 150) });
        }

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
