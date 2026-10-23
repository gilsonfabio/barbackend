const express = require('express');
const routes = express.Router();

const PedidoAdminController = require('../controllers/PedidoAdminController');

routes.get('/', PedidoAdminController.listar);
routes.get('/:id', PedidoAdminController.consultar);
routes.patch('/:id/status', PedidoAdminController.atualizarStatus);

module.exports = routes;