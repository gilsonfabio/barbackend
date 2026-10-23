
const express = require('express');

const routes = express.Router();

const CardapioController = require('../controllers/CardapioController');
const PedidoController = require('../controllers/PedidoController');
const SolicitacaoConsumoController = require('../controllers/SolicitacaoConsumoController');

// Consulta pública do cardápio por estabelecimento.
routes.get('/:slug', CardapioController.consultar);

// Fluxo antigo de pedidos — preservado.
routes.post('/:slug/pedidos', PedidoController.criarPublico);

// Novo fluxo: solicitação de consumo aguardando o garçom.
routes.post(
    '/:slug/solicitacoes-consumo',
    SolicitacaoConsumoController.criarPublico
);

module.exports = routes;
