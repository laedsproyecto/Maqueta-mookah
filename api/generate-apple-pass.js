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
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({ error: 'Faltan credenciales de Supabase en Vercel' });
        }
        if (!process.env.PASSKIT_KEY || !process.env.PASSKIT_SECRET || !process.env.PASSKIT_PROGRAM_ID) {
            return res.status(500).json({ error: 'Faltan credenciales de PassKit en Vercel' });
        }

        // Consultar Supabase
        const sbResponse = await fetch(`${process.env.SUPABASE_URL}/rest/v1/clientes?telefono=eq.${encodeURIComponent(telefono)}&select=*`, {
            method: 'GET',
            headers: {
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            }
        });

        const clientes = await sbResponse.json();

        if (!sbResponse.ok || !clientes || clientes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado en la base de datos' });
        }

        const cliente = clientes[0];
        const visitas = cliente.visitas_totales || 1;
        
        // Limpiar teléfono para dejar solo números (necesario para PassKit)
        const telefonoLimpio = cliente.telefono.replace(/\D/g, '');

        const credentials = Buffer.from(`${process.env.PASSKIT_KEY}:${process.env.PASSKIT_SECRET}`).toString('base64');

        // Petición a PassKit
        const pkPayload = {
            programId: process.env.PASSKIT_PROGRAM_ID.trim(),
            externalId: telefonoLimpio,
            person: {
                forename: cliente.nombre || 'Cliente',
                surname: cliente.apellido || ''
            },
            points: visitas,
            mobile: telefonoLimpio
        };

        console.log("Enviando a PassKit:", JSON.stringify(pkPayload));

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
            console.error("PassKit Error Details:", passResult);
            return res.status(500).json({ error: 'PassKit rechazó la solicitud', details: passResult });
        }

        if (passResult && passResult.passUrl) {
            return res.status(200).json({ downloadUrl: passResult.passUrl });
        } else {
            return res.status(500).json({ error: 'PassKit no devolvió una URL válida', details: passResult });
        }

    } catch (err) {
        console.error("Error interno:", err.message);
        return res.status(500).json({ error: 'Error interno en la función', details: err.message });
    }
}
