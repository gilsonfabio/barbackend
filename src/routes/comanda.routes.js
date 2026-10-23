const express = require('express');

const routes = express.Router();
const ComandaController = require('../controllers/ComandaController');

routes.get('/', ComandaController.listar);
routes.get('/:id', ComandaController.consultar);

routes.post('/', ComandaController.abrir);

routes.post('/:id/itens', ComandaController.adicionarItem);
routes.delete('/:id/itens/:itemId', ComandaController.removerItem);

routes.post('/:id/pagamentos', ComandaController.registrarPagamento);
routes.post('/:id/fechar', ComandaController.fechar);

module.exports = routes;
