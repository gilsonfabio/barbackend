
const { Server } = require('socket.io');

let io;

function configurarSocket(server) {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.info(`Cliente conectado ao Socket.IO: ${socket.id}`);

        socket.on('disconnect', () => {
            console.info(`Cliente desconectado: ${socket.id}`);
        });
    });

    return io;
}

function obterSocket() {
    if (!io) {
        throw new Error('Socket.IO ainda não foi inicializado.');
    }

    return io;
}

module.exports = {
    configurarSocket,
    obterSocket
};
