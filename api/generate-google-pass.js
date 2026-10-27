import crypto from 'crypto';

function base64url(str) {
    return Buffer.from(str)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function getValidPrivateKey(rawKey) {
    if (!rawKey) throw new Error("GOOGLE_PRIVATE_KEY no está definida en Vercel");
    
    // Limpiar comillas iniciales o finales si las hubiera
    let key = rawKey.trim();
    if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = key.slice(1, -1).trim();
    }
    
    // Reemplazar saltos de línea escapados ('\n') por saltos de línea reales y eliminar retornos de carro
    key = key.replace(/\\n/g, '\n').replace(/\r/g, '');
    
    // Extraer limpiamente el cuerpo base64 de la llave sin importar cómo se haya pegado
    let base64Body = key
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\s+/g, '');
    
    // Reconstruir el formato PEM estándar con bloques exactos de 64 caracteres
    const chunks = base64Body.match(/.{1,64}/g) || [];
    return `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----`;
}

function signJwt(payload, privateKeyInput) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = base64url(JSON.stringify(header));
    const encodedPayload = base64url(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    // Obtener la llave normalizada
    const cleanPemKey = getValidPrivateKey(privateKeyInput);

    // Crear el objeto de llave privada nativo de Node.js de manera segura
    const privateKeyObject = crypto.createPrivateKey({
        key: cleanPemKey,
        format: 'pem'
    });

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(dataToSign);
    signer.end();

    const signature = signer.sign(privateKeyObject, 'base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    return `${dataToSign}.${signature}`;
}

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
        const clientEmail = (process.env.GOOGLE_CLIENT_EMAIL || '').trim();
        const privateKeyInput = process.env.GOOGLE_PRIVATE_KEY || '';
        const issuerId = (process.env.GOOGLE_ISSUER_ID || '').trim();

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: 'Faltan credenciales de Supabase' });
        }
        if (!clientEmail || !privateKeyInput || !issuerId) {
            return res.status(500).json({ error: 'Faltan credenciales de Google Wallet en Vercel' });
        }

        // 1. Consultar datos del cliente en Supabase
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

        // 2. Armar el objeto de lealtad de Google Wallet
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

        // 3. Crear Payload JWT para Google Wallet
        const now = Math.floor(Date.now() / 1000);
        const jwtPayload = {
            iss: clientEmail,
            aud: 'google',
            typ: 'savetowallet',
            iat: now,
            payload: {
                loyaltyObjects: [loyaltyObject]
            },
            origins: []
        };

        const token = signJwt(jwtPayload, privateKeyInput);
        const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

        return res.status(200).json({ saveUrl });

    } catch (err) {
        console.error("Error al generar el pase de Google Wallet:", err);
        return res.status(500).json({ error: 'Error interno en la función', details: err.message });
    }
}
