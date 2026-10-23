const db = require('../database/connection');

const TRANSICOES = {
    NOVO: ['CONFIRMADO', 'CANCELADO'],
    CONFIRMADO: ['EM_PREPARO', 'CANCELADO'],
    EM_PREPARO: ['PRONTO', 'CANCELADO'],
    PRONTO: ['ENTREGUE'],
    ENTREGUE: [],
    CANCELADO: [],
};

module.exports = {
    async listar(request, response) {
        try {
            const estabelecimentoId = request.estabelecimentoId;
            const { status } = request.query;

            let consulta = db('mv_pedidos as p')
                .leftJoin('mv_mesas as m', 'm.id', 'p.mesa_id')
                .where('p.estabelecimento_id', estabelecimentoId)
                .select(
                    'p.id',
                    'p.codigo',
                    'p.cliente_nome',
                    'p.origem',
                    'p.status',
                    'p.subtotal',
                    'p.taxa_servico',
                    'p.desconto',
                    'p.total',
                    'p.observacao',
                    'p.created_at',
                    'p.updated_at',
                    'p.mesa_id',
                    'm.numero as mesa_numero'
                )
                .orderBy('p.created_at', 'desc');

            if (status) {
                if (!Object.prototype.hasOwnProperty.call(TRANSICOES, status)) {
                    return response.status(400).json({
                        status: false,
                        message: 'Status de pedido inválido.',
                    });
                }

                consulta = consulta.where('p.status', status);
            }

            const pedidos = await consulta;

            return response.json({
                status: true,
                dados: pedidos,
            });
        } catch (erro) {
            console.error('Erro ao listar pedidos:', erro);

            return response.status(500).json({
                status: false,
                message: 'Erro ao consultar pedidos.',
            });
        }
    },

    async consultar(request, response) {
        try {
            const { id } = request.params;
            const estabelecimentoId = request.estabelecimentoId;

            const pedido = await db('mv_pedidos as p')
                .leftJoin('mv_mesas as m', 'm.id', 'p.mesa_id')
                .where('p.id', id)
                .andWhere('p.estabelecimento_id', estabelecimentoId)
                .select(
                    'p.*',
                    'm.numero as mesa_numero'
                )
                .first();

            if (!pedido) {
                return response.status(404).json({
                    status: false,
                    message: 'Pedido não encontrado.',
                });
            }

            const itens = await db('mv_itens_pedido')
                .where({ pedido_id: pedido.id })
                .select(
                    'id',
                    'produto_id',
                    'produto_nome',
                    'preco_unitario',
                    'quantidade',
                    'subtotal',
                    'observacao'
                );

            return response.json({
                status: true,
                dados: {
                    ...pedido,
                    itens,
                },
            });
        } catch (erro) {
            console.error('Erro ao consultar pedido:', erro);

            return response.status(500).json({
                status: false,
                message: 'Erro ao consultar pedido.',
            });
        }
    },

    async atualizarStatus(request, response) {
        try {
            const { id } = request.params;
            const { status: novoStatus } = request.body;
            const estabelecimentoId = request.estabelecimentoId;

            if (
                typeof novoStatus !== 'string' ||
                !Object.prototype.hasOwnProperty.call(TRANSICOES, novoStatus)
            ) {
                return response.status(400).json({
                    status: false,
                    message: 'Status informado inválido.',
                });
            }

            const resultado = await db.transaction(async (trx) => {
                const pedido = await trx('mv_pedidos')
                    .where({
                        id,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .forUpdate()
                    .first();

                if (!pedido) {
                    return {
                        erro: 404,
                        mensagem: 'Pedido não encontrado.',
                    };
                }

                if (pedido.status === novoStatus) {
                    return {
                        sucesso: true,
                        pedido: { ...pedido },
                    };
                }

                const permitidos = TRANSICOES[pedido.status] || [];

                if (!permitidos.includes(novoStatus)) {
                    return {
                        erro: 409,
                        mensagem: `Não é permitido alterar de ${pedido.status} para ${novoStatus}.`,
                    };
                }

                await trx('mv_pedidos')
                    .where({
                        id,
                        estabelecimento_id: estabelecimentoId,
                    })
                    .update({
                        status: novoStatus,
                        updated_at: trx.fn.now(),
                    });

                return {
                    sucesso: true,
                    pedido: {
                        ...pedido,
                        status: novoStatus,
                    },
                };
            });

            if (resultado.erro) {
                return response.status(resultado.erro).json({
                    status: false,
                    message: resultado.mensagem,
                });
            }

            return response.json({
                status: true,
                message: 'Status do pedido atualizado.',
                dados: resultado.pedido,
            });
        } catch (erro) {
            console.error('Erro ao atualizar status do pedido:', erro);

            return response.status(500).json({
                status: false,
                message: 'Erro ao atualizar o status do pedido.',
            });
        }
    },
};
