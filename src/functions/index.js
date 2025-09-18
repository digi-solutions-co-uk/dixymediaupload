// index.js (Firebase Functions v2 onRequest)
const { onRequest } = require('firebase-functions/v2/https');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const S3_ACCESS_TYPES = { READ: 'read', WRITE: 'write' };
const BUCKET = 'digisolutions-assets';
const REGION = 'eu-west-1';

exports.generatePresignedUrl = onRequest({ cors: true }, async (req, res) => {
    // Explicit CORS for allowed origins
    const origin = req.headers.origin;
    const allowed = ['http://localhost:5175', 'http://localhost:5173'];
    if (allowed.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { folderPath, operationType = S3_ACCESS_TYPES.READ } = body;
    if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });

     const accessKeyId = process.env.AWS_ACCESS_KEY_ID
     const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

     if (!accessKeyId || !secretAccessKey) {
         console.error('Missing AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY as secrets.')
         return res.status(500).json({ error: 'Missing AWS credentials on server' })
     }

    const s3Client = new S3Client({
        region: REGION,
        credentials: { accessKeyId, secretAccessKey },
    });

    try {
        const params = {
            Bucket: BUCKET,
            Key: folderPath,
            ...(operationType === S3_ACCESS_TYPES.WRITE
                ? { ContentType: 'application/json' }
                : {}),
        };
        const command = operationType === S3_ACCESS_TYPES.WRITE ? new PutObjectCommand(params) : new GetObjectCommand(params);
        const url = await getSignedUrl(s3Client, command, { expiresIn: 20 });
        return res.status(200).json({ url });
    } catch (error) {
        const message = error && error.message ? error.message : String(error)
        console.error('Error generating pre-signed URL:', message)
        return res.status(500).json({ error: 'Error generating pre-signed URL', message })
    }
});

// Server-side write to avoid S3 CORS entirely
exports.writeAllMedia = onRequest({ cors: true }, async (req, res) => {
    const origin = req.headers.origin;
    const allowed = ['http://localhost:5175', 'http://localhost:5173'];
    if (allowed.includes(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).send('');
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

     const accessKeyId = process.env.AWS_ACCESS_KEY_ID
     const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
     if (!accessKeyId || !secretAccessKey) {
         console.error('Missing AWS credentials.');
         return res.status(500).json({ error: 'Missing AWS credentials on server' });
     }

    const s3Client = new S3Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { items } = body; // expecting { items: [...] }
    if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'items must be an array' });
    }

    try {
        const putParams = {
            Bucket: BUCKET,
            Key: 'slideconfig/dixymedia/config/allmedia.json',
            Body: JSON.stringify(items),
            ContentType: 'application/json',
        };
        await s3Client.send(new PutObjectCommand(putParams));
        return res.status(200).json({ ok: true });
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        console.error('Error writing allmedia.json:', message);
        return res.status(500).json({ error: 'Write failed', message });
    }
});