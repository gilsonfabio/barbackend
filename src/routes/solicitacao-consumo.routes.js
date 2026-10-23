const express = require('express');

const routes = express.Router();

const SolicitacaoConsumoController = require(
    '../controllers/SolicitacaoConsumoController'
);

// Lista solicitações pendentes por padrão.
routes.get('/', SolicitacaoConsumoController.listar);

// Confirma e lança os itens na comanda.
routes.post(
    '/:id/confirmar',
    SolicitacaoConsumoController.confirmar
);

// Rejeita a solicitação sem lançar itens na comanda.
routes.post(
    '/:id/rejeitar',
    SolicitacaoConsumoController.rejeitar
);

module.exports = routes;
