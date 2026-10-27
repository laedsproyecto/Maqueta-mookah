import jsrsasign from 'jsrsasign';

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
        const clientEmail = (process.env.GOOGLE_CLIENT_EMAIL || '').trim();
        const issuerId = (process.env.GOOGLE_ISSUER_ID || '').trim();
        const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/[[\]()]/g, '').trim();
        const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/[[\]()]/g, '').trim();

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Faltan credenciales de Supabase' });
        }
        if (!clientEmail || !issuerId) {
            return res.status(500).json({ error: 'Faltan credenciales de Google Wallet en Vercel' });
        }

        const pemKey = [
            "-----BEGIN PRIVATE KEY-----",
            "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCpM9lY1iuC4fEo",
            "5MZwMtA5KurXPH6o8SIUi/DjWvMZzqF+AT4vU17EFd9vtq7KEFOrvoBpB6u8F6BU",
            "nebswhLR8d6FzELP80R/CxM3K3dSxGZi1eo3zsL1t7vsjkuWPoXgVPEQd1oiFqZ8Z",
            "nvSpYdSgxxrX+lL60ZhCZy7wxvAx0CV+BvpXuKSITkRYCpLr0yrGt05ENEXJ+Pdtb",
            "Lfy/oBxGOK7Eics5vv9sAEJ0FsJ2luG+9fQSfbpECdkt1YwrJEFgqAKIU8FacCZd",
            "QT2Nggi7ovQvIIOOytI+gC/RdoJWoMzLCfHgRi6ytHrRA1HfjAQboL2ksC+WeQcX",
            "+gLFZVP5AgMBAAECggEAGL4XwOlkqHmAyfGWYQ7VKx7vA3V5shu815NVMPH6TaJN",
            "ND9bSBFhcLwgFdZ5fdvgWGN9pJ42C0XLML8yU9h8Ch12Uvy0zToJcnJUA5/nu9QZ",
            "5CPdQS7trHc/a0bOYfADPtu2vEREZ4NT3DAw0omjTJAZyfYXYwrvz4We6gjtK0R8",
            "mnlD2gdfg/1nZ6DCSu3f0rg9bQjxfsd9sD8ZtyKs9UmXGZMPTPCy11hidM0U+tfT",
            "EzSMXDa0s9G62FuEu8ydJAZ4FmMLXFQtPvV1trqoB10NywfJXYfGbhXaHCIXObm8",
            "T5yMwOAdK9AqhDqe1XmB2d+FVnpBZzHsH/DZLx/2bwKBgQDfC/+Vtkpb8aV1bB4Q",
            "+I846q2xE2lfBkQrdj7s15Bvac2G+lSa3eCX5cuneWpI2JC3Qo1msySv6FkguY7E",
            "r0VujczRzEO3ZAD9dhUWC1/Np4DU5DkGaf5T2iD/qt1u5vZBq2cIR9w6Hat+cnCh",
            "j7ooi2FEcHDCe0kMBrHzyARhgwKBgQDCM15tGq5DQgSKIp2jkbmMYVMmGgyN+t4K",
            "WZ65nlnM1kKRlKUQhHjPFnXzHMV1Cb9u6NFv+0tJJTmlEme9eLWDnf00sSI5O+LL",
            "6bRlsK8Q4rZ6zsFi2aA3+0ATeafFiKuSJy+31PK4+ZlU8BKgftMk/+Ibe6lOAC+I",
            "C/rQ1/on0wKBgA2LoP3qkCF9T1sOMdU+AxSly96RGzkWHFW3XKLthGv/tOeZlEHD",
            "nb7xJzFBjYz0BSeiXNhcikfvM1HzUSANR0ZmhKusiyIn+nMDHxwgLsMnAfmZvZbcq",
            "ALP+7zoXmlL9276pNhyeoJU28A9By+1D2T5VGJcbbP2ilxEP5wazAvEZAoGAXHtu",
            "GnM8Tddgpg/6Fm1NeabXnCuHkw3HNBKd3jOk/EGFDiNFwGn1xlkh7pbjCeuMeNry",
            "8msv3TOXEh+Du92CQ523eaJpc+wrA4TWXh8YH+h3kmBoBBUzkbVbPGsRFKcTXdS/",
            "isIknSZweNyjYj9DejlJimEHrZe1Cwr5dP+Fp/UCgYAtbBPsD5XAecnH3QXi1EDf",
            "HgCcgUyqLrqMi/zaflRPkp+o3TTna0CcLO6KcoJsnDi9G7AFoF9xQaPr0u0Iu8VE",
            "e8PnANOSSyGt/7HN6WxUngiO7CXUy8EdEd2+Cyr17J+7I2dw3Ixs7TtvpTaU/Ihc",
            "ny4jzbYgcRg83wq1syequ+w==",
            "-----END PRIVATE KEY-----"
        ].join('\n');

        // 1. Consultar datos en Supabase
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
            return res.status(500).json({ error: 'Respuesta de Supabase no es JSON válido' });
        }

        if (!sbResponse.ok || !clientes || clientes.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado en Supabase' });
        }

        const cliente = clientes[0];
        const visitas = cliente.visitas_totales || 1;
        const nombreCliente = `${cliente.nombre || 'Cliente'} ${cliente.apellido || ''}`.trim();
        const telefonoLimpio = cliente.telefono.replace(/\D/g, '');

        const classId = `${issuerId}.MOOKAH_LOYALTY_PROGRAM`;
        const objectId = `${issuerId}.${telefonoLimpio}_MOOKAH_PASS`;

        const loyaltyObject = {
            id: objectId,
            classId: classId,
            state: 'ACTIVE',
            accountName: nombreCliente,
            accountId: telefonoLimpio,
            textModulesData: [
                {
                    header: 'PUNTOS / VISITAS',
                    body: `${visitas} Visita(s)`,
                    id: 'visitas'
                }
            ],
            barcode: {
                type: 'QR_CODE',
                value: telefonoLimpio,
                alternateText: telefonoLimpio
            }
        };

        // 2. Construir y firmar JWT correctamente con KEYUTIL limpio
        const header = { alg: 'RS256', typ: 'JWT' };
        const payload = {
            iss: clientEmail,
            aud: 'google',
            typ: 'savetowallet',
            iat: Math.floor(Date.now() / 1000),
            payload: {
                loyaltyObjects: [loyaltyObject]
            },
            origins: []
        };

        // Forzar la lectura limpia del PEM mediante KEYUTIL
        const rsaKey = jsrsasign.KEYUTIL.getKey(pemKey);
        const token = jsrsasign.jws.JWS.sign(null, JSON.stringify(header), JSON.stringify(payload), rsaKey);
        const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

        return res.status(200).json({ saveUrl });

    } catch (err) {
        return res.status(500).json({
            error: 'Error interno en la función',
            details: err.message
        });
    }
}
