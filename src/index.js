require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');

const routes = require('./routes');
const { configurarSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use(routes);

configurarSocket(server);

app.use((error, request, response, next) => {
    console.error('Erro na API:', error);

    if (response.headersSent) {
        return next(error);
    }

    return response.status(500).json({
        status: false,
        message: 'Erro interno do servidor.'
    });
});

const port = Number(process.env.PORT) || 3333;

server.listen(port, '0.0.0.0', () => {
    console.info(`MenuVivo API rodando na porta ${port}`);
});

async function encerrarServidor(signal) {
    console.info(`Recebido ${signal}. Encerrando servidor...`);

    server.close(() => {
        console.info('Servidor encerrado.');
        process.exit(0);
    });

    setTimeout(() => {
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => encerrarServidor('SIGTERM'));
process.on('SIGINT', () => encerrarServidor('SIGINT'));
