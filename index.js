require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'soundwave',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
});

redisClient.on('error', (err) => console.log('Error en Redis Client', err));
redisClient.connect().then(() => console.log('Conectado exitosamente a Redis'));

function duracionASegundos(duracion) {
    if (typeof duracion === 'number') return duracion;
    if (!duracion) return 0;

    const texto = String(duracion);
    const partes = texto.split(':').map(Number);

    if (partes.length === 3) {
        return partes[0] * 3600 + partes[1] * 60 + partes[2];
    }
    if (partes.length === 2) {
        return partes[0] * 60 + partes[1];
    }
    return 0;
}

function mapCatalogoRow(row) {
    return {
        titulo: row.cancion_titulo,
        duracion_segundos: row.duracion_segundos ?? duracionASegundos(row.duracion),
        artista: row.artista_nombre,
        genero: row.genero_nombre,
    };
}

app.get('/api/catalogo', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const cacheKey = `catalogo:page:${page}:limit:${limit}`;

        const cachedData = await redisClient.get(cacheKey);

        if (cachedData) {
            console.log(`Sirviendo página ${page} desde Redis`);
            return res.json(JSON.parse(cachedData));
        }

        console.log(`Sirviendo página ${page} desde PostgreSQL (Disco)`);
        const result = await pool.query(
            'SELECT * FROM obtener_catalogo_completo() LIMIT $1 OFFSET $2',
            [limit, offset]
        );

        const datos = result.rows.map(mapCatalogoRow);

        await redisClient.setEx(cacheKey, 60, JSON.stringify(datos));

        res.json(datos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno en el servidor' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor SoundWave corriendo en http://localhost:${PORT}`);
});
