const express = require('express');

const routes = express.Router();
const MesaController = require('../controllers/MesaController');

routes.get('/', MesaController.listar);
routes.get('/:id', MesaController.consultar);
routes.post('/', MesaController.cadastrar);
routes.post('/gerar-lote', MesaController.gerarLote);
routes.put('/:id', MesaController.atualizar);
routes.patch('/:id/ativar', MesaController.alterarStatus);

module.exports = routes;
