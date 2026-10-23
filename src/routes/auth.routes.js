const express = require('express');

const routes = express.Router();
const AuthController = require('../controllers/AuthController');
const auth = require('../middlewares/auth');

const estabelecimento = require('../middlewares/estabelecimento');

routes.post('/cadastro', AuthController.cadastrar);
routes.post('/login', AuthController.login);

// Rota privada para testar a autenticação.
routes.get('/me', auth, estabelecimento, (request, response) => {
    return response.status(200).json({
        status: true,
        usuario: request.user,
    });
});

module.exports = routes;
