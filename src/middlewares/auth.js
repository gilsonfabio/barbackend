
const jwt = require('jsonwebtoken');

module.exports = function auth(request, response, next) {
    const cabecalho = request.headers.authorization;

    if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
        return response.status(401).json({
            status: false,
            message: 'Token de autenticação não informado.',
        });
    }

    const token = cabecalho.slice(7).trim();
    const segredo = process.env.JWT_SECRET;

    if (!segredo) {
        console.error('JWT_SECRET não configurado.');

        return response.status(500).json({
            status: false,
            message: 'A autenticação não está configurada.',
        });
    }

    try {
        const dados = jwt.verify(token, segredo);

        request.user = {
            id: dados.sub,
            perfil: dados.perfil,
            estabelecimentoId: dados.estabelecimentoId,
        };

        return next();
    } catch (erro) {
        return response.status(401).json({
            status: false,
            message: 'Token inválido ou expirado.',
        });
    }
};
