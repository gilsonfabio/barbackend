
const express = require('express');

const routes = express.Router();
const CategoriaController = require('../controllers/CategoriaController');

routes.get('/', CategoriaController.listar);
routes.get('/:id', CategoriaController.consultar);
routes.post('/', CategoriaController.cadastrar);
routes.put('/:id', CategoriaController.atualizar);
routes.patch('/:id/ativar', CategoriaController.alterarStatus);

module.exports = routes;
