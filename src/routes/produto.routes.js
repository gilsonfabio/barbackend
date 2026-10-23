const express = require('express');

const routes = express.Router();
const ProdutoController = require('../controllers/ProdutoController');

routes.get('/', ProdutoController.listar);
routes.get('/:id', ProdutoController.consultar);
routes.post('/', ProdutoController.cadastrar);
routes.put('/:id', ProdutoController.atualizar);
routes.patch('/:id/ativar', ProdutoController.alterarStatus);

module.exports = routes;
