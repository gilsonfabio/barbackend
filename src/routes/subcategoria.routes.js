const express = require('express');

const routes = express.Router();
const SubcategoriaController = require('../controllers/SubcategoriaController');

routes.get('/', SubcategoriaController.listar);
routes.get('/:id', SubcategoriaController.consultar);
routes.post('/', SubcategoriaController.cadastrar);
routes.put('/:id', SubcategoriaController.atualizar);
routes.patch('/:id/ativar', SubcategoriaController.alterarStatus);

module.exports = routes;
